# Разработка

## Окружение

Основной проверенный путь совпадает с GitHub Actions:

- Node.js 22;
- npm и package-lock.json;
- Rust stable с edition 2024;
- Windows: MSVC toolchain, WebView2 Runtime и Inno Setup только для desktop/release;
- Linux: build-essential для production Rust server.

В репозитории есть bun.lock, но CI и release workflow используют npm. При изменении зависимостей оба lockfile должны оставаться согласованными.

## Установка

~~~bash
git clone https://github.com/r3t4rd/chibimadness.git
cd chibimadness
npm ci
~~~

Файл .env не обязателен. Поддерживаемые локальные переменные перечислены в **.env.example**:

- PORT — порт server.ts, по умолчанию 3000;
- DISABLE_HMR — отключает HMR и file watching в Vite;
- NODE_ENV=production — заставляет собранный Node entrypoint обслуживать dist/.

## Web-цикл

~~~bash
npm run dev
~~~

server.ts запускает HTTP и WebSocket на одном порту, а Vite работает middleware. Этот режим подходит для UI, Canvas, локальной прогрессии и базового multiplayer relay.

Перед коммитом:

~~~bash
npm run lint
npm run build
~~~

Сборка создаёт:

- **dist/index.html** и hashed assets;
- **dist/server.cjs** и source map.

Для запуска собранного SPA установите NODE_ENV=production. Без этого server.ts сохраняет development-ветку с Vite middleware.

~~~bash
NODE_ENV=production npm run start
~~~

## Rust world server

Запуск из корня:

~~~bash
cargo run --manifest-path server/Cargo.toml -- --bind 127.0.0.1:3010 --max-players 64
~~~

Параметры:

~~~text
--bind <IP:PORT>       default 127.0.0.1:3010
--max-players <1..512> default 64
~~~

Проверки:

~~~bash
cargo fmt --manifest-path server/Cargo.toml -- --check
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/Cargo.toml
~~~

Браузерный build подключается только к same-origin /ws. Для полноценной локальной связки web + Rust нужен reverse proxy, который обслуживает web и направляет /ws на 127.0.0.1:3010. Не меняйте multiplayerClient на hardcoded localhost: это сломает HTTPS, desktop CSP и удалённых игроков.

## Windows desktop

Сначала нужен web build:

~~~powershell
npm ci
npm run lint
npm run build

$env:CHIBIMADNESS_SERVER_URL = 'wss://example.com/ws'
$env:CHIBIMADNESS_BUILD_VERSION = 'dev-local'
cargo build --release --target x86_64-pc-windows-msvc --manifest-path desktop/Cargo.toml
~~~

Без compile-time server URL desktop остаётся offline, пока endpoint не задан в другом build. Runtime override:

~~~powershell
.\desktop\target\x86_64-pc-windows-msvc\release\chibimadness-desktop.exe --server wss://example.com/ws
~~~

Desktop принимает только WSS. Raw ws:// запрещён намеренно.

Тесты native boundary:

~~~bash
cargo fmt --manifest-path desktop/Cargo.toml -- --check
cargo test --manifest-path desktop/Cargo.toml
~~~

## Где менять код

| Задача | Основные файлы |
| --- | --- |
| HUD или окно | src/components/, App.tsx |
| Управление, бой, физика | src/game/useGameEngine.ts |
| Карта и визуальные эффекты | src/game/worldRenderer.ts |
| Персонажи и оружие | src/game/chibiRenderer.ts, weaponAttachPoints.ts |
| Контент и баланс | src/game/constants.ts |
| Интерьеры и лифты | src/game/buildings.ts, buildingRenderer.ts |
| Локальные сохранения | src/game/characterSave.tsд |
| Сетевой клиент | src/game/multiplayerClient.ts |
| Authoritative мир | server/src/main.rs |
| Поведение NPC | server/src/ai.rs |
| Desktop updater/CSP | desktop/src/main.rs |

## Минимальная матрица проверки

| Изменение | Обязательная проверка |
| --- | --- |
| TypeScript/React/Canvas | npm run lint, npm run build |
| Rust server | cargo fmt, clippy, cargo test для server manifest |
| NPC/баланс | server tests, telegraph/order tests, ручной бой |
| Интерьеры/коллизии | typecheck и проход затронутых этажей |
| Desktop | web build до Cargo; desktop fmt/test/build |
| Release workflow | проверить paths и имена четырёх artifacts |
| Docs/config | проверить команды против manifests и отсутствие секретов |

Автоматические проверки не доказывают качество боя. Изменение TTK, управления, телеграфов или камеры требует короткого ручного playtest.

## Ограничения текущей структуры

- useGameEngine.ts, chibiRenderer.ts и worldRenderer.ts крупные; не добавляйте туда независимую систему, если она может жить отдельным модулем.
- Контент TypeScript не разделён с Rust типобезопасным schema generator. Поля сетевого manifest должны проверяться на обеих сторонах.
- Node relay и Rust server реализуют разные уровни авторитетности; изменение сообщения проверяется с обоими режимами либо явно документируется как Rust-only.
- Нет server-side persistence. Тесты не должны предполагать сохранение состояния между перезапусками.
