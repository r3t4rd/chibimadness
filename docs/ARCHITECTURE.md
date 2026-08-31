# Архитектура

## Общая схема

~~~text
Browser или Windows WebView
        │
        ├── React UI и Canvas
        │     ├── App.tsx
        │     ├── components/
        │     └── game/useGameEngine.ts
        │
        ├── локальное состояние операторов
        │     └── localStorage: chibimadness.operators.v1
        │
        └── game/multiplayerClient.ts
              ├── same-origin /ws → server.ts (локальный relay)
              └── configured wss:// → Rust server через reverse proxy

Rust world server
        ├── состояние сессий и игроков
        ├── authoritative combat world
        ├── utility AI мобов
        └── Nullspace/horde director
~~~

## Web-клиент

**src/main.tsx** монтирует React-приложение. **src/App.tsx** связывает Canvas, HUD, модальные окна и созданного оператора с **useGameEngine**.

**src/game/useGameEngine.ts** владеет клиентским игровым циклом:

- ввод, движение, прыжки, уклонения и транспорт;
- локальные коллизии мира и интерьеров;
- оружие, навыки, анимационные состояния и визуальные эффекты;
- квесты, инвентарь, дропы и локальная прогрессия;
- переходы в здания, Nullspace и обратно;
- применение authoritative snapshots, если доступен Rust world server.

Отрисовка отделена по назначению:

- **worldRenderer.ts** — карта, мобы, погода, свет, телеграфы и эффекты;
- **chibiRenderer.ts** — персонажи и экипировка;
- **buildingRenderer.ts** — фасады и интерьеры;
- **audioEngine.ts** — процедурные звуки и музыка через Web Audio;
- **viewCull.ts** и **performanceMonitor.ts** — ограничение работы вне viewport и runtime-метрики.

Контент и баланс пока хранятся в TypeScript:

- **constants.ts** — предметы, NPC, монстры, квесты, рецепты, классы и стартовый roster;
- **buildings.ts** — планировки этажей, стены, лифты и точки выхода;
- **hordeMode.ts**, **bossRifts.ts**, **evolutions.ts** — отдельные боевые подсистемы;
- **types/game.ts** — общие клиентские типы.

## Два WebSocket-сервера

### server.ts

Node-процесс объединяет Express, Vite middleware и WebSocket path /ws. Он удобен для локальной разработки и поддерживает presence, movement, chat и legacy relay-события.

Он не симулирует production combat world и не запускает серверный NPC AI. Его нельзя считать эквивалентом Rust-сервера только потому, что путь WebSocket совпадает.

### server/

Rust-процесс — production world server. Он слушает raw WebSocket, по умолчанию на 127.0.0.1:3010, и ожидает TLS termination/reverse proxy снаружи.

Основной цикл работает с шагом 20 мс (50 Hz). Движение клиентов принимается и snapshots отправляются не чаще 20 Hz. Состояние хранится в памяти одного процесса.

## Границы authoritative состояния

| Система | Владелец при подключении к Rust |
| --- | --- |
| Сессия, resume token, online presence | Rust |
| Позиция, скорость, HP и респавн игрока | Rust с валидацией входных movement packets |
| Стартовый roster и HP мобов | Rust после world bootstrap |
| Решения NPC, attack tokens и телеграфы | Rust |
| Снаряды и попадания общего мира | Rust |
| Nullspace: участники, волны, боссы, вход и эвакуация | Rust |
| Визуальная интерполяция и эффекты | Клиент |
| Инвентарь, экипировка, золото и навыки | Клиент/localStorage |
| Квесты, локальные дропы и эволюции | Клиент/localStorage |

Legacy сообщения sync_monster_damage, sync_drop_spawn и sync_drop_pickup Rust-сервер намеренно игнорирует. Общий бой проходит через world_bootstrap, world_fire и world_snapshot.

## Сетевой поток

1. Клиент открывает WebSocket и отправляет join с публичным player id и сохранённым в памяти клиента resume token.
2. Сервер валидирует player payload, лимит игроков и занятую identity.
3. В init_world возвращаются существующие игроки, недавний чат и resume token.
4. Первый клиент передаёт authored monster manifest через world_bootstrap. Сервер очищает входные данные, применяет уровни NPC и становится владельцем мира.
5. Клиенты отправляют movement не чаще 20 Hz и запросы действий.
6. Rust loop двигает NPC/снаряды, считает попадания и рассылает world_snapshot.
7. Клиент принимает snapshot перед следующим animation frame и использует его как новую основу состояния.

Resume token не является учётной записью. Он предотвращает замену активной сессии с тем же id и исчезает после остановки процесса.

## NPC runtime

Стартовый roster получает aiLevel в **src/game/constants.ts**. При bootstrap Rust-сервер:

1. нормализует уровень в диапазон 1–40;
2. применяет health floor и multipliers HP, урона и скорости;
3. выбирает архетип по типу моба, оружию и boss flag;
4. создаёт AgentBrain с детерминированным seed;
5. на каждом тике обновляет видимую цель, память, utility intent и attack token;
6. перед projectile или melee hit обязательно публикует telegraph state.

Подробные параметры: [COMBAT_AI.md](COMBAT_AI.md).

## Локальные сохранения

**src/game/characterSave.ts** хранит до восьми операторов в localStorage. Сохраняются класс, внешность, stats, инвентарь, экипировка, навыки, квесты, золото и эволюции.

Это сохранение привязано к browser/WebView storage конкретной установки. Серверной миграции, аккаунта, синхронизации между устройствами и восстановления после очистки storage нет.

## Desktop-клиент

**desktop/build.rs** читает production **dist/** и встраивает разрешённые web-файлы в executable. Поэтому web-бандл всегда собирается до Cargo desktop build.

Native host:

- принимает только wss:// endpoint без credentials;
- добавляет его origin в строгий CSP;
- передаёт конфигурацию web-клиенту через yuyib bridge;
- проверяет hot-update manifest, пути, размеры и SHA-256;
- загружает patch во staging и активирует его только после полной проверки;
- при ошибке остаётся на последнем валидном cache или embedded bundle.

Patch меняет только web-контент. Изменение Rust native host требует нового executable.

## Как расширять проект

- Новая UI-панель: **src/components/** и состояние в **App.tsx** или engine API.
- Новая механика мира: отдельный файл в **src/game/**, общие типы в **types/game.ts**.
- Новый authored контент: **constants.ts** либо тематический модуль рядом с существующими.
- Новая authoritative механика: обработчик сообщения и состояние в **server/src/main.rs**, тест рядом с серверным модулем.
- Изменение NPC decision model: **server/src/ai.rs**, без дублирования логики в renderer.
- Изменение desktop protocol/update: **desktop/src/main.rs** плюс unit test для validation boundary.

Крупные файлы движка уже являются зонами концентрации сложности. Новая независимая подсистема предпочтительно получает отдельный модуль, а не ещё одну несвязанную ветку внутри useGameEngine.
