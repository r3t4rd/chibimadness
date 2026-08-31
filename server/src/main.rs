//! Bounded WebSocket presence server for the ChibiMadness desktop demo.
//!
//! This server owns player presence, validates and rate-limits movement, and
//! relays bounded chat. It deliberately does not accept client-authoritative
//! monster damage, drops, inventory, or progression; those need server-side
//! simulation before they can safely become shared state.

use std::{
    collections::{HashMap, VecDeque},
    env,
    error::Error,
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{Mutex, mpsc},
};
use tokio_tungstenite::{
    accept_async_with_config,
    tungstenite::{Message, protocol::WebSocketConfig},
};

const WORLD_MIN_X: f64 = 50.0;
const WORLD_MAX_X: f64 = 5_350.0;
const WORLD_MIN_Y: f64 = 50.0;
const WORLD_MAX_Y: f64 = 4_350.0;
const HORDE_MIN_X: f64 = -11_200.0;
const HORDE_MIN_Y: f64 = -2_400.0;
const HORDE_MAX_X: f64 = -800.0;
const HORDE_MAX_Y: f64 = 6_800.0;
const HORDE_CENTER_X: f64 = -6_000.0;
const HORDE_CENTER_Y: f64 = 2_200.0;
const HORDE_EXTRACT_AFTER: f64 = 24.0;
const HORDE_ENTRY_GRACE: Duration = Duration::from_millis(2_500);
const LIFESTEAL_RATIO: f64 = 0.08;
const MAX_MESSAGE_BYTES: usize = 128 * 1024;
const MAX_CHAT_HISTORY: usize = 50;
const POSITION_INTERVAL: Duration = Duration::from_millis(50);
const WORLD_TICK: Duration = Duration::from_millis(20);
const WORLD_SNAPSHOT_INTERVAL: Duration = Duration::from_millis(50);
const MAX_WORLD_MONSTERS: usize = 256;
const MAX_WORLD_PROJECTILES: usize = 1_024;
const MAX_TRAVEL_PER_SECOND: f64 = 600.0;
const TRAVEL_BURST_ALLOWANCE: f64 = 60.0;
const OUTBOUND_QUEUE_CAPACITY: usize = 64;
const PLAYER_RESPAWN_DELAY: Duration = Duration::from_secs(3);
const PLAYER_RESPAWN_X: f64 = 650.0;
const PLAYER_RESPAWN_Y: f64 = 750.0;

static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_CHAT_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_PROJECTILE_ID: AtomicU64 = AtomicU64::new(1);

struct Server {
    state: Mutex<WorldState>,
    max_players: usize,
}

#[derive(Default)]
struct WorldState {
    sessions: HashMap<u64, Session>,
    players: HashMap<String, PlayerRecord>,
    chat_history: VecDeque<Value>,
    combat_world: Option<CombatWorld>,
    horde: Option<HordeRun>,
}

struct CombatWorld {
    monsters: HashMap<String, Value>,
    projectiles: Vec<Value>,
}

/// One shared Nullspace instance per server. A player explicitly joins it;
/// neither the client nor a random local timer may create monsters there.
struct HordeRun {
    participants: HashMap<String, (f64, f64)>,
    elapsed: f64,
    spawn_accumulator: f64,
    next_unlock_at: f64,
    next_boss_at: f64,
    unlocked_count: usize,
    boss_index: usize,
    sequence: u64,
}

struct Session {
    sender: mpsc::Sender<Outbound>,
    player_id: Option<String>,
    last_position: Instant,
}

enum Outbound {
    Text(String),
    Close,
}

struct PlayerRecord {
    session_id: u64,
    value: Value,
    respawn_at: Option<Instant>,
    immune_until: Option<Instant>,
    resume_token: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let options = ServerOptions::parse()?;
    let listener = TcpListener::bind(options.bind).await?;
    let server = Arc::new(Server {
        state: Mutex::new(WorldState::default()),
        max_players: options.max_players,
    });
    tokio::spawn(world_tick_loop(Arc::clone(&server)));

    println!(
        "ChibiMadness server listening on {} (max {} players)",
        listener.local_addr()?,
        options.max_players
    );

    loop {
        let (stream, peer) = listener.accept().await?;
        let server = Arc::clone(&server);
        tokio::spawn(async move {
            if let Err(error) = handle_connection(server, stream, peer).await {
                eprintln!("connection {peer} closed: {error}");
            }
        });
    }
}

struct ServerOptions {
    bind: SocketAddr,
    max_players: usize,
}

impl ServerOptions {
    fn parse() -> Result<Self, Box<dyn Error>> {
        let mut bind = "127.0.0.1:3010".parse()?;
        let mut max_players = 64;
        let mut arguments = env::args().skip(1);
        while let Some(argument) = arguments.next() {
            match argument.as_str() {
                "--bind" => {
                    bind = arguments
                        .next()
                        .ok_or("--bind requires an address")?
                        .parse()?
                }
                "--max-players" => {
                    max_players = arguments
                        .next()
                        .ok_or("--max-players requires a number")?
                        .parse()?;
                    if max_players == 0 || max_players > 512 {
                        return Err("--max-players must be between 1 and 512".into());
                    }
                }
                "--help" | "-h" => {
                    println!(
                        "Usage: chibimadness-server [--bind 127.0.0.1:3010] [--max-players 64]"
                    );
                    std::process::exit(0);
                }
                _ => return Err(format!("unknown argument {argument:?}").into()),
            }
        }
        Ok(Self { bind, max_players })
    }
}

async fn handle_connection(
    server: Arc<Server>,
    stream: TcpStream,
    peer: SocketAddr,
) -> Result<(), Box<dyn Error>> {
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_MESSAGE_BYTES))
        .max_frame_size(Some(MAX_MESSAGE_BYTES));
    let socket = accept_async_with_config(stream, Some(config)).await?;
    let session_id = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    let (sender, mut receiver) = mpsc::channel::<Outbound>(OUTBOUND_QUEUE_CAPACITY);
    {
        let mut state = server.state.lock().await;
        state.sessions.insert(
            session_id,
            Session {
                sender,
                player_id: None,
                last_position: Instant::now() - POSITION_INTERVAL,
            },
        );
    }

    let (mut writer, mut reader) = socket.split();
    let writer_task = tokio::spawn(async move {
        while let Some(outbound) = receiver.recv().await {
            match outbound {
                Outbound::Text(payload) => {
                    if writer.send(Message::Text(payload.into())).await.is_err() {
                        break;
                    }
                }
                Outbound::Close => {
                    let _ = writer.send(Message::Close(None)).await;
                    break;
                }
            }
        }
    });

    while let Some(message) = reader.next().await {
        match message? {
            Message::Text(text) => {
                if text.len() > MAX_MESSAGE_BYTES {
                    break;
                }
                let Ok(message) = serde_json::from_str::<Value>(&text) else {
                    continue;
                };
                process_message(&server, session_id, message).await;
            }
            Message::Ping(_) | Message::Pong(_) => {}
            Message::Close(_) => break,
            Message::Binary(_) | Message::Frame(_) => break,
        }
    }

    remove_session(&server, session_id).await;
    writer_task.abort();
    println!("player connection left: {peer}");
    Ok(())
}

async fn process_message(server: &Arc<Server>, session_id: u64, message: Value) {
    match message.get("type").and_then(Value::as_str) {
        Some("join") => join(server, session_id, message).await,
        Some("update_position") => update_position(server, session_id, message).await,
        Some("chat") => chat(server, session_id, message).await,
        // Actions can eventually be backed by server-side combat simulation.
        // The legacy client-authoritative combat/drop messages are intentionally ignored.
        Some("world_bootstrap") => world_bootstrap(server, session_id, message).await,
        Some("world_fire") => world_fire(server, session_id, message).await,
        Some("horde_enter") => enter_horde(server, session_id).await,
        Some("horde_extract") => extract_horde(server, session_id).await,
        Some("player_heal") => heal_player(server, session_id, message).await,
        Some("teleport") => teleport(server, session_id, message).await,
        Some("action")
        | Some("sync_monster_damage")
        | Some("sync_drop_spawn")
        | Some("sync_drop_pickup")
        | None => {}
        Some(_) => {}
    }
}

