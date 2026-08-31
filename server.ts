import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { randomBytes, timingSafeEqual } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const server = http.createServer(app);

app.use(express.json());

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// State Store for Multiplayer Server Authoritative Sync
interface NetPlayer {
  id: string;
  name: string;
  chibi: any;
  characterClass: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: string;
  state: string;
  hp: number;
  maxHp: number;
  level: number;
  activeVehicleId: string | null;
  isRiding: boolean;
  equipment?: any;
  emote?: string;
  chatMessage?: string;
  lastSeen: number;
}

const connectedPlayers = new Map<string, { ws: WebSocket; player: NetPlayer; resumeToken: string }>();
const chatHistory: any[] = [];

function resumeTokenMatches(candidate: unknown, expected: string) {
  if (typeof candidate !== 'string') return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  if (candidateBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(candidateBytes, expectedBytes);
}

// Initialize WebSocket Server on same port 3000
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  let playerId: string | null = null;

  ws.on('message', (raw: string) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'join') {
        if (playerId !== null) return;
        if (typeof msg.player?.id !== 'string' || msg.player.id.length === 0) {
          ws.send(JSON.stringify({ type: 'join_rejected', reason: 'invalid_player' }));
          ws.close(1008, 'invalid player');
          return;
        }
        playerId = msg.player.id;
        const player: NetPlayer = {
          ...msg.player,
          lastSeen: Date.now(),
        };

        if (playerId) {
          const existing = connectedPlayers.get(playerId);
          if (existing) {
            if (!resumeTokenMatches(msg.resumeToken, existing.resumeToken)) {
              playerId = null;
              ws.send(JSON.stringify({ type: 'join_rejected', reason: 'player_id_in_use' }));
              ws.close(1008, 'player id is already connected');
              return;
            }
            existing.ws.close(4001, 'session resumed');
          }
          const resumeToken = existing?.resumeToken ?? randomBytes(32).toString('hex');
          connectedPlayers.set(playerId, { ws, player, resumeToken });
        }

        // Send existing players list and recent chat to the new player
        const otherPlayers: NetPlayer[] = [];
        connectedPlayers.forEach((val, key) => {
          if (key !== playerId) {
            otherPlayers.push(val.player);
          }
        });

        ws.send(
          JSON.stringify({
            type: 'init_world',
            players: otherPlayers,
            recentChat: chatHistory.slice(-20),
            resumeToken: connectedPlayers.get(playerId!)?.resumeToken,
          })
        );

        // Broadcast player joined to everyone else
        broadcast(
          {
            type: 'player_joined',
            player,
          },
          playerId
        );
      } else if (msg.type === 'update_position' && playerId) {
        const stored = connectedPlayers.get(playerId);
        if (stored?.ws === ws) {
          stored.player.x = msg.x;
          stored.player.y = msg.y;
          stored.player.vx = msg.vx;
          stored.player.vy = msg.vy;
          stored.player.facing = msg.facing;
          stored.player.state = msg.state;
          stored.player.hp = msg.hp;
          stored.player.maxHp = msg.maxHp;
          stored.player.level = msg.level;
          stored.player.isRiding = msg.isRiding;
          stored.player.activeVehicleId = msg.activeVehicleId;
          stored.player.lastSeen = Date.now();

          // Broadcast movement delta to all other players
          broadcast(
            {
              type: 'player_moved',
              id: playerId,
              x: msg.x,
              y: msg.y,
              vx: msg.vx,
              vy: msg.vy,
              facing: msg.facing,
              state: msg.state,
              hp: msg.hp,
              level: msg.level,
              isRiding: msg.isRiding,
              activeVehicleId: msg.activeVehicleId,
            },
            playerId
          );
        }
      } else if (
        msg.type === 'action' &&
        playerId &&
        connectedPlayers.get(playerId)?.ws === ws
      ) {
        // Player attack / skill / emote
        broadcast(
          {
            type: 'player_action',
            id: playerId,
            action: msg.action,
            data: msg.data,
          },
          playerId
        );
      } else if (
        msg.type === 'chat' &&
        playerId &&
        connectedPlayers.get(playerId)?.ws === ws
      ) {
        const chatItem = {
          id: `chat_${Date.now()}_${Math.random()}`,
          senderId: playerId,
          senderName: connectedPlayers.get(playerId)!.player.name,
          text: msg.text,
          channel: msg.channel || 'all',
          timestamp: Date.now(),
        };
        chatHistory.push(chatItem);
        if (chatHistory.length > 50) chatHistory.shift();

        // Broadcast to all including sender
        broadcast({
          type: 'chat_message',
          message: chatItem,
        });
      } else if (
        msg.type === 'sync_monster_damage' &&
        playerId &&
        connectedPlayers.get(playerId)?.ws === ws
      ) {
        broadcast(
          {
            type: 'monster_damaged',
            monsterId: msg.monsterId,
            damage: msg.damage,
            attackerId: playerId,
            isCrit: msg.isCrit,
          },
          playerId
        );
      } else if (
        msg.type === 'sync_drop_spawn' &&
        playerId &&
        connectedPlayers.get(playerId)?.ws === ws
      ) {
        broadcast({
          type: 'drop_spawned',
          drop: msg.drop,
        });
      } else if (
        msg.type === 'sync_drop_pickup' &&
        playerId &&
        connectedPlayers.get(playerId)?.ws === ws
      ) {
        broadcast({
          type: 'drop_picked',
          dropId: msg.dropId,
          pickerId: playerId,
        });
      }
    } catch (err) {
      console.error('WebSocket parse error:', err);
    }
  });

  ws.on('close', () => {
    if (playerId) {
      const stored = connectedPlayers.get(playerId);
      if (stored && stored.ws === ws) {
        connectedPlayers.delete(playerId);
        broadcast({
          type: 'player_left',
          id: playerId,
        });
      }
    }
  });
});

function broadcast(data: any, excludeId?: string | null) {
  const payload = JSON.stringify(data);
  connectedPlayers.forEach(({ ws }, id) => {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

// Heartbeat cleanup for stale connections
setInterval(() => {
  const now = Date.now();
  connectedPlayers.forEach(({ ws, player }, id) => {
    if (now - player.lastSeen > 35000) {
      ws.terminate();
      connectedPlayers.delete(id);
      broadcast({ type: 'player_left', id });
    }
  });
}, 10000);

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ChibiVerse MMORPG Server running on http://localhost:${PORT}`);
  });
}

start();
