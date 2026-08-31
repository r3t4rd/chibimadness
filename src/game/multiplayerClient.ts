import { Player, DropItem, Monster, Projectile } from '../types/game';

export type NetEventListener = (type: string, data: any) => void;
export type ContentBuildInfo = {
  version: string | null;
  source: 'embedded' | 'patch' | null;
};

declare global {
  interface Window {
    yuyib?: { post: (message: unknown) => void };
  }
}

let configuredServerUrl: string | null = null;
const serverConfigurationListeners = new Set<() => void>();
const contentBuildListeners = new Set<() => void>();
let contentBuildInfo: ContentBuildInfo = { version: null, source: null };
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
    const detail = (event as CustomEvent<{
      event?: string;
      payload?: { server_url?: unknown; content_version?: unknown; content_source?: unknown };
    }>).detail;
    if (detail?.event === 'game.configuration') {
      const candidate = detail.payload?.server_url;
      configuredServerUrl = typeof candidate === 'string' && candidate.startsWith('wss://')
        ? candidate
        : null;
      const version = detail.payload?.content_version;
      const source = detail.payload?.content_source;
      contentBuildInfo = {
        version: typeof version === 'string' && version.length > 0 ? version : null,
        source: source === 'embedded' || source === 'patch' ? source : null,
      };
      if (configuredServerUrl && configurationRetryTimer !== null) {
        window.clearTimeout(configurationRetryTimer);
        configurationRetryTimer = null;
      }
      serverConfigurationListeners.forEach((listener) => listener());
      contentBuildListeners.forEach((listener) => listener());
    }
  });

  requestDesktopServerConfiguration();
}

export function getContentBuildInfo(): ContentBuildInfo {
  return contentBuildInfo;
}

export function subscribeContentBuildInfo(listener: () => void) {
  contentBuildListeners.add(listener);
  return () => contentBuildListeners.delete(listener);
}

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners: Set<NetEventListener> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: number | null = null;
  private localPlayer: Player | null = null;
  private resumeToken: string | null = null;
  private lastPositionSentAt = 0;
  private sharedWorldReady = false;
  private serverHordeActive = false;
  private hordeTransition: 'enter' | 'extract' | null = null;
  private hordeTransitionStartedAt = 0;

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
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.isConnected = true;
        this.send({
          type: 'join',
          resumeToken: this.resumeToken,
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

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init_world' && typeof msg.resumeToken === 'string') {
            this.resumeToken = msg.resumeToken;
          }
          this.emitToListeners(msg.type, msg);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
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

      socket.onerror = () => {
        if (this.ws !== socket) return;
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
      if (
        (this.hordeTransition === 'enter' && this.serverHordeActive)
        || (this.hordeTransition === 'extract' && !this.serverHordeActive)
      ) {
        // The engine processes this same snapshot synchronously and adopts its
        // authoritative transform before the next animation-frame movement.
        this.hordeTransition = null;
        this.lastPositionSentAt = performance.now();
      }
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
    this.localPlayer = player;
    const now = performance.now();
    // Do not leak a pre-transition overworld transform after horde_enter (or
    // a pre-extract horde transform). The server commits the transition and
    // its snapshot supplies the next valid movement base.
    if (this.hordeTransition) {
      if (now - this.hordeTransitionStartedAt < 6_000) return;
      this.hordeTransition = null;
    }
    if (now - this.lastPositionSentAt < 1000 / 20) {
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
    this.hordeTransition = 'enter';
    this.hordeTransitionStartedAt = performance.now();
    this.send({ type: 'horde_enter' });
  }

  public extractHorde() {
    this.hordeTransition = 'extract';
    this.hordeTransitionStartedAt = performance.now();
    this.send({ type: 'horde_extract' });
  }

  public healPlayer(amount: number) {
    this.send({ type: 'player_heal', amount });
  }

  public teleport(x: number, y: number) {
    this.send({ type: 'teleport', x, y });
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
    this.hordeTransition = null;
    this.localPlayer = null;
    this.resumeToken = null;
  }
}

export const net = new MultiplayerClient();