async fn join(server: &Arc<Server>, session_id: u64, message: Value) {
    let Some((player_id, player)) = message.get("player").and_then(sanitize_player) else {
        return;
    };
    let requested_resume_token = message
        .get("resumeToken")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let (recipients, init_payload, joined_payload, online_count, old_sender) = {
        let mut state = server.state.lock().await;
        let Some((already_joined, sender)) = state
            .sessions
            .get(&session_id)
            .map(|session| (session.player_id.is_some(), session.sender.clone()))
        else {
            return;
        };
        if already_joined {
            return;
        }

        let existing_session = state
            .players
            .get(&player_id)
            .map(|record| {
                (
                    record.session_id,
                    record.resume_token.clone(),
                    record.value.clone(),
                    record.respawn_at,
                )
            });
        if let Some((_, expected_token, _, _)) = &existing_session
            && requested_resume_token.as_deref() != Some(expected_token.as_str())
        {
            drop(state);
            reject_join(sender, "player_id_in_use");
            return;
        }
        if existing_session.is_none() && state.players.len() >= server.max_players {
            drop(state);
            reject_join(sender, "server_full");
            return;
        }

        let (resume_token, authoritative_player, respawn_at, old_sender) =
            if let Some((old_session_id, resume_token, player, respawn_at)) = existing_session {
                let old_sender = (old_session_id != session_id)
                    .then(|| state.sessions.remove(&old_session_id))
                    .flatten()
                    .map(|session| session.sender);
                // Reconnecting must retain the authoritative transform, HP,
                // and Nullspace membership. Replacing this value with the
                // client's last local save put a horde participant back in
                // the overworld and spawned its targets at invalid positions.
                (resume_token, player, respawn_at, old_sender)
            } else {
                let Some(resume_token) = new_resume_token() else {
                    drop(state);
                    reject_join(sender, "server_error");
                    return;
                };
                (resume_token, player, None, None)
            };
        let existing_players = state
            .players
            .iter()
            .filter(|(id, _)| id.as_str() != player_id.as_str())
            .map(|(_, player)| player.value.clone())
            .collect::<Vec<_>>();
        let recent_chat = state.chat_history.iter().cloned().collect::<Vec<_>>();
        let init_payload = json!({
            "type": "init_world",
            "players": existing_players,
            "recentChat": recent_chat,
            "resumeToken": resume_token,
        })
        .to_string();
        let joined_payload =
            json!({ "type": "player_joined", "player": authoritative_player }).to_string();
        state
            .sessions
            .get_mut(&session_id)
            .expect("session exists")
            .player_id = Some(player_id.clone());
        state.players.insert(
            player_id,
            PlayerRecord {
                session_id,
                value: authoritative_player,
                respawn_at,
                immune_until: None,
                resume_token,
            },
        );
        let recipients = recipients_except(&state, session_id);
        (
            recipients,
            init_payload,
            joined_payload,
            state.players.len(),
            old_sender,
        )
    };
    if let Some(old_sender) = old_sender {
        let _ = old_sender.try_send(Outbound::Close);
    }
    send_to_session(server, session_id, init_payload).await;
    send_to(recipients, joined_payload);
    println!("player joined ({online_count} online)");
}

async fn update_position(server: &Arc<Server>, session_id: u64, message: Value) {
    let now = Instant::now();
    let recipients_and_payload = {
        let mut state = server.state.lock().await;
        let Some(session) = state.sessions.get(&session_id) else {
            return;
        };
        let Some(player_id) = session.player_id.clone() else {
            return;
        };
        let elapsed = now.saturating_duration_since(session.last_position);
        if elapsed < POSITION_INTERVAL {
            return;
        }
        let Some(record) = state.players.get(&player_id) else {
            return;
        };
        let old_x = record.value["x"].as_f64().unwrap_or(WORLD_MIN_X);
        let old_y = record.value["y"].as_f64().unwrap_or(WORLD_MIN_Y);
        let in_horde = state
            .horde
            .as_ref()
            .is_some_and(|horde| horde.participants.contains_key(&player_id));
        // A transform is never a world-transition command. Right after a
        // horde_enter request a client can still have one coalesced overworld
        // movement packet in flight; treating it as an exit used to remove the
        // player (and often destroy a single-player run) immediately.
        // Explicit extract, death, disconnect, or a server-owned teleport are
        // the only valid ways to leave Nullspace.
        let (min_x, max_x, min_y, max_y) = if in_horde {
            (HORDE_MIN_X, HORDE_MAX_X, HORDE_MIN_Y, HORDE_MAX_Y)
        } else {
            (WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y)
        };
        let Some(x) = bounded_number(&message, "x", min_x, max_x) else {
            return;
        };
        let Some(y) = bounded_number(&message, "y", min_y, max_y) else {
            return;
        };
        let max_distance = elapsed.as_secs_f64() * MAX_TRAVEL_PER_SECOND + TRAVEL_BURST_ALLOWANCE;
        if (x - old_x).hypot(y - old_y) > max_distance {
            return;
        }
        let vx = bounded_number(&message, "vx", -700.0, 700.0).unwrap_or(0.0);
        let vy = bounded_number(&message, "vy", -700.0, 700.0).unwrap_or(0.0);
        let facing = matches!(message.get("facing").and_then(Value::as_str), Some("left"))
            .then_some("left")
            .unwrap_or("right");
        let state_name = match message.get("state").and_then(Value::as_str) {
            Some("walk" | "attack" | "dodge" | "riding" | "cast" | "dead") => {
                message["state"].as_str().expect("validated")
            }
            _ => "idle",
        };
        // Once combat has begun, HP is server-owned. Movement packets remain
        // client input only; accepting their HP field would let a damaged
        // client instantly heal itself on its next 30 Hz update.
        let combat_world_ready = state.combat_world.is_some();
        let (hp, max_hp, level, is_riding, active_vehicle_id) = {
            let record = state.players.get_mut(&player_id).expect("player exists");
            record.value["x"] = json!(x);
            record.value["y"] = json!(y);
            record.value["vx"] = json!(vx);
            record.value["vy"] = json!(vy);
            record.value["facing"] = json!(facing);
            record.value["state"] = json!(state_name);
            record.value["maxHp"] = json!(
                bounded_number(&message, "maxHp", 1.0, 100_000.0)
                    .unwrap_or_else(|| record.value["maxHp"].as_f64().unwrap_or(100.0))
            );
            if !combat_world_ready {
                record.value["hp"] = json!(
                    bounded_number(&message, "hp", 0.0, 100_000.0)
                        .unwrap_or_else(|| record.value["hp"].as_f64().unwrap_or(100.0))
                );
            } else {
                let max_hp_val = record.value["maxHp"].as_f64().unwrap_or(100.0).max(1.0);
                let current_hp = record.value["hp"].as_f64().unwrap_or(100.0);
                if current_hp > max_hp_val {
                    record.value["hp"] = json!(max_hp_val);
                }
            }
            record.value["level"] = json!(
                bounded_number(&message, "level", 1.0, 1_000.0)
                    .unwrap_or_else(|| record.value["level"].as_f64().unwrap_or(1.0))
                    .floor()
            );
            record.value["isRiding"] = json!(
                message
                    .get("isRiding")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            );
            record.value["activeVehicleId"] = message
                .get("activeVehicleId")
                .filter(|value| value.is_null() || value.as_str().is_some())
                .cloned()
                .unwrap_or(Value::Null);
            (
                record.value["hp"].clone(),
                record.value["maxHp"].clone(),
                record.value["level"].clone(),
                record.value["isRiding"].clone(),
                record.value["activeVehicleId"].clone(),
            )
        };
        state
            .sessions
            .get_mut(&session_id)
            .expect("session exists")
            .last_position = now;
        let payload = json!({
            "type": "player_moved", "id": player_id, "x": x, "y": y, "vx": vx, "vy": vy,
            "facing": facing, "state": state_name, "hp": hp, "maxHp": max_hp,
            "level": level, "isRiding": is_riding, "activeVehicleId": active_vehicle_id,
        })
        .to_string();
        Some((recipients_except(&state, session_id), payload))
    };
    if let Some((recipients, payload)) = recipients_and_payload {
        send_to(recipients, payload);
    }
}

async fn world_bootstrap(server: &Arc<Server>, session_id: u64, message: Value) {
    let Some(monsters) = message.get("monsters").and_then(Value::as_array) else {
        return;
    };
    let Some(monsters) = sanitize_world_monsters(monsters) else {
        return;
    };
    let (recipients, payload) = {
        let mut state = server.state.lock().await;
        if state
            .sessions
            .get(&session_id)
            .is_none_or(|session| session.player_id.is_none())
        {
            return;
        }
        if state.combat_world.is_none() {
            state.combat_world = Some(CombatWorld {
                monsters,
                projectiles: Vec::new(),
            });
        }
        let payload = world_snapshot(&state);
        (recipients_except(&state, 0), payload)
    };
    send_to(recipients, payload);
}

async fn world_fire(server: &Arc<Server>, session_id: u64, message: Value) {
    let (recipients, payload) = {
        let mut state = server.state.lock().await;
        let Some(player_id) = state
            .sessions
            .get(&session_id)
            .and_then(|session| session.player_id.clone())
        else {
            return;
        };
        let Some(player) = state.players.get(&player_id) else {
            return;
        };
        let Some(projectile) =
            sanitize_player_projectile(message.get("projectile"), &player_id, &player.value)
        else {
            return;
        };
        {
            let Some(world) = state.combat_world.as_mut() else {
                return;
            };
            if world.projectiles.len() >= MAX_WORLD_PROJECTILES {
                return;
            }
            world.projectiles.push(projectile);
        }
        (recipients_except(&state, 0), world_snapshot(&state))
    };
    send_to(recipients, payload);
}

