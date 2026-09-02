# Релизы

## Что собирает GitHub Actions

Workflow **.github/workflows/release.yml** запускается:

- вручную через workflow_dispatch;
- при push в main;
- при push тега v*.

Job build-windows-client использует Node 22 и Windows runner:

1. npm ci, TypeScript check и web build;
2. создание проверяемого web patch;
3. release build стабильного launcher и обновляемого game host;
4. создание native patch;
5. сборка portable ZIP и per-user installer через Inno Setup;
6. публикация Actions artifact **chibimadness-windows**.

Содержимое artifact:

- **ChibiMadness-Portable-<version>.zip**;
- **ChibiMadness-Setup-<version>.exe**;
- **web-patch.zip**;
- **patch-manifest.json**;
- **native-patch.zip**;
- **native-patch-manifest.json**.

Только tag build запускает publish-release и создаёт GitHub Release с этими шестью файлами. Обычный push в main оставляет artifact в Actions.

## Создание версии

После готового main:

~~~bash
git tag v<version>
git push origin v<version>
~~~

Версия тега попадает в desktop build и имена installer/release. Version bump выполняется только как осознанная release-операция.

После workflow проверьте:

- installer и portable ZIP присутствуют;
- обе пары patch archive/manifest приложены к тому же Release;
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

## Web hot update

Game host содержит embedded web build. При запуске он также проверяет:

- **releases/latest/download/patch-manifest.json**;
- **releases/latest/download/web-patch.zip**.

Manifest format version равен 1 и содержит version, path, SHA-256 и size каждого разрешённого файла. Ограничения game host:

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

Web patch подходит для React/TypeScript logic, UI, карты и web assets. Изменения CSP, bridge protocol или web patch validation требуют нового game host.

## Native self-update

Windows package содержит:

- стабильный **chibimadness-desktop.exe** launcher;
- начальный **runtime/chibimadness-game.exe** с WebView и игровой native-логикой.

При старте launcher проверяет:

- **releases/latest/download/native-patch-manifest.json**;
- **releases/latest/download/native-patch.zip**.

Native manifest format version равен 1, обязательно включает **chibimadness-game.exe** и ограничивает bundle размером 512 MiB. Пути, размеры и SHA-256 каждого файла проверяются до активации. Версии хранятся в:

~~~text
%LOCALAPPDATA%\ChibiMadness\native-versions
~~~

Если загрузка или проверка не проходит, launcher использует последнюю валидную версию либо game host из установленного **runtime/**. Installer удаляет web и native caches при uninstall.

Изменения **desktop/src/main.rs** и native DLL распространяются через native patch. Сам launcher из **desktop/src/launcher.rs** не обновляет себя и требует нового installer/portable package.

Canvas2D используется по умолчанию. Экспериментальный Rust/WGPU renderer включается флагом **--native-renderer**; его выпуск требует native patch и проверки визуальной совместимости отдельно от обычного web build.

## Production Rust server

Server binary не входит в Windows artifact и не обновляется desktop patch-ом. Текущий VPS workflow вынесен в **deploy-server.sh**:

1. sparse clone только server/;
2. cargo build --release;
3. копирование binary в настроенный BIN_DIR;
4. pm2 restart.

Точные пути и PM2 id в скрипте относятся к текущей инфраструктуре. Перед использованием на другом хосте их меняют явно. Nginx/WSS конфигурация описана в [server/README.md](../server/README.md).
