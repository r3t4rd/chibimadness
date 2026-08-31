import { Player, DropItem, Monster, Projectile } from '../types/game';

export type NetEventListener = (type: string, data: any) => void;

declare global {
  interface Window {
    yuyib?: { post: (message: unknown) => void };
  }
}

let configuredServerUrl: string | null = null;
const serverConfigurationListeners = new Set<() => void>();
let configurationRetryTimer: number | null = null;
let nextBridgeMessageId = 1;

function requestDesktopServerConfiguration() {
  if (typeof window === 'undefined' || configuredServerUrl) return;
  const isEmbeddedDesktop =
    window.location.protocol === 'app:' || window.location.hostname === 'app.localhost';
  if (!isEmbeddedDesktop || !window.yuyib?.post) return;

  let attemptsRemaining = 20;
  const request = () => {
    if (configuredServerUrl || attemptsRemaining-- <= 0) return;
    window.yuyib?.post({
      version: 1,
      id: nextBridgeMessageId++,
      endpoint: 'game.ready',
      payload: {},
    });
    configurationRetryTimer = window.setTimeout(request, 250);
  };
  request();
}

if (typeof window !== 'undefined') {
  window.addEventListener('yuyib:event', (event: Event) => {
    const detail = (event as CustomEvent<{ event?: string; payload?: { server_url?: unknown } }>).detail;
    if (detail?.event === 'game.configuration') {
      const candidate = detail.payload?.server_url;
      configuredServerUrl = typeof candidate === 'string' && candidate.startsWith('wss://')
        ? candidate
        : null;
      if (configuredServerUrl && configurationRetryTimer !== null) {
        window.clearTimeout(configurationRetryTimer);
        configurationRetryTimer = null;
      }
      serverConfigurationListeners.forEach((listener) => listener());
    }
  });

  requestDesktopServerConfiguration();
}

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners: Set<NetEventListener> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: number | null = null;
  private localPlayer: Player | null = null;
  private lastPositionSentAt = 0;
  private sharedWorldReady = false;
  private serverHordeActive = false;

  constructor() {
    serverConfigurationListeners.add(() => {
      if (this.localPlayer) this.connect(this.localPlayer);
    });
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('chibiverse_mmo_bus');
      this.broadcastChannel.onmessage = (event) => {
        this.emitToListeners(event.data.type, event.data);
      };
    }
  }

  public connect(player: Player) {
    this.localPlayer = player;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }
    const isEmbeddedDesktop =
      window.location.protocol === 'app:' || window.location.hostname === 'app.localhost';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isEmbeddedDesktop
      ? configuredServerUrl
      : `${protocol}//${window.location.host}/ws`;

    // The desktop binary remains offline unless its host explicitly configured
    // one WSS endpoint and allowed it in the page CSP.
    if (!wsUrl) {
      return;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.send({
          type: 'join',
          player: {
            id: player.id,
            name: player.name,
            characterClass: player.characterClass,
            chibi: player.chibi,
            x: player.x,
            y: player.y,
            vx: player.vx,
            vy: player.vy,
            facing: player.facing,
            state: player.state,
            hp: player.stats?.hp ?? 100,
            maxHp: player.stats?.maxHp ?? 100,
            level: player.stats?.level ?? 1,
            activeVehicleId: player.activeVehicleId,
            isRiding: player.isRiding,
            equipment: player.equipment || {
              weapon: null,
              headwear: null,
              outfit: null,
              vehicle: null,
              accessory: null,
            },
          },
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.emitToListeners(msg.type, msg);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.sharedWorldReady = false;
        this.serverHordeActive = false;
        // Schedule auto reconnect
        if (!this.reconnectTimer && this.localPlayer) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            if (this.localPlayer) this.connect(this.localPlayer);
          }, 3000);
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (e) {
      console.warn('WebSocket connection not ready, using BroadcastChannel fallback:', e);
    }
  }

  public subscribe(listener: NetEventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitToListeners(type: string, data: any) {
    if (type === 'world_snapshot') {
      this.sharedWorldReady = data?.ready === true;
      this.serverHordeActive = data?.horde?.active === true
        && Array.isArray(data?.horde?.participants)
        && data.horde.participants.includes(this.localPlayer?.id);
    }
    this.listeners.forEach((fn) => fn(type, data));
  }

  public send(msg: any) {
    // Send via WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
    // BroadcastChannel is an offline fallback. Mirroring a live WebSocket
    // duplicates every event and doubles local multiplayer traffic.
    if ((!this.ws || this.ws.readyState !== WebSocket.OPEN) && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        // ignore clone error
      }
    }
  }

  public updatePosition(player: Player) {
    const now = performance.now();
    if (now - this.lastPositionSentAt < 1000 / 30) {
      return;
    }
    this.lastPositionSentAt = now;
    this.send({
      type: 'update_position',
      x: Math.round(player.x),
      y: Math.round(player.y),
      vx: Math.round(player.vx * 10) / 10,
      vy: Math.round(player.vy * 10) / 10,
      facing: player.facing,
      state: player.state,
      hp: player.stats.hp,
      maxHp: player.stats.maxHp,
      level: player.stats.level,
      isRiding: player.isRiding,
      activeVehicleId: player.activeVehicleId,
    });
  }

  public bootstrapWorld(monsters: Monster[]) {
    this.send({ type: 'world_bootstrap', monsters });
  }

  public fireProjectile(projectile: Projectile) {
    this.send({ type: 'world_fire', projectile });
  }

  public hasSharedWorld() {
    return this.sharedWorldReady;
  }

  public enterHorde() {
    this.send({ type: 'horde_enter' });
  }

  public extractHorde() {
    this.send({ type: 'horde_extract' });
  }

  public isServerHordeActive() {
    return this.serverHordeActive;
  }

  public sendAction(action: string, data: any) {
    this.send({
      type: 'action',
      action,
      data,
    });
  }

  public sendChat(text: string, senderName: string, channel: 'all' | 'local' | 'party' = 'all') {
    this.send({
      type: 'chat',
      text,
      senderName,
      channel,
    });
  }

  public syncMonsterDamage(monsterId: string, damage: number, isCrit: boolean) {
    this.send({
      type: 'sync_monster_damage',
      monsterId,
      damage,
      isCrit,
    });
  }

  public syncDropSpawn(drop: DropItem) {
    this.send({
      type: 'sync_drop_spawn',
      drop,
    });
  }

  public syncDropPickup(dropId: string) {
    this.send({
      type: 'sync_drop_pickup',
      dropId,
    });
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.sharedWorldReady = false;
    this.serverHordeActive = false;
    this.localPlayer = null;
  }
}

export const net = new MultiplayerClient();