async fn enter_horde(server: &Arc<Server>, session_id: u64) {
    let (recipients, payload) = {
        let mut state = server.state.lock().await;
        if state.combat_world.is_none() {
            println!("Nullspace rejected: combat world is not initialized yet");
            return;
        }
        let Some(player_id) = state
            .sessions
            .get(&session_id)
            .and_then(|session| session.player_id.clone())
        else {
            return;
        };
        let Some(player) = state.players.get(&player_id) else {
            return;
        };
        let return_point = (
            number(&player.value, "x", WORLD_MIN_X).clamp(WORLD_MIN_X, WORLD_MAX_X),
            number(&player.value, "y", WORLD_MIN_Y).clamp(WORLD_MIN_Y, WORLD_MAX_Y),
        );
        let horde = state.horde.get_or_insert_with(|| HordeRun {
            participants: HashMap::new(),
            elapsed: 0.0,
            spawn_accumulator: 0.0,
            next_unlock_at: 20.0,
            next_boss_at: 60.0,
            unlocked_count: 1,
            boss_index: 0,
            sequence: 1,
        });
        let entering_for_first_time = !horde.participants.contains_key(&player_id);
        horde.participants.entry(player_id.clone()).or_insert(return_point);
        if entering_for_first_time {
            println!("Nullspace: {player_id} entered");
        }
        let player = state.players.get_mut(&player_id).expect("player exists");
        player.value["x"] = json!(HORDE_CENTER_X);
        player.value["y"] = json!(HORDE_CENTER_Y);
        player.value["vx"] = json!(0.0);
        player.value["vy"] = json!(0.0);
        player.value["currentZone"] = json!("horde_crucible");
        let max_hp = number(&player.value, "maxHp", 100.0).max(1.0);
        set_number(&mut player.value, "hp", max_hp);
        player.immune_until = Some(Instant::now() + HORDE_ENTRY_GRACE);
        (recipients_except(&state, 0), world_snapshot(&state))
    };
    send_to(recipients, payload);
}

async fn extract_horde(server: &Arc<Server>, session_id: u64) {
    let (recipients, payload) = {
        let mut state = server.state.lock().await;
        let Some(player_id) = state
            .sessions
            .get(&session_id)
            .and_then(|session| session.player_id.clone())
        else {
            return;
        };
        let Some(horde) = state.horde.as_mut() else {
            return;
        };
        if horde.elapsed < HORDE_EXTRACT_AFTER {
            return;
        }
        let Some((return_x, return_y)) = horde.participants.remove(&player_id) else {
            return;
        };
        println!("Nullspace: {player_id} extracted");
        let should_close = horde.participants.is_empty();
        let player = state.players.get_mut(&player_id).expect("player exists");
        player.value["x"] = json!(return_x);
        player.value["y"] = json!(return_y);
        player.value["vx"] = json!(0.0);
        player.value["vy"] = json!(0.0);
        player.value["currentZone"] = Value::Null;
        if should_close {
            state.horde = None;
            if let Some(world) = state.combat_world.as_mut() {
                world
                    .monsters
                    .retain(|_, monster| !is_horde_monster(monster));
                world
                    .projectiles
                    .retain(|projectile| !is_horde_projectile(projectile));
            }
        }
        (recipients_except(&state, 0), world_snapshot(&state))
    };
    send_to(recipients, payload);
}

async fn heal_player(server: &Arc<Server>, session_id: u64, message: Value) {
    let Some(amount) = message.get("amount").and_then(Value::as_f64) else {
        return;
    };
    if amount <= 0.0 || amount > 100_000.0 {
        return;
    }
    let snapshot = {
        let mut state = server.state.lock().await;
        let Some(player_id) = state
            .sessions
            .get(&session_id)
            .and_then(|session| session.player_id.clone())
        else {
            return;
        };
        let Some(player) = state.players.get_mut(&player_id) else {
            return;
        };
        let max_hp = number(&player.value, "maxHp", 100.0).max(1.0);
        let hp = number(&player.value, "hp", 100.0);
        let next_hp = (hp + amount).min(max_hp);
        set_number(&mut player.value, "hp", next_hp);

        // Health is authoritative once combat starts. Confirm a successful
        // heal immediately instead of making the UI wait for the next periodic
        // world snapshot and appear to roll the heal back.
        (recipients_except(&state, 0), world_snapshot(&state))
    };
    send_to(snapshot.0, snapshot.1);
}

async fn teleport(server: &Arc<Server>, session_id: u64, message: Value) {
    let Some(x) = message.get("x").and_then(Value::as_f64) else {
        return;
    };
    let Some(y) = message.get("y").and_then(Value::as_f64) else {
        return;
    };
    let (recipients, payload) = {
        let mut state = server.state.lock().await;
        let Some(player_id) = state
            .sessions
            .get(&session_id)
            .and_then(|session| session.player_id.clone())
        else {
            return;
        };
        let in_horde = state
            .horde
            .as_ref()
            .is_some_and(|horde| horde.participants.contains_key(&player_id));
        let target_in_horde = is_horde_coordinate(x, y);

        if in_horde && !target_in_horde {
            if let Some(horde) = state.horde.as_mut() {
                horde.participants.remove(&player_id);
                let should_close = horde.participants.is_empty();
                if should_close {
                    state.horde = None;
                    if let Some(world) = state.combat_world.as_mut() {
                        world
                            .monsters
                            .retain(|_, monster| !is_horde_monster(monster));
                        world
                            .projectiles
                            .retain(|projectile| !is_horde_projectile(projectile));
                    }
                }
            }
        }

        let (min_x, max_x, min_y, max_y) = if target_in_horde {
            (HORDE_MIN_X, HORDE_MAX_X, HORDE_MIN_Y, HORDE_MAX_Y)
        } else {
            (WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y)
        };
        let clamped_x = x.clamp(min_x, max_x);
        let clamped_y = y.clamp(min_y, max_y);

        if let Some(player) = state.players.get_mut(&player_id) {
            set_number(&mut player.value, "x", clamped_x);
            set_number(&mut player.value, "y", clamped_y);
            set_number(&mut player.value, "vx", 0.0);
            set_number(&mut player.value, "vy", 0.0);
            if target_in_horde {
                player.value["currentZone"] = json!("horde_crucible");
            } else {
                player.value["currentZone"] = Value::Null;
            }
        }
        (recipients_except(&state, 0), world_snapshot(&state))
    };
    send_to(recipients, payload);
}

async fn world_tick_loop(server: Arc<Server>) {
    let mut interval = tokio::time::interval(WORLD_TICK);
    let mut last_snapshot = Instant::now() - WORLD_SNAPSHOT_INTERVAL;
    loop {
        interval.tick().await;
        let snapshot = {
            let mut state = server.state.lock().await;
            if state.combat_world.is_none() || state.players.is_empty() {
                continue;
            }
            tick_player_respawns(&mut state);
            tick_horde_director(&mut state);
            tick_combat_world(&mut state);
            if last_snapshot.elapsed() < WORLD_SNAPSHOT_INTERVAL {
                None
            } else {
                last_snapshot = Instant::now();
                Some((recipients_except(&state, 0), world_snapshot(&state)))
            }
        };
        if let Some((recipients, payload)) = snapshot {
            send_to(recipients, payload);
        }
    }
}

/// Keeps death and respawn authoritative. A client may animate the countdown,
/// but it cannot revive itself by sending a new HP value in a movement packet.
fn tick_player_respawns(state: &mut WorldState) {
    let now = Instant::now();
    let newly_dead = state
        .players
        .iter_mut()
        .filter_map(|(id, player)| {
            if number(&player.value, "hp", 0.0) > 0.0 || player.respawn_at.is_some() {
                return None;
            }
            player.respawn_at = Some(now + PLAYER_RESPAWN_DELAY);
            set_string(&mut player.value, "state", "dead");
            Some(id.clone())
        })
        .collect::<Vec<_>>();

    // Death ends only the fallen player's run; other participants keep their
    // shared Nullspace session. The player is returned to their entrance point
    // while dead, then revived at the safe camp after the server timer.
    let mut horde_returns = Vec::new();
    let close_horde = if let Some(horde) = state.horde.as_mut() {
        for player_id in &newly_dead {
            if let Some(return_point) = horde.participants.remove(player_id) {
                horde_returns.push((player_id.clone(), return_point));
            }
        }
        horde.participants.is_empty()
    } else {
        false
    };
    for (player_id, (x, y)) in horde_returns {
        if let Some(player) = state.players.get_mut(&player_id) {
            set_number(&mut player.value, "x", x);
            set_number(&mut player.value, "y", y);
            set_number(&mut player.value, "vx", 0.0);
            set_number(&mut player.value, "vy", 0.0);
            player.value["currentZone"] = Value::Null;
        }
        println!("Nullspace: {player_id} died and left the run");
    }
    if close_horde {
        state.horde = None;
        if let Some(world) = state.combat_world.as_mut() {
            world.monsters.retain(|_, monster| !is_horde_monster(monster));
            world.projectiles.retain(|projectile| !is_horde_projectile(projectile));
        }
    }

    for player in state.players.values_mut() {
        if player.respawn_at.is_some_and(|at| at <= now) {
            let max_hp = number(&player.value, "maxHp", 100.0).max(1.0);
            set_number(&mut player.value, "hp", max_hp);
            set_number(&mut player.value, "x", PLAYER_RESPAWN_X);
            set_number(&mut player.value, "y", PLAYER_RESPAWN_Y);
            set_number(&mut player.value, "vx", 0.0);
            set_number(&mut player.value, "vy", 0.0);
            set_string(&mut player.value, "state", "idle");
            player.value["currentZone"] = Value::Null;
            player.respawn_at = None;
            println!("Player respawned at camp");
        }
    }
}

