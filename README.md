# ChibiMadness

ChibiMadness — проект и Windows-дистрибутив 2D action RPG, которая внутри web-клиента называется ChibiVerse MMORPG. В одном репозитории находятся браузерная игра, authoritative Rust-сервер, Windows WebView-клиент, установщик и release workflow.

В игре уже реализованы три класса (gunslinger, swordmaster, cybermage), стрельба и ближний бой, классовые навыки, эволюции, транспорт и скейтборд, здания с несколькими этажами, квесты, крафт, экипировка, боссы, Nullspace/horde-режим и общий сетевой бой.

## Карта runtime

| Часть | Точка входа | Назначение |
| --- | --- | --- |
| Web-клиент | **src/main.tsx**, **src/App.tsx** | React-интерфейс, Canvas 2D, ввод и локальное сохранение операторов |
| Игровой движок | **src/game/useGameEngine.ts** | Игровой цикл, бой, физика, коллизии, здания, транспорт и переходы между режимами |
| Локальный web-сервер | **server.ts** | Express, Vite middleware, /api/health и базовый WebSocket-релей для разработки |
| Production world server | **server/src/main.rs** | Authoritative состояние игроков, мобов, снарядов, урона и Nullspace |
| NPC runtime | **server/src/ai.rs** | Utility AI, архетипы, память цели, телеграфы, attack tokens и уровни 1–40 |
| Windows-клиент | **desktop/src/launcher.rs**, **desktop/src/main.rs** | Стабильный launcher, обновляемый WebView game host, WSS и проверяемые web/native updates |
| Native renderer | **src/game/renderScene.ts**, **desktop/src/scene_executor.rs** | Экспериментальная запись Canvas-команд и их выполнение через Rust/WGPU |

