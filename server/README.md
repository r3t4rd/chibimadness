# ChibiMadness world server

Rust WebSocket-сервер владеет общим боевым миром ChibiMadness. Это отдельный runtime от корневого **server.ts**: Node-процесс подходит для web-разработки и relay-событий, а **server/** симулирует игроков, мобов, снаряды, урон и Nullspace.

## Зона ответственности

Сервер хранит в памяти:

- активные WebSocket-сессии и resume tokens;
- валидированное состояние игроков, HP, респавн и временный иммунитет;
- стартовый monster manifest после world bootstrap;
- AgentBrain каждого NPC, attack tokens и телеграфы;
- projectiles и authoritative попадания;
- общий Nullspace run, участников, волны, bosses и extraction;
- последние 50 chat messages.

Инвентарь, экипировка, золото, квесты, drops, навыки и эволюции остаются локальными у клиента. Базы данных, аккаунтов и долговременного server persistence нет.

## Запуск

Из корня репозитория:

~~~bash
cargo run --manifest-path server/Cargo.toml
~~~

Полная форма:

~~~bash
cargo run --manifest-path server/Cargo.toml -- \
  --bind 127.0.0.1:3010 \
  --max-players 64
~~~

| Аргумент | Default | Ограничение |
| --- | --- | --- |
| --bind | 127.0.0.1:3010 | Валидный SocketAddr |
| --max-players | 64 | 1–512 |

Сервер предоставляет raw WebSocket и не раздаёт web assets.

## Runtime limits

| Параметр | Значение |
| --- | ---: |
| Simulation tick | 20 ms / 50 Hz |
| Movement interval | 50 ms / 20 Hz |
| Replication interval | 50 ms / 20 Hz |
| Максимальный message/frame | 128 KiB |
| Максимум world monsters | 256 |
| Максимум world projectiles | 1024 |
| Outbound queue на сессию | 64 |
| Chat history | 50 |

Movement проходит bounds/rate validation. Слишком быстрый transform не принимается как authoritative позиция.

## Протокол

Основные входящие сообщения:

| Type | Назначение |
| --- | --- |
| join | Создать или возобновить player session |
| update_position | Rate-limited movement state |
| chat | Сообщение в общий chat history |
| world_bootstrap | Передать authored roster при пустом мире |
| world_fire | Запрос создать player projectile |
| player_heal | Authoritative heal, подтверждаемый следующим world_delta |
| teleport | Валидированный переход |
| horde_enter | Войти в общий Nullspace run |
| horde_extract | Покинуть run после unlock |

Основные исходящие сообщения:

| Type | Назначение |
| --- | --- |
| init_world | Existing players, recent chat и resume token |
| player_joined / player_moved / player_left | Presence deltas |
| chat_message | Нормализованное сообщение |
| world_snapshot | Полное состояние players, monsters, projectiles и horde при bootstrap/переходах |
| world_delta | Interest-scoped upsert/remove изменения общего мира с sequence number |
| horde_join_rejected | Причина отказа позднему участнику |

Legacy action, sync_monster_damage, sync_drop_spawn и sync_drop_pickup принимаются как no-op. Клиентский combat payload не должен обходить server simulation.

## NPC

**src/ai.rs** содержит:

- шесть weapon-driven архетипов;
- target memory и last seen position;
- advance, hold, flank и retreat intents;
- attack-token coordination;
- обязательный telegraph-before-fire;
- difficulty profiles уровней 1–40;
- health/damage/speed/perception scaling.

Первый уровень получает минимум 450 HP. Уровни распределены по пяти tier с attack budget от одного до пяти. Детали: [docs/COMBAT_AI.md](../docs/COMBAT_AI.md).

## Проверки

~~~bash
cargo fmt --manifest-path server/Cargo.toml -- --check
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/Cargo.toml
~~~

Тесты охватывают join/reconnect, movement rate limit, shared combat, lifesteal, heal, респавн, Nullspace transitions, NPC telegraph order, attack tokens и difficulty scaling.

## Linux build

На Ubuntu/Debian:

~~~bash
sudo apt update
sudo apt install -y build-essential curl pkg-config
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"

cd server
cargo build --release
~~~

Binary:

~~~text
server/target/release/chibimadness-server
~~~

Сборка Linux target на Windows требует подходящего linker. Собирать на VPS или в WSL проще и надёжнее.

## Размещение

Процесс по умолчанию слушает loopback. Не открывайте raw WebSocket port в интернет; завершайте TLS на Nginx/Caddy и публикуйте только /ws.

Пример Nginx:

~~~nginx
location = /ws {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
~~~

Клиенты используют wss://testgame.zei.su/ws. Публично достаточно портов 80/443.

Текущий **deploy-server.sh** предполагает:

- исходники в /home/dash/chibimadness-server/chibimadness-server;
- binary в /home/dash/chibimadness-server/bin;
- PM2 process id 6.

~~~bash
./deploy-server.sh
~~~

Скрипт делает sparse clone каталога server, release build, копирование binary и pm2 restart. Для другого хоста сначала измените SERVER_DIR, BIN_DIR и PM2_APP; значения не обнаруживаются автоматически.

## Security boundary

- Resume token создаётся из 32 случайных байт системного RNG и хранится в hex-форме.
- Token живёт только в RAM и не заменяет login/account system.
- Сервер ограничивает message/frame size и outbound queue.
- Player, monster и projectile payloads очищаются и ограничиваются допустимыми диапазонами.
- Desktop принимает только WSS endpoint; raw Rust listener остаётся за TLS proxy.
- Сервер не должен запускаться с правами root. Используйте отдельного непривилегированного пользователя.

Архитектурный контекст и границы локального состояния: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