fn tick_horde_director(state: &mut WorldState) {
    let participant_ids = match state.horde.as_ref() {
        Some(horde) if !horde.participants.is_empty() => {
            horde.participants.keys().cloned().collect::<Vec<_>>()
        }
        _ => return,
    };
    let targets = participant_ids
        .iter()
        .filter_map(|id| {
            state.players.get(id).map(|player| {
                (
                    id.clone(),
                    number(&player.value, "x", HORDE_CENTER_X),
                    number(&player.value, "y", HORDE_CENTER_Y),
                )
            })
        })
        .collect::<Vec<_>>();
    if targets.is_empty() {
        return;
    }

    let (horde, world) = (
        state.horde.as_mut().expect("participants checked above"),
        state
            .combat_world
            .as_mut()
            .expect("world checked before tick"),
    );
    let step = WORLD_TICK.as_secs_f64();
    horde.elapsed += step;
    world
        .monsters
        .retain(|_, monster| !is_horde_monster(monster) || number(monster, "hp", 0.0) > 0.0);

    if horde.elapsed >= horde.next_unlock_at && horde.unlocked_count < 12 {
        horde.unlocked_count += 1;
        horde.next_unlock_at += 20.0;
    }
    let cap = (16 + (horde.elapsed / 9.0).floor() as usize).min(58);
    let live_count = world
        .monsters
        .values()
        .filter(|monster| is_horde_monster(monster) && number(monster, "hp", 0.0) > 0.0)
        .count();
    horde.spawn_accumulator += step * (0.95 + horde.elapsed * 0.032).min(5.4);
    let mut to_spawn = 0usize;
    while horde.spawn_accumulator >= 1.0 && live_count + to_spawn < cap {
        horde.spawn_accumulator -= 1.0;
        to_spawn += 1;
    }
    // The run starts with a visible ring instead of making players wait for
    // the first accumulator tick.
    if horde.elapsed < step * 2.0 {
        to_spawn = to_spawn.max(10).min(cap.saturating_sub(live_count));
    }
    for _ in 0..to_spawn {
        let kind = horde_kind(horde.unlocked_count, next_horde_random(horde));
        let monster = spawn_horde_monster(horde, &targets, kind);
        world.monsters.insert(
            monster["id"].as_str().expect("server id").to_owned(),
            monster,
        );
    }
    if horde.elapsed >= horde.next_boss_at {
        horde.next_boss_at += 60.0;
        let boss = spawn_horde_monster(horde, &targets, horde_boss_kind(horde.boss_index));
        horde.boss_index += 1;
        world
            .monsters
            .insert(boss["id"].as_str().expect("server id").to_owned(), boss);
    }
}

fn next_horde_random(horde: &mut HordeRun) -> f64 {
    horde.sequence = horde
        .sequence
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1);
    ((horde.sequence >> 11) as f64) / ((u64::MAX >> 11) as f64)
}

fn horde_kind(unlocked_count: usize, roll: f64) -> &'static str {
    const KINDS: [&str; 12] = [
        "shade",
        "mite",
        "raider",
        "laser",
        "shotgun",
        "bomber",
        "skycaller",
        "dasher",
        "sniper",
        "orbiter",
        "splitter",
        "blindcaster",
    ];
    KINDS[(roll * unlocked_count.clamp(1, KINDS.len()) as f64).floor() as usize]
}

fn horde_boss_kind(index: usize) -> &'static str {
    [
        "boss_titan",
        "boss_beam",
        "boss_skyfall",
        "boss_void",
        "boss_storm",
    ][index % 5]
}

fn spawn_horde_monster(horde: &mut HordeRun, targets: &[(String, f64, f64)], kind: &str) -> Value {
    let target = &targets[(next_horde_random(horde) * targets.len() as f64).floor() as usize];
    let angle = next_horde_random(horde) * std::f64::consts::TAU;
    let distance = 680.0 + next_horde_random(horde) * 260.0;
    let x = (target.1 + angle.cos() * distance).clamp(HORDE_MIN_X + 80.0, HORDE_MAX_X - 80.0);
    let y = (target.2 + angle.sin() * distance).clamp(HORDE_MIN_Y + 80.0, HORDE_MAX_Y - 80.0);
    let scale = 1.0 + horde.elapsed / 78.0;
    let (name, monster_type, hp, atk, speed, is_boss, weapon) = match kind {
        "mite" => ("Bit Mite", "forest_wolf", 18.0, 5.0, 3.6, false, "bat"),
        "raider" => (
            "Sys Raider",
            "bandit_grunt",
            62.0,
            11.0,
            2.4,
            false,
            "pistol",
        ),
        "laser" => (
            "Beam Acolyte",
            "cadet_mage",
            78.0,
            22.0,
            1.9,
            false,
            "staff",
        ),
        "shotgun" => (
            "Rack Scavenger",
            "bandit_shotgunner",
            96.0,
            15.0,
            2.2,
            false,
            "shotgun",
        ),
        "bomber" => (
            "Payload Imp",
            "punk_molotov",
            70.0,
            18.0,
            2.1,
            false,
            "molotov",
        ),
        "skycaller" => (
            "Skyfall Chanter",
            "cadet_mage",
            88.0,
            16.0,
            1.7,
            false,
            "staff",
        ),
        "dasher" => (
            "Kernel Dasher",
            "bandit_brawler",
            84.0,
            16.0,
            3.1,
            false,
            "blade",
        ),
        "sniper" => (
            "Port Sniper",
            "bandit_sniper",
            64.0,
            28.0,
            1.6,
            false,
            "cheytac",
        ),
        "orbiter" => ("Orbit Wisp", "cadet_mage", 72.0, 12.0, 2.0, false, "staff"),
        "splitter" => ("Fork Process", "punk_grunt", 58.0, 10.0, 2.3, false, "bat"),
        "blindcaster" => (
            "Void Priest",
            "cadet_mage",
            140.0,
            10.0,
            1.5,
            false,
            "staff",
        ),
        "boss_titan" => (
            "CORE TITAN",
            "punk_juggernaut",
            980.0,
            32.0,
            1.5,
            true,
            "sledgehammer",
        ),
        "boss_beam" => ("BEAMWEAVER", "cadet_mage", 820.0, 26.0, 1.4, true, "staff"),
        "boss_skyfall" => (
            "SKYFALL ARCHON",
            "cadet_mage",
            860.0,
            24.0,
            1.5,
            true,
            "staff",
        ),
        "boss_void" => (
            "NULL PROPHET",
            "cadet_mage",
            900.0,
            20.0,
            1.4,
            true,
            "staff",
        ),
        "boss_storm" => (
            "PACKET STORM",
            "punk_anarchist",
            780.0,
            18.0,
            1.8,
            true,
            "mac10",
        ),
        _ => ("Null Shade", "forest_wolf", 38.0, 8.0, 2.7, false, "bat"),
    };
    let id = format!("horde_{}", horde.sequence);
    json!({
        "id": id, "name": name, "type": monster_type, "zone": "horde_crucible", "hordeKind": kind,
        "x": x, "y": y, "spawnX": x, "spawnY": y, "maxHp": (hp * scale).round(), "hp": (hp * scale).round(),
        "atk": (atk * scale).round(), "speed": (speed + horde.elapsed * 0.004).min(5.4), "def": 0,
        "expReward": 0, "goldReward": 0, "faction": "wild", "state": "chase", "targetPlayerId": target.0,
        "attackCooldown": 0.3 + next_horde_random(horde) * 0.6, "specialCooldown": 0.0,
        "isBoss": is_boss, "isJuggernaut": kind == "boss_titan", "isHumanoid": monster_type != "forest_wolf", "weaponType": weapon,
    })
}

fn is_horde_monster(monster: &Value) -> bool {
    monster.get("zone").and_then(Value::as_str) == Some("horde_crucible")
}

fn is_horde_projectile(projectile: &Value) -> bool {
    let x = number(projectile, "x", WORLD_MIN_X);
    let y = number(projectile, "y", WORLD_MIN_Y);
    is_horde_coordinate(x, y)
}

fn is_horde_coordinate(x: f64, y: f64) -> bool {
    (HORDE_MIN_X..=HORDE_MAX_X).contains(&x) && (HORDE_MIN_Y..=HORDE_MAX_Y).contains(&y)
}

fn is_ranged_horde_kind(kind: &str) -> bool {
    matches!(
        kind,
        "raider"
            | "laser"
            | "shotgun"
            | "bomber"
            | "skycaller"
            | "sniper"
            | "orbiter"
            | "blindcaster"
            | "boss_beam"
            | "boss_skyfall"
            | "boss_void"
            | "boss_storm"
    )
}

fn player_cannot_be_hurt(player: &PlayerRecord, now: Instant) -> bool {
    player.immune_until.is_some_and(|until| until > now)
        || player.value.get("state").and_then(Value::as_str) == Some("dodge")
}

fn projectile_delta() -> f64 {
    WORLD_TICK.as_secs_f64() * 60.0
}

fn monster_move_delta() -> f64 {
    WORLD_TICK.as_secs_f64() * 40.0
}

