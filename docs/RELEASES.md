# Релизы

## Что собирает GitHub Actions

Workflow **.github/workflows/release.yml** запускается:

- вручную через workflow_dispatch;
- при push в main;
- при push тега v*.

Job build-windows-client использует Node 22 и Windows runner:

1. npm ci, TypeScript check и web build;
2. создание проверяемого web patch;
3. release build desktop executable;
4. сборка per-user installer через Inno Setup;
5. публикация Actions artifact **chibimadness-windows**.

Содержимое artifact:

- **chibimadness-desktop.exe**;
- **ChibiMadness-Setup-<version>.exe**;
- **web-patch.zip**;
- **patch-manifest.json**.

Только tag build запускает publish-release и создаёт GitHub Release с этими четырьмя типами файлов. Обычный push в main оставляет artifact в Actions.

## Создание версии

После готового main:

~~~bash
git tag v<version>
git push origin v<version>
~~~

Версия тега попадает в desktop build и имена installer/release. Version bump выполняется только как осознанная release-операция.

После workflow проверьте:

- оба Windows binary присутствуют;
- patch archive и manifest приложены к тому же Release;
- installer запускается без UAC в стандартном per-user режиме;
- desktop показывает ожидаемый content version/source;
- клиент подключается к настроенному WSS;
- latest/download URLs отдают manifest и bundle одной версии.

## Desktop endpoint

Workflow компилирует:

~~~text
CHIBIMADNESS_SERVER_URL=wss://testgame.zei.su/ws
CHIBIMADNESS_BUILD_VERSION=<tag или branch ref>
~~~

Runtime флаг --server может заменить endpoint, но принимает только wss:// URL без credentials.

## Hot update

Desktop executable содержит embedded web build. При запуске он также проверяет:

- **releases/latest/download/patch-manifest.json**;
- **releases/latest/download/web-patch.zip**.

Manifest format version равен 1 и содержит version, path, SHA-256 и size каждого разрешённого файла. Ограничения native host:

- максимум 512 файлов;
- максимум 64 MiB на весь patch;
- максимум 16 MiB на файл;
- только безопасные относительные пути;
- обязательный index.html;
- whitelist расширений из desktop/build.rs.

Bundle распаковывается во staging. Активным он становится только после совпадения file list, размеров и hashes. При ошибке клиент использует последний валидный cache либо embedded assets.

Cache:

~~~text
%LOCALAPPDATA%\ChibiMadness\web-patches
~~~

Installer удаляет этот cache при uninstall.

Web patch подходит для React/TypeScript logic, UI, карты и web assets. Изменения **desktop/src/**, CSP, bridge protocol или patch validation требуют нового executable.

## Production Rust server

Server binary не входит в Windows artifact и не обновляется desktop patch-ом. Текущий VPS workflow вынесен в **deploy-server.sh**:

1. sparse clone только server/;
2. cargo build --release;
3. копирование binary в настроенный BIN_DIR;
4. pm2 restart.

Точные пути и PM2 id в скрипте относятся к текущей инфраструктуре. Перед использованием на другом хосте их меняют явно. Nginx/WSS конфигурация описана в [server/README.md](../server/README.md).