**server.ts** и **server/** — разные серверы. Первый нужен для быстрого web-разработческого цикла. Rust-сервер используется там, где мир и бой должны быть authoritative.

## Быстрый старт

### Требования

- Node.js 22 и npm;
- современный браузер с Canvas 2D, Web Audio и WebSocket;
- Rust stable с поддержкой edition 2024 — только для **server/** и **desktop/**;
- Windows WebView2 Runtime и MSVC toolchain — только для desktop-сборки.

### Web-разработка

~~~bash
npm ci
npm run dev
~~~

Игра откроется на [http://localhost:3000](http://localhost:3000). Проверка процесса: [http://localhost:3000/api/health](http://localhost:3000/api/health).

Настройки локального процесса необязательны:

~~~bash
cp .env.example .env
~~~

### Production-сборка web

~~~bash
npm run lint
npm run build
NODE_ENV=production npm run start
~~~

**npm run build** создаёт Vite-бандл и **dist/server.cjs**. При NODE_ENV=production команда **npm run start** обслуживает собранный SPA и WebSocket-релей без Vite.

### Authoritative Rust-сервер

~~~bash
cargo run --manifest-path server/Cargo.toml -- --bind 127.0.0.1:3010 --max-players 64
~~~

Rust-процесс предоставляет только WebSocket. В production путь /ws должен проксироваться к нему через TLS reverse proxy. Браузерный клиент использует WebSocket того же origin; desktop-клиент получает отдельный wss:// endpoint от native host.

Подробнее: [архитектура](docs/ARCHITECTURE.md), [разработка](docs/DEVELOPMENT.md), [сервер](server/README.md).

## Управление

| Ввод | Действие |
| --- | --- |
| WASD / стрелки | Движение; внутри лифта W/S выбирают этаж |
| ЛКМ | Атака в направлении курсора |
| ПКМ | Прицеливание |
| Shift | Уклонение/рывок |
| Space | Прыжок |
| 1–6 | Оружие классовой панели |
| Q/E/F | Навыки; E также взаимодействует с ближайшим NPC |
| R | Перезарядка |
| V/G | Сесть в транспорт или выйти |
| T | Эвакуация из horde-режима, когда она доступна |
| I/B/K/M | Инвентарь, крафт, навыки, карта |
| удержание C | Gunsmith для класса gunslinger |
| Esc | Закрыть окно или открыть настройки |

Сенсорное управление находится в **src/components/MobileControls.tsx**.

## Команды

| Команда | Что выполняет |
| --- | --- |
| npm run dev | Express + WebSocket + Vite middleware на PORT |
| npm run lint | TypeScript typecheck через tsc --noEmit |
| npm run build | Web-бандл и production Node entrypoint |
| npm run start | Запуск dist/server.cjs; режим раздачи определяется NODE_ENV |
| npm run preview | Просмотр Vite-бандла |
| npm run clean | Удаление локальных build-артефактов |
| cargo test --manifest-path server/Cargo.toml | Тесты authoritative сервера и NPC |
| cargo test --manifest-path desktop/Cargo.toml | Тесты manifest/patch validation desktop-клиента |

## Структура репозитория

~~~text
.
├── .github/workflows/release.yml  # Windows packages, web/native patches, GitHub Release
├── desktop/
│   ├── build.rs                   # Встраивает разрешённые файлы dist/ в game host
│   ├── src/launcher.rs            # Стабильный launcher и native self-update
│   ├── src/main.rs                # WebView game host, WSS и web patch validation
│   ├── src/scene_executor.rs      # Canvas display-list → GPU triangles
│   └── src/world_renderer.rs      # WGPU surface, scene cache и presentation
├── docs/
│   ├── README.md                  # Индекс документации
│   ├── ARCHITECTURE.md            # Runtime-границы и потоки данных
│   ├── COMBAT_AI.md               # Боевой AI и шкала уровней NPC
│   ├── DEVELOPMENT.md             # Локальная разработка и проверки
│   └── RELEASES.md                # Desktop release и hot updates
├── installer/chibimadness.iss     # Per-user Windows installer
├── server/
│   ├── src/ai.rs                  # Детерминированный utility AI
│   ├── src/main.rs                # Authoritative WebSocket world
│   └── README.md                  # Запуск и Linux deployment
├── src/
│   ├── components/                # HUD, редактор персонажа, модальные окна, mobile UI
│   ├── game/
│   │   ├── useGameEngine.ts       # Основной игровой цикл
│   │   ├── constants.ts           # Контент, баланс и стартовый roster
│   │   ├── buildings.ts           # Планировки, этажи и коллизии интерьеров
│   │   ├── worldRenderer.ts       # Мир, погода, эффекты и противники
│   │   ├── chibiRenderer.ts       # Персонажи и экипировка
│   │   ├── multiplayerClient.ts   # WebSocket/desktop bridge
│   │   ├── renderScene.ts          # Запись Canvas-команд для native renderer
│   │   ├── renderScene.worker.ts   # Компиляция static/dynamic сцен вне UI thread
│   │   └── characterSave.ts        # Локальные слоты операторов
│   └── types/game.ts              # Общая модель игрового состояния
├── deploy-server.sh               # Sparse deploy Rust-сервера на текущий VPS layout
├── server.ts                      # Локальный/standalone Node web process
├── package.json                   # Web scripts и зависимости
└── vite.config.ts                 # React, Tailwind и HMR
~~~

## Сетевая авторитетность и сохранения

- Rust-сервер владеет общей позицией/HP игроков, roster мобов, решениями NPC, снарядами, уроном, респавном и состоянием Nullspace.
- Инвентарь, экипировка, навыки, квесты, золото и эволюции сохраняются в браузерном localStorage под ключом **chibimadness.operators.v1**.
- Слотов операторов максимум восемь. Серверной базы аккаунтов или облачных сохранений сейчас нет.
- Resume token защищает уже занятую multiplayer identity, но живёт только в памяти процесса и не является системой аккаунтов.
- Node WebSocket в **server.ts** — облегчённый relay. Он не заменяет Rust simulation.

## Документация

- [Индекс документации](docs/README.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Разработка и проверки](docs/DEVELOPMENT.md)
- [Боевой AI NPC](docs/COMBAT_AI.md)
- [Релизы и hot updates](docs/RELEASES.md)
- [Production multiplayer server](server/README.md)

## Релизы

Workflow **.github/workflows/release.yml** собирает portable ZIP, Inno Setup installer, проверяемый web patch и native patch с обновляемым Rust game host. Push в main создаёт Actions artifact; тег v* дополнительно публикует все шесть файлов в GitHub Release.

Стабильный **chibimadness-desktop.exe** запускает установленный или SHA-256-проверенный **chibimadness-game.exe**. Изменения launcher требуют нового installer/portable package; game host и web-контент обновляются своими patch-пакетами.

Canvas2D остаётся production renderer по умолчанию и сохраняет текущий вид карты и персонажей. Экспериментальный Rust/WGPU renderer включается явно и пока не имеет полной визуальной совместимости:

~~~powershell
.\chibimadness-desktop.exe --native-renderer
~~~

Полная процедура и границы hot-update механизма описаны в [docs/RELEASES.md](docs/RELEASES.md).

## Проверки перед PR

~~~bash
npm ci
npm run lint
npm run build
cargo fmt --manifest-path server/Cargo.toml -- --check
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/Cargo.toml
~~~

Для изменений desktop дополнительно:

~~~bash
cargo fmt --manifest-path desktop/Cargo.toml -- --check
cargo test --manifest-path desktop/Cargo.toml
~~~

Проект не содержит корневого файла лицензии; не предполагается лицензия только по значениям в отдельных Cargo manifests.