fn tick_combat_world(state: &mut WorldState) {
    let now = Instant::now();
    let step = monster_move_delta();
    let shot_step = projectile_delta();
    let players = state
        .players
        .iter()
        .filter(|(_, player)| number(&player.value, "hp", 0.0) > 0.0)
        .map(|(id, player)| {
            (
                id.clone(),
                number(&player.value, "x", WORLD_MIN_X),
                number(&player.value, "y", WORLD_MIN_Y),
                state
                    .horde
                    .as_ref()
                    .is_some_and(|horde| horde.participants.contains_key(id)),
                player_cannot_be_hurt(player, now),
            )
        })
        .collect::<Vec<_>>();
    let (player_records, world) = (
        &mut state.players,
        state
            .combat_world
            .as_mut()
            .expect("combat world checked before tick"),
    );
    let mut enemy_projectiles = Vec::new();
    let mut melee_hits = Vec::new();
    for monster in world.monsters.values_mut() {
        let hp = number(monster, "hp", 0.0);
        if hp <= 0.0 {
            continue;
        }
        let x = number(monster, "x", WORLD_MIN_X);
        let y = number(monster, "y", WORLD_MIN_Y);
        let monster_is_horde = is_horde_monster(monster);
        let Some((target_id, target_x, target_y, _, target_immune)) = players
            .iter()
            .filter(|player| player.3 == monster_is_horde)
            .min_by(|left, right| {
                let left_distance = (left.1 - x).hypot(left.2 - y);
                let right_distance = (right.1 - x).hypot(right.2 - y);
                left_distance
                    .partial_cmp(&right_distance)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
        else {
            continue;
        };
        let dx = target_x - x;
        let dy = target_y - y;
        let distance = dx.hypot(dy).max(1.0);
        let speed = number(monster, "speed", 2.0).clamp(0.5, 6.0);
        let (min_x, max_x, min_y, max_y) = if monster_is_horde {
            (HORDE_MIN_X, HORDE_MAX_X, HORDE_MIN_Y, HORDE_MAX_Y)
        } else {
            (WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y)
        };
        if distance < 900.0 && distance > 92.0 {
            set_number(
                monster,
                "x",
                (x + dx / distance * speed * step).clamp(min_x, max_x),
            );
            set_number(
                monster,
                "y",
                (y + dy / distance * speed * step).clamp(min_y, max_y),
            );
            set_string(monster, "state", "chase");
            set_string(monster, "facing", if dx < 0.0 { "left" } else { "right" });
        } else if distance <= 92.0 {
            set_string(monster, "state", "attack");
        } else {
            set_string(monster, "state", "idle");
        }
        set_string(monster, "targetPlayerId", target_id.as_str());
        let cooldown = (number(monster, "attackCooldown", 0.0) - WORLD_TICK.as_secs_f64()).max(0.0);
        let kind = monster
            .get("hordeKind")
            .and_then(Value::as_str)
            .unwrap_or("");
        if target_immune {
            set_number(monster, "attackCooldown", cooldown.max(0.35));
            continue;
        }
        if monster_is_horde && !is_ranged_horde_kind(kind) {
            if distance <= 92.0 && cooldown <= 0.0 {
                set_number(monster, "attackCooldown", 1.1);
                melee_hits.push((
                    target_id.clone(),
                    number(monster, "atk", 12.0).clamp(4.0, 80.0),
                ));
            } else {
                set_number(monster, "attackCooldown", cooldown);
            }
        } else if distance < 520.0 && cooldown <= 0.0 {
            set_number(monster, "attackCooldown", 1.6);
            enemy_projectiles.push(make_enemy_projectile(monster, target_x, target_y));
        } else {
            set_number(monster, "attackCooldown", cooldown);
        }
    }
    for (player_id, damage) in melee_hits {
        if let Some(player) = player_records.get_mut(&player_id) {
            if player_cannot_be_hurt(player, now) {
                continue;
            }
            let hp = (number(&player.value, "hp", 100.0) - damage).max(0.0);
            set_number(&mut player.value, "hp", hp);
        }
    }
    world.projectiles.extend(enemy_projectiles);
    let mut remaining = Vec::with_capacity(world.projectiles.len());
    for mut projectile in std::mem::take(&mut world.projectiles) {
        let x = number(&projectile, "x", 0.0) + number(&projectile, "vx", 0.0) * shot_step;
        let y = number(&projectile, "y", 0.0) + number(&projectile, "vy", 0.0) * shot_step;
        let travelled = number(&projectile, "distanceTraveled", 0.0)
            + number(&projectile, "vx", 0.0).hypot(number(&projectile, "vy", 0.0)) * shot_step;
        set_number(&mut projectile, "x", x);
        set_number(&mut projectile, "y", y);
        set_number(&mut projectile, "distanceTraveled", travelled);
        let owner = projectile
            .get("ownerId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let damage = number(&projectile, "damage", 1.0).clamp(1.0, 250.0);
        let size = number(&projectile, "size", 4.0).clamp(2.0, 32.0);
        let mut consumed = false;
        if player_records.contains_key(&owner) {
            for monster in world.monsters.values_mut() {
                if number(monster, "hp", 0.0) <= 0.0
                    || monster.get("id").and_then(Value::as_str) == Some(owner.as_str())
                {
                    continue;
                }
                if (number(monster, "x", 0.0) - x).hypot(number(monster, "y", 0.0) - y)
                    <= 30.0 + size
                {
                    let next_hp = (number(monster, "hp", 0.0) - damage).max(0.0);
                    set_number(monster, "hp", next_hp);
                    set_number(monster, "hitFlash", 0.2);
                    monster["damagedByPlayer"] = json!(true);
                    if next_hp <= 0.0 {
                        set_string(monster, "state", "dead");
                    }
                    if let Some(player) = player_records.get_mut(&owner) {
                        if number(&player.value, "hp", 0.0) > 0.0 {
                            let max_hp = number(&player.value, "maxHp", 100.0).max(1.0);
                            let heal = (damage * LIFESTEAL_RATIO).max(1.0);
                            set_number(
                                &mut player.value,
                                "hp",
                                (number(&player.value, "hp", 0.0) + heal).min(max_hp),
                            );
                        }
                    }
                    consumed = true;
                    break;
                }
            }
        } else {
            for player in player_records.values_mut() {
                if player_cannot_be_hurt(player, now) {
                    continue;
                }
                if (number(&player.value, "x", 0.0) - x).hypot(number(&player.value, "y", 0.0) - y)
                    <= 26.0 + size
                {
                    let hp = (number(&player.value, "hp", 100.0) - damage).max(0.0);
                    set_number(&mut player.value, "hp", hp);
                    consumed = true;
                    break;
                }
            }
        }
        if !consumed && travelled < number(&projectile, "range", 600.0) {
            remaining.push(projectile);
        }
    }
    world.projectiles = remaining;
}

fn sanitize_world_monsters(values: &[Value]) -> Option<HashMap<String, Value>> {
    if values.is_empty() || values.len() > MAX_WORLD_MONSTERS {
        return None;
    }
    let mut monsters = HashMap::with_capacity(values.len());
    for value in values {
        let mut monster = value.as_object()?.clone();
        let id = monster.get("id")?.as_str()?.to_owned();
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        {
            return None;
        }
        let x = bounded_number(value, "x", WORLD_MIN_X, WORLD_MAX_X)?;
        let y = bounded_number(value, "y", WORLD_MIN_Y, WORLD_MAX_Y)?;
        let max_hp = bounded_number(value, "maxHp", 1.0, 100_000.0)?;
        monster.insert("x".into(), json!(x));
        monster.insert("y".into(), json!(y));
        monster.insert("spawnX".into(), json!(x));
        monster.insert("spawnY".into(), json!(y));
        monster.insert("maxHp".into(), json!(max_hp));
        monster.insert(
            "hp".into(),
            json!(bounded_number(value, "hp", 0.0, max_hp).unwrap_or(max_hp)),
        );
        monster.insert(
            "speed".into(),
            json!(bounded_number(value, "speed", 0.5, 6.0).unwrap_or(2.0)),
        );
        monster.insert(
            "atk".into(),
            json!(bounded_number(value, "atk", 1.0, 250.0).unwrap_or(12.0)),
        );
        monster.insert("state".into(), json!("idle"));
        monster.insert("attackCooldown".into(), json!(0.0));
        monster.insert("specialCooldown".into(), json!(0.0));
        monsters.insert(id, Value::Object(monster));
    }
    Some(monsters)
}

fn sanitize_player_projectile(
    value: Option<&Value>,
    owner_id: &str,
    player: &Value,
) -> Option<Value> {
    let value = value?.as_object()?;
    let player_x = number(player, "x", WORLD_MIN_X);
    let player_y = number(player, "y", WORLD_MIN_Y);
    let (min_x, max_x, min_y, max_y) = if is_horde_coordinate(player_x, player_y) {
        (HORDE_MIN_X, HORDE_MAX_X, HORDE_MIN_Y, HORDE_MAX_Y)
    } else {
        (WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y)
    };
    let requested_type = value.get("type").and_then(Value::as_str).unwrap_or("bullet");
    let x = bounded_number(&Value::Object(value.clone()), "x", min_x, max_x)?;
    let y = bounded_number(&Value::Object(value.clone()), "y", min_y, max_y)?;
    // Most projectiles originate at the caster. Targeted meteor and falling
    // sword skills originate above a selected point, which may legitimately
    // be within cast range instead of the weapon muzzle radius.
    let max_origin_distance = match requested_type {
        "meteor" | "falling_sword" => 1_000.0,
        _ => 100.0,
    };
    if (x - number(player, "x", 0.0)).hypot(y - number(player, "y", 0.0))
        > max_origin_distance
    {
        return None;
    }
    let kind = match requested_type {
        "laser" => ("laser", 48.0, 2_200.0),
        "slash_wave" => ("slash_wave", 28.0, 240.0),
        "magic_orb" | "fireball" | "meteor" => ("magic_orb", 34.0, 1_100.0),
        "thrown_knife" => ("thrown_knife", 30.0, 980.0),
        _ => ("bullet", 24.0, 1_500.0),
    };
    let vx = bounded_number(&Value::Object(value.clone()), "vx", -50.0, 50.0)?;
    let vy = bounded_number(&Value::Object(value.clone()), "vy", -50.0, 50.0)?;
    let size = bounded_number(&Value::Object(value.clone()), "size", 2.0, 32.0).unwrap_or(5.0);
    let color = value
        .get("color")
        .and_then(Value::as_str)
        .filter(|color| color.len() <= 16)
        .unwrap_or("#38BDF8");
    Some(json!({
        "id": format!("srv_projectile_{}", NEXT_PROJECTILE_ID.fetch_add(1, Ordering::Relaxed)),
        "ownerId": owner_id, "type": kind.0, "x": x, "y": y, "vx": vx, "vy": vy,
        "damage": kind.1, "range": kind.2, "distanceTraveled": 0.0, "color": color,
        "size": size, "piercing": kind.0 == "laser",
    }))
}

fn make_enemy_projectile(monster: &Value, target_x: &f64, target_y: &f64) -> Value {
    let x = number(monster, "x", 0.0);
    let y = number(monster, "y", 0.0);
    let distance = (target_x - x).hypot(target_y - y).max(1.0);
    json!({
        "id": format!("srv_projectile_{}", NEXT_PROJECTILE_ID.fetch_add(1, Ordering::Relaxed)),
        "ownerId": monster.get("id").and_then(Value::as_str).unwrap_or("mob"),
        "type": "enemy_bullet", "x": x, "y": y,
        "vx": (target_x - x) / distance * 18.0, "vy": (target_y - y) / distance * 18.0,
        "damage": number(monster, "atk", 12.0).clamp(4.0, 80.0), "range": 850.0,
        "distanceTraveled": 0.0, "color": "#EF4444", "size": 4.5,
    })
}

fn world_snapshot(state: &WorldState) -> String {
    let Some(world) = &state.combat_world else {
        return json!({ "type": "world_snapshot", "ready": false }).to_string();
    };
    json!({
        "type": "world_snapshot", "ready": true,
        "monsters": world.monsters.values().cloned().collect::<Vec<_>>(),
        "projectiles": world.projectiles,
        "players": state.players.values().map(|player| player.value.clone()).collect::<Vec<_>>(),
        "horde": horde_snapshot(state),
    })
    .to_string()
}

fn horde_snapshot(state: &WorldState) -> Value {
    let Some(horde) = &state.horde else {
        return json!({ "active": false });
    };
    json!({
        "active": true,
        "elapsed": horde.elapsed,
        "canExtract": horde.elapsed >= HORDE_EXTRACT_AFTER,
        "unlockedCount": horde.unlocked_count,
        "nextUnlockIn": (horde.next_unlock_at - horde.elapsed).max(0.0),
        "nextBossIn": (horde.next_boss_at - horde.elapsed).max(0.0),
        "bossIndex": horde.boss_index,
        "participants": horde.participants.keys().collect::<Vec<_>>(),
        "hazards": [],
    })
}

fn number(value: &Value, field: &str, fallback: f64) -> f64 {
    value
        .get(field)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(fallback)
}

fn set_number(value: &mut Value, field: &str, number: f64) {
    if let Some(object) = value.as_object_mut() {
        object.insert(field.to_owned(), json!(number));
    }
}

fn set_string(value: &mut Value, field: &str, string: &str) {
    if let Some(object) = value.as_object_mut() {
        object.insert(field.to_owned(), json!(string));
    }
}

async fn chat(server: &Arc<Server>, session_id: u64, message: Value) {
    let Some(text) = message
        .get("text")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty() && text.len() <= 280)
    else {
        return;
    };
    let payload = {
        let mut state = server.state.lock().await;
        let Some(session) = state.sessions.get(&session_id) else {
            return;
        };
        let Some(player_id) = &session.player_id else {
            return;
        };
        let Some(player) = state.players.get(player_id) else {
            return;
        };
        let channel = match message.get("channel").and_then(Value::as_str) {
            Some("local" | "party") => message["channel"].as_str().expect("validated"),
            _ => "all",
        };
        let chat = json!({
            "id": format!("chat_{}", NEXT_CHAT_ID.fetch_add(1, Ordering::Relaxed)),
            "senderId": player_id,
            "senderName": player.value["name"],
            "text": text,
            "channel": channel,
            "timestamp": unix_millis(),
        });
        state.chat_history.push_back(chat.clone());
        if state.chat_history.len() > MAX_CHAT_HISTORY {
            state.chat_history.pop_front();
        }
        (
            recipients_except(&state, 0),
            json!({ "type": "chat_message", "message": chat }).to_string(),
        )
    };
    send_to(payload.0, payload.1);
}

async fn remove_session(server: &Arc<Server>, session_id: u64) {
    let (recipients, payload) = {
        let mut state = server.state.lock().await;
        let Some(session) = state.sessions.remove(&session_id) else {
            return;
        };
        let Some(player_id) = session.player_id else {
            return;
        };
        let is_current = state
            .players
            .get(&player_id)
            .is_some_and(|player| player.session_id == session_id);
        if !is_current {
            return;
        }
        state.players.remove(&player_id);
        let should_close_horde = state.horde.as_mut().is_some_and(|horde| {
            horde.participants.remove(&player_id);
            horde.participants.is_empty()
        });
        if should_close_horde {
            state.horde = None;
            if let Some(world) = state.combat_world.as_mut() {
                world
                    .monsters
                    .retain(|_, monster| !is_horde_monster(monster));
                world
                    .projectiles
                    .retain(|projectile| !is_horde_projectile(projectile));
            }
        }
        (
            recipients_except(&state, 0),
            json!({ "type": "player_left", "id": player_id }).to_string(),
        )
    };
    send_to(recipients, payload);
}

fn sanitize_player(value: &Value) -> Option<(String, Value)> {
    let id = value.get("id")?.as_str()?;
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return None;
    }
    let name = value.get("name")?.as_str()?.trim();
    if name.is_empty() || name.len() > 24 {
        return None;
    }
    let x = bounded_number(value, "x", WORLD_MIN_X, WORLD_MAX_X)?;
    let y = bounded_number(value, "y", WORLD_MIN_Y, WORLD_MAX_Y)?;
    let character_class = match value.get("characterClass").and_then(Value::as_str) {
        Some("swordmaster") => "swordmaster",
        Some("cybermage") => "cybermage",
        _ => "gunslinger",
    };
    let chibi = value.get("chibi")?.as_object()?.clone();
    Some((
        id.to_owned(),
        json!({
            "id": id, "name": name, "characterClass": character_class, "chibi": chibi,
            "x": x, "y": y,
            "vx": bounded_number(value, "vx", -700.0, 700.0).unwrap_or(0.0),
            "vy": bounded_number(value, "vy", -700.0, 700.0).unwrap_or(0.0),
            "facing": if value.get("facing").and_then(Value::as_str) == Some("left") { "left" } else { "right" },
            "state": "idle", "hp": bounded_number(value, "hp", 0.0, 100_000.0).unwrap_or(100.0),
            "maxHp": bounded_number(value, "maxHp", 1.0, 100_000.0).unwrap_or(100.0),
            "level": bounded_number(value, "level", 1.0, 1_000.0).unwrap_or(1.0).floor(),
            "activeVehicleId": Value::Null, "isRiding": false,
            "equipment": value.get("equipment").filter(|equipment| equipment.is_object()).cloned().unwrap_or_else(|| json!({ "weapon": null, "headwear": null, "outfit": null, "vehicle": null, "accessory": null })),
        }),
    ))
}

fn bounded_number(value: &Value, field: &str, min: f64, max: f64) -> Option<f64> {
    let number = value.get(field)?.as_f64()?;
    (number.is_finite() && (min..=max).contains(&number)).then_some(number)
}

fn recipients_except(state: &WorldState, excluded_session: u64) -> Vec<mpsc::Sender<Outbound>> {
    state
        .sessions
        .iter()
        .filter(|(id, session)| **id != excluded_session && session.player_id.is_some())
        .map(|(_, session)| session.sender.clone())
        .collect()
}

async fn send_to_session(server: &Arc<Server>, session_id: u64, payload: String) {
    let sender = server
        .state
        .lock()
        .await
        .sessions
        .get(&session_id)
        .map(|session| session.sender.clone());
    if let Some(sender) = sender {
        let _ = sender.try_send(Outbound::Text(payload));
    }
}

fn send_to(recipients: Vec<mpsc::Sender<Outbound>>, payload: String) {
    for recipient in recipients {
        let _ = recipient.try_send(Outbound::Text(payload.clone()));
    }
}

fn reject_join(sender: mpsc::Sender<Outbound>, reason: &str) {
    let payload = json!({ "type": "join_rejected", "reason": reason }).to_string();
    let _ = sender.try_send(Outbound::Text(payload));
    let _ = sender.try_send(Outbound::Close);
}

fn new_resume_token() -> Option<String> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).ok()?;
    let mut token = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        token.push(HEX[(byte >> 4) as usize] as char);
        token.push(HEX[(byte & 0x0f) as usize] as char);
    }
    Some(token)
}

