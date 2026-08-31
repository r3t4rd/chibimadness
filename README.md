# ChibiVerse MMORPG (ChibiMadness)

Многопользовательская 2D MMORPG в стиле Chibi с открытым миром, транспортом, прокачкой, крафтом, квестами, диалогами с NPC, мировыми боссами и сетевым коопом в реальном времени.

> Основной репозиторий игры, desktop-клиента и production multiplayer-сервера. Больше не нужно вручную переносить изменения между отдельными папками: веб-игра живёт в корне, Rust-сервер — в [`server/`](server), Windows-клиент WebView — в [`desktop/`](desktop).

## Релизы Windows

Создай и отправь тег — GitHub Actions соберёт `.exe`, встроит в него текущий веб-бандл и создаст GitHub Release. По умолчанию клиент подключается к `wss://testgame.zei.su/ws`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

Также workflow можно запустить вручную во вкладке **Actions**: в этом случае `.exe` будет доступен как artifact запуска. Чтобы вручную указать другой сервер при старте, используй:

```powershell
.\chibimadness-desktop.exe --server wss://example.com/ws
```

## Production multiplayer

Rust-сервер в [`server/`](server) — authoritative для общего мира: игроков, мобов, урона, снарядов и Nullspace. Инвентари, квесты и дропы намеренно остаются локальными. Инструкция для Linux, Nginx и PM2 находится в [`server/README.md`](server/README.md).

---

## 🚀 Быстрый старт

### 1. Требования к окружению
* **Node.js**: версия 18.x или 20.x+ (LTS) или **Bun** (1.0+)
* **Менеджер пакетов**: `npm`, `pnpm` или `bun`
* **Браузер**: Любой современный браузер с поддержкой HTML5 Canvas и WebSockets

### 2. Установка зависимостей
Откройте терминал в корне проекта и выполните:
```bash
npm install
# или если используете bun:
# bun install
```

### 3. Настройка переменных окружения (`.env`)
В корне проекта находится файл `.env`:
```env
GEMINI_API_KEY=""
APP_URL="http://localhost:3000"
PORT=3000
```

### 4. Запуск в режиме разработки
```bash
npm run dev
# или bun run dev
```
После запуска откройте в браузере: **`http://localhost:3000`**

> 💡 **Мультиплеер**: Чтобы протестировать сетевую игру, откройте сайт в двух разных вкладках или браузерах — персонажи появятся в одном мире и смогут взаимодействовать в реальном времени.

---

## 🛠 Доступные команды (Scripts)

| Команда | Описание |
|---|---|
| `npm run dev` | Запуск dev-сервера (Express + WebSockets + Vite HMR) на порту 3000 |
| `npm run build` | Сборка фронтенда (`vite build`) и бэкенда (`esbuild server.ts`) в папку `dist/` |
| `npm run start` | Запуск собранного продакшн-сервера из `dist/server.cjs` |
| `npm run lint` | Проверка типов TypeScript (`tsc --noEmit`) |
| `npm run clean` | Очистка папки сборки `dist` |

---

## 📂 Структура проекта

```text
chibimadness-main/
├── .env                  # Настройки окружения (порт, API ключи)
├── index.html            # Главный HTML-шаблон
├── package.json          # Зависимости и скрипты
├── server.ts             # Express + WebSocket бэкенд сервер
├── tsconfig.json         # Конфигурация TypeScript
├── vite.config.ts        # Конфигурация сборщика Vite
└── src/
    ├── main.tsx          # Точка входа React
    ├── App.tsx           # Главный компонент (игровой цикл, модалки)
    ├── index.css         # Базовые стили Tailwind CSS
    ├── types/
    │   └── game.ts       # Интерфейсы TypeScript (Player, Item, Mob, Quest и т.д.)
    ├── components/       # UI компоненты интерфейса
    │   ├── CharacterCreator.tsx # Создание и кастомизация персонажа
    │   ├── HUD.tsx              # ХП, мана, полоса опыта, горячие клавиши
    │   ├── InventoryModal.tsx   # Инвентарь и экипировка
    │   ├── CraftingModal.tsx    # Меню крафта предметов
    │   ├── ShopModal.tsx        # Магазин торговца
    │   ├── SkillTreeModal.tsx   # Дерево навыков
    │   ├── WorldMapModal.tsx    # Карта мира
    │   ├── DialogueModal.tsx    # Диалоги с NPC
    │   ├── ChatAndEmotes.tsx    # Чат и эмоции
    │   ├── BossBar.tsx          # Полоса здоровья босса
    │   └── MobileControls.tsx   # Сенсорное управление для мобильных
    └── game/             # Игровой движок (Canvas 2D)
        ├── constants.ts         # Баланс, базы данных мобов, предметов, классов
        ├── chibiRenderer.ts     # Процедурная отрисовка чиби-персонажей и экипировки
        ├── worldRenderer.ts     # Отрисовка мира, биомов, погоды и освещения
        ├── useGameEngine.ts     # Физика, коллизии, бой, стейт игры
        ├── audioEngine.ts       # Процедурные звуки и музыка (Web Audio API)
        └── multiplayerClient.ts # WebSocket клиент для синхронизации игроков
```
