# ChibiMadness server

`chibimadness-server` is a small Rust WebSocket server for shared presence,
movement, chat and the live combat world. It owns the initial monster manifest,
monster HP/movement, projectile movement, player damage and the shared
Nullspace director (entry, extraction, waves, unlock timer and bosses).
Inventory, drops and quests remain intentionally local.
Reconnects use a server-issued in-memory token so another client cannot replace
an active player merely by copying the public player ID.

## Linux deployment

The server directory is standalone: copy only `Cargo.toml` and `src/` to the
Linux machine, or build the binary elsewhere and copy just that one binary.

Build directly on the VPS (recommended) or from WSL. On Ubuntu/Debian install
the native linker and Rust toolchain first:

```bash
sudo apt update
sudo apt install -y build-essential curl pkg-config
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"
```

Then build the repository checkout:

```bash
CARGO_BUILD_JOBS=6 cargo build --release
```

`rustup target add x86_64-unknown-linux-gnu` on Windows alone is not enough:
the Windows host also needs a compatible Linux linker. Building on the VPS or
in WSL avoids that cross-linker problem.

The resulting binary is `target/release/chibimadness-server`. It listens only
on `127.0.0.1:3010` by default, which is deliberate: expose it through a TLS
reverse proxy instead of opening an unauthenticated raw WebSocket port.

Install the binary under a dedicated unprivileged user:

```bash
sudo useradd --system --home-dir /opt/chibimadness --shell /usr/sbin/nologin chibi
sudo install -d -o chibi -g chibi /opt/chibimadness
sudo install -o chibi -g chibi -m 0755 target/release/chibimadness-server /opt/chibimadness/chibimadness-server
```

For the existing Nginx + acme.sh + PM2 setup, keep the server private on
`127.0.0.1:3010` and proxy only WebSockets:

```nginx
location = /ws {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

After copying the new binary to `~/chibimadness-server/bin/chibimadness-server`:

```bash
pm2 restart 6 --update-env
pm2 logs 6
```

Clients connect through `wss://testgame.zei.su/ws`; keep only ports 80 and 443
open publicly.