fn unix_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player(id: &str, x: f64, y: f64) -> Value {
        json!({
            "id": id, "name": id, "characterClass": "gunslinger", "chibi": {},
            "x": x, "y": y, "vx": 0, "vy": 0, "facing": "right", "state": "idle",
            "hp": 100, "maxHp": 100, "level": 1,
        })
    }

    async fn session(server: &Arc<Server>, id: u64) -> mpsc::Receiver<Outbound> {
        let (sender, receiver) = mpsc::channel(OUTBOUND_QUEUE_CAPACITY);
        server.state.lock().await.sessions.insert(
            id,
            Session {
                sender,
                player_id: None,
                last_position: Instant::now() - POSITION_INTERVAL,
            },
        );
        receiver
    }

    async fn recv_text(receiver: &mut mpsc::Receiver<Outbound>, description: &str) -> String {
        match receiver.recv().await.expect(description) {
            Outbound::Text(payload) => payload,
            Outbound::Close => panic!("expected {description}, received close"),
        }
    }

    #[test]
    fn player_join_rejects_invalid_identity_and_clamps_no_coordinates() {
        assert!(
            sanitize_player(
                &json!({ "id": "bad id", "name": "A", "x": 100, "y": 100, "chibi": {} })
            )
            .is_none()
        );
        assert!(
            sanitize_player(
                &json!({ "id": "good_id", "name": "A", "x": 5_401, "y": 100, "chibi": {} })
            )
            .is_none()
        );
        assert!(
            sanitize_player(
                &json!({ "id": "good_id", "name": "A", "x": 100, "y": 100, "chibi": {} })
            )
            .is_some()
        );
    }

    #[test]
    fn combat_tick_applies_server_projectile_damage_to_shared_monster() {
        let (_, player_value) =
            sanitize_player(&player("player_one", 100.0, 100.0)).expect("valid player");
        let monsters = sanitize_world_monsters(&[json!({
            "id": "monster_one", "x": 110.0, "y": 100.0,
            "hp": 100.0, "maxHp": 100.0, "speed": 1.0, "atk": 10.0,
        })])
        .expect("valid monster manifest");
        let mut state = WorldState::default();
        state.players.insert(
            "player_one".into(),
            PlayerRecord {
                session_id: 1,
                value: player_value,
                respawn_at: None,
                immune_until: None,
                resume_token: "test-token".into(),
            },
        );
        state.combat_world = Some(CombatWorld {
            monsters,
            projectiles: vec![json!({
                "id": "projectile_one", "ownerId": "player_one", "type": "bullet",
                "x": 110.0, "y": 100.0, "vx": 0.0, "vy": 0.0,
                "damage": 40.0, "range": 400.0, "distanceTraveled": 0.0,
                "color": "#fff", "size": 4.0,
            })],
        });

        tick_combat_world(&mut state);

        let world = state.combat_world.expect("world remains available");
        assert_eq!(
            number(
                world.monsters.get("monster_one").expect("monster"),
                "hp",
                0.0
            ),
            60.0
        );
        assert!(world.projectiles.is_empty());
    }

    #[test]
    fn targeted_skill_projectiles_are_accepted_within_cast_range() {
        let (_, player) = sanitize_player(&player("caster", 650.0, 750.0)).expect("valid player");
        let projectile = sanitize_player_projectile(
            Some(&json!({
                "type": "meteor", "x": 1_350.0, "y": 750.0,
                "vx": 0.0, "vy": 18.0, "size": 18.0, "color": "#FB7185"
            })),
            "caster",
            &player,
        )
        .expect("targeted meteor within cast range");
        assert_eq!(projectile["type"], "magic_orb");

        assert!(sanitize_player_projectile(
            Some(&json!({
                "type": "meteor", "x": 1_700.0, "y": 750.0,
                "vx": 0.0, "vy": 18.0, "size": 18.0, "color": "#FB7185"
            })),
            "caster",
            &player,
        )
        .is_none());
    }

    #[test]
    fn server_revives_dead_player_at_camp() {
        let (_, mut value) = sanitize_player(&player("downed", 100.0, 100.0)).expect("valid player");
        value["hp"] = json!(0.0);
        value["state"] = json!("dead");
        let mut state = WorldState::default();
        state.players.insert(
            "downed".into(),
            PlayerRecord {
                session_id: 1,
                value,
                respawn_at: Some(Instant::now() - Duration::from_millis(1)),
                immune_until: None,
                resume_token: "test-token".into(),
            },
        );

        tick_player_respawns(&mut state);

        let revived = state.players.get("downed").expect("player remains connected");
        assert_eq!(number(&revived.value, "hp", 0.0), 100.0);
        assert_eq!(number(&revived.value, "x", 0.0), PLAYER_RESPAWN_X);
        assert_eq!(number(&revived.value, "y", 0.0), PLAYER_RESPAWN_Y);
        assert_eq!(revived.value["state"], "idle");
        assert!(revived.respawn_at.is_none());
    }

    #[tokio::test]
    async fn server_replicates_join_and_rate_limited_valid_movement() {
        let server = Arc::new(Server {
            state: Mutex::new(WorldState::default()),
            max_players: 4,
        });
        let mut first = session(&server, 1).await;
        let mut second = session(&server, 2).await;
        join(
            &server,
            1,
            json!({ "player": player("first", 100.0, 100.0) }),
        )
        .await;
        let first_init = recv_text(&mut first, "first init").await;
        assert_eq!(
            serde_json::from_str::<Value>(&first_init).expect("json")["type"],
            "init_world"
        );

        join(
            &server,
            2,
            json!({ "player": player("second", 200.0, 100.0) }),
        )
        .await;
        let second_init = recv_text(&mut second, "second init").await;
        assert_eq!(
            serde_json::from_str::<Value>(&second_init).expect("json")["players"]
                .as_array()
                .expect("players")
                .len(),
            1
        );
        let joined = recv_text(&mut first, "joined").await;
        assert_eq!(
            serde_json::from_str::<Value>(&joined).expect("json")["type"],
            "player_joined"
        );

        update_position(
            &server,
            2,
            json!({
                "x": 220.0, "y": 100.0, "vx": 60.0, "vy": 0.0, "facing": "right", "state": "walk",
                "hp": 100, "maxHp": 100, "level": 1, "isRiding": false, "activeVehicleId": null,
            }),
        )
        .await;
        let moved = recv_text(&mut first, "movement").await;
        let moved = serde_json::from_str::<Value>(&moved).expect("json");
        assert_eq!(moved["type"], "player_moved");
        assert_eq!(moved["x"], 220.0);
    }

    #[tokio::test]
    async fn reconnect_requires_token_and_closes_replaced_session() {
        let server = Arc::new(Server {
            state: Mutex::new(WorldState::default()),
            max_players: 4,
        });
        let mut first = session(&server, 1).await;
        join(
            &server,
            1,
            json!({ "player": player("operator", 100.0, 100.0) }),
        )
        .await;
        let first_init = serde_json::from_str::<Value>(&recv_text(&mut first, "first init").await)
            .expect("init JSON");
        let resume_token = first_init["resumeToken"]
            .as_str()
            .expect("resume token")
            .to_owned();
        assert_eq!(resume_token.len(), 64);

        let mut attacker = session(&server, 2).await;
        join(
            &server,
            2,
            json!({ "player": player("operator", 200.0, 100.0) }),
        )
        .await;
        let rejected = serde_json::from_str::<Value>(&recv_text(&mut attacker, "rejection").await)
            .expect("rejection JSON");
        assert_eq!(rejected["type"], "join_rejected");
        assert_eq!(rejected["reason"], "player_id_in_use");
        assert!(matches!(attacker.recv().await, Some(Outbound::Close)));
        assert_eq!(
            server
                .state
                .lock()
                .await
                .players
                .get("operator")
                .expect("original player remains")
                .session_id,
            1
        );

        let mut resumed = session(&server, 3).await;
        join(
            &server,
            3,
            json!({
                "resumeToken": resume_token,
                "player": player("operator", 300.0, 100.0),
            }),
        )
        .await;
        assert!(matches!(first.recv().await, Some(Outbound::Close)));
        let resumed_init =
            serde_json::from_str::<Value>(&recv_text(&mut resumed, "resume init").await)
                .expect("resume JSON");
        assert_eq!(resumed_init["type"], "init_world");
        assert_eq!(
            server
                .state
                .lock()
                .await
                .players
                .get("operator")
                .expect("resumed player")
                .session_id,
            3
        );
        assert_eq!(
            number(
                &server
                    .state
                    .lock()
                    .await
                    .players
                    .get("operator")
                    .expect("resumed player")
                    .value,
                "x",
                0.0,
            ),
            100.0
        );
    }

    #[tokio::test]
    async fn nullspace_entry_creates_one_server_owned_run_and_wave() {
        let server = Arc::new(Server {
            state: Mutex::new(WorldState::default()),
            max_players: 4,
        });
        let mut receiver = session(&server, 1).await;
        join(
            &server,
            1,
            json!({ "player": player("pilot", 650.0, 750.0) }),
        )
        .await;
        let _ = recv_text(&mut receiver, "join init").await;
        world_bootstrap(
            &server,
            1,
            json!({ "monsters": [{
                "id": "overworld_mob", "x": 700.0, "y": 750.0,
                "hp": 100.0, "maxHp": 100.0, "speed": 1.0, "atk": 10.0
            }]}),
        )
        .await;
        let _ = recv_text(&mut receiver, "world bootstrap").await;

        enter_horde(&server, 1).await;
        let snapshot =
            serde_json::from_str::<Value>(&recv_text(&mut receiver, "horde snapshot").await)
                .expect("snapshot JSON");
        assert_eq!(snapshot["horde"]["active"], true);
        assert_eq!(snapshot["players"][0]["x"], HORDE_CENTER_X);

        let mut state = server.state.lock().await;
        tick_horde_director(&mut state);
        let world = state.combat_world.as_ref().expect("world");
        assert!(world.monsters.values().any(is_horde_monster));
    }

    #[tokio::test]
    async fn stale_overworld_movement_cannot_cancel_nullspace_entry() {
        let server = Arc::new(Server {
            state: Mutex::new(WorldState::default()),
            max_players: 4,
        });
        let mut receiver = session(&server, 1).await;
        join(
            &server,
            1,
            json!({ "player": player("pilot", 650.0, 750.0) }),
        )
        .await;
        let _ = receiver.recv().await.expect("join init");
        world_bootstrap(
            &server,
            1,
            json!({ "monsters": [{
                "id": "overworld_mob", "x": 700.0, "y": 750.0,
                "hp": 100.0, "maxHp": 100.0, "speed": 1.0, "atk": 10.0
            }]}),
        )
        .await;
        let _ = receiver.recv().await.expect("world bootstrap");

        enter_horde(&server, 1).await;
        let _ = receiver.recv().await.expect("horde snapshot");
        update_position(
            &server,
            1,
            json!({
                "x": 650.0, "y": 750.0, "vx": 0.0, "vy": 0.0,
                "facing": "right", "state": "idle", "hp": 100,
                "maxHp": 100, "level": 1, "isRiding": false,
                "activeVehicleId": null,
            }),
        )
        .await;

        let state = server.state.lock().await;
        assert!(
            state
                .horde
                .as_ref()
                .is_some_and(|horde| horde.participants.contains_key("pilot"))
        );
        let player = state
            .players
            .get("pilot")
            .expect("player remains connected");
        assert_eq!(number(&player.value, "x", 0.0), HORDE_CENTER_X);
        assert_eq!(number(&player.value, "y", 0.0), HORDE_CENTER_Y);
    }

    #[tokio::test]
    async fn heal_is_confirmed_by_an_immediate_authoritative_snapshot() {
        let server = Arc::new(Server {
            state: Mutex::new(WorldState::default()),
            max_players: 4,
        });
        let mut receiver = session(&server, 1).await;
        join(
            &server,
            1,
            json!({ "player": player("pilot", 650.0, 750.0) }),
        )
        .await;
        let _ = receiver.recv().await.expect("join init");
        world_bootstrap(
            &server,
            1,
            json!({ "monsters": [{
                "id": "overworld_mob", "x": 700.0, "y": 750.0,
                "hp": 100.0, "maxHp": 100.0, "speed": 1.0, "atk": 10.0
            }]}),
        )
        .await;
        let _ = receiver.recv().await.expect("world bootstrap");
        {
            let mut state = server.state.lock().await;
            state
                .players
                .get_mut("pilot")
                .expect("player")
                .value["hp"] = json!(40.0);
        }

        heal_player(&server, 1, json!({ "amount": 25.0 })).await;

        let snapshot = serde_json::from_str::<Value>(&recv_text(&mut receiver, "heal snapshot").await)
            .expect("snapshot JSON");
        assert_eq!(snapshot["type"], "world_snapshot");
        assert_eq!(snapshot["players"][0]["hp"], 65.0);
    }

    #[tokio::test]
    async fn nullspace_entry_restores_hp_and_grants_spawn_grace() {
        let server = Arc::new(Server {
            state: Mutex::new(WorldState::default()),
            max_players: 4,
        });
        let mut receiver = session(&server, 1).await;
        join(
            &server,
            1,
            json!({ "player": player("pilot", 650.0, 750.0) }),
        )
        .await;
        let _ = recv_text(&mut receiver, "join init").await;
        world_bootstrap(
            &server,
            1,
            json!({ "monsters": [{
                "id": "overworld_mob", "x": 700.0, "y": 750.0,
                "hp": 100.0, "maxHp": 100.0, "speed": 1.0, "atk": 10.0
            }]}),
        )
        .await;
        let _ = recv_text(&mut receiver, "world bootstrap").await;
        {
            let mut state = server.state.lock().await;
            state
                .players
                .get_mut("pilot")
                .expect("player")
                .value["hp"] = json!(12.0);
        }

        enter_horde(&server, 1).await;
        let snapshot =
            serde_json::from_str::<Value>(&recv_text(&mut receiver, "horde snapshot").await)
                .expect("snapshot JSON");
        assert_eq!(snapshot["players"][0]["hp"], 100.0);
        assert_eq!(snapshot["players"][0]["x"], HORDE_CENTER_X);

        let mut state = server.state.lock().await;
        tick_horde_director(&mut state);
        tick_combat_world(&mut state);
        let world = state.combat_world.as_ref().expect("world");
        assert!(world.projectiles.is_empty());
        let player = state.players.get("pilot").expect("player");
        assert_eq!(number(&player.value, "hp", 0.0), 100.0);
        for monster in world.monsters.values().filter(|monster| is_horde_monster(monster)) {
            let dx = number(monster, "x", 0.0) - HORDE_CENTER_X;
            let dy = number(monster, "y", 0.0) - HORDE_CENTER_Y;
            assert!(dx.hypot(dy) >= 680.0);
        }
    }

    #[test]
    fn player_projectile_hit_applies_lifesteal() {
        let (_, mut player_value) =
            sanitize_player(&player("player_one", 100.0, 100.0)).expect("valid player");
        player_value["hp"] = json!(40.0);
        let monsters = sanitize_world_monsters(&[json!({
            "id": "monster_one", "x": 110.0, "y": 100.0,
            "hp": 100.0, "maxHp": 100.0, "speed": 1.0, "atk": 10.0,
        })])
        .expect("valid monster manifest");
        let mut state = WorldState::default();
        state.players.insert(
            "player_one".into(),
            PlayerRecord {
                session_id: 1,
                value: player_value,
                respawn_at: None,
                immune_until: None,
                resume_token: "test-token".into(),
            },
        );
        state.combat_world = Some(CombatWorld {
            monsters,
            projectiles: vec![json!({
                "id": "projectile_one", "ownerId": "player_one", "type": "bullet",
                "x": 110.0, "y": 100.0, "vx": 0.0, "vy": 0.0,
                "damage": 40.0, "range": 400.0, "distanceTraveled": 0.0,
                "color": "#fff", "size": 4.0,
            })],
        });

        tick_combat_world(&mut state);

        let player = state.players.get("player_one").expect("player");
        assert!(
            (number(&player.value, "hp", 0.0) - 43.2).abs() < 0.01,
            "lifesteal should restore 8% of the 40 damage"
        );
        let world = state.combat_world.expect("world remains available");
        assert_eq!(
            number(
                world.monsters.get("monster_one").expect("monster"),
                "hp",
                0.0
            ),
            60.0
        );
    }

    #[test]
    fn horde_melee_mobs_do_not_shoot_from_range() {
        let (_, mut player_value) =
            sanitize_player(&player("pilot", 650.0, 750.0)).expect("valid player");
        player_value["x"] = json!(HORDE_CENTER_X);
        player_value["y"] = json!(HORDE_CENTER_Y);
        let mut state = WorldState::default();
        state.players.insert(
            "pilot".into(),
            PlayerRecord {
                session_id: 1,
                value: player_value,
                respawn_at: None,
                immune_until: None,
                resume_token: "test-token".into(),
            },
        );
        state.horde = Some(HordeRun {
            participants: HashMap::from([("pilot".into(), (650.0, 750.0))]),
            elapsed: 8.0,
            spawn_accumulator: 0.0,
            next_unlock_at: 20.0,
            next_boss_at: 60.0,
            unlocked_count: 1,
            boss_index: 0,
            sequence: 1,
        });
        let mut monsters = HashMap::new();
        monsters.insert(
            "horde_shade".into(),
            json!({
                "id": "horde_shade", "zone": "horde_crucible", "hordeKind": "shade",
                "x": HORDE_CENTER_X + 200.0, "y": HORDE_CENTER_Y,
                "hp": 40.0, "maxHp": 40.0, "atk": 8.0, "speed": 2.7,
                "attackCooldown": 0.0, "state": "chase",
            }),
        );
        state.combat_world = Some(CombatWorld {
            monsters,
            projectiles: Vec::new(),
        });

        tick_combat_world(&mut state);

        let world = state.combat_world.expect("world");
        assert!(world.projectiles.is_empty());
        let player = state.players.get("pilot").expect("player");
        assert_eq!(number(&player.value, "hp", 0.0), 100.0);
    }
}
