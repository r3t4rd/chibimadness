import { Player, DropItem, Monster, Projectile } from '../types/game';
import { perfMonitor } from './performanceMonitor';
import type { RenderScene } from './renderScene';

export type NetEventListener = (type: string, data: any) => void;
export type ContentBuildInfo = {
  version: string | null;
  source: 'embedded' | 'patch' | null;
};

export type NativeWorldRenderFrame = {
  cameraX: number;
  cameraY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Source renderer time. Native rendering must use the same animation phase
   * instead of inventing a separate visual timeline. */
  timeSeconds: number;
  theme: string;
  entities: Array<{
    id: string;
    kind: string;
    faction: string;
    x: number;
    y: number;
    size: number;
    color: [number, number, number, number];
    velocityX: number;
    velocityY: number;
    hasVelocity: boolean;
    hpRatio: number;
    facingLeft: boolean;
    layer: number;
    projectileType?: string;
    projectileRange?: number;
    tracerLength?: number;
    tracerWidth?: number;
    distanceTraveled?: number;
    chibi?: {
      hairStyle?: string;
      frontHairStyle?: string;
      backHairStyle?: string;
      hairColor?: string;
      skinTone?: string;
      eyeColor?: string;
      eyeType?: string;
      earType?: string;
      earColor?: string;
      innerEarColor?: string;
      haloType?: string;
      haloColor?: string;
      outfitType?: string;
      coatColor?: string;
      skirtColor?: string;
      accentColor?: string;
      ribbonColor?: string;
      hatType?: string;
      hatColor?: string;
      wingType?: string;
      wingColor?: string;
    };
    animation?: {
      state?: string;
      isSprinting?: boolean;
      jumpZ?: number;
      spawnBounce?: number;
      attackTimer?: number;
      dodgeTimer?: number;
    };
  }>;
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
let nativeWorldRendererEnabled = false;
let nativeWorldRendererReady = false;
const nativeWorldRendererListeners = new Set<() => void>();
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
      payload?: {
        server_url?: unknown;
        content_version?: unknown;
        content_source?: unknown;
        native_renderer?: unknown;
        fps?: unknown;
        frameMs?: unknown;
      };
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
      const nativeRendererRequested = detail.payload?.native_renderer === true;
      if (nativeRendererRequested !== nativeWorldRendererEnabled) {
        nativeWorldRendererReady = false;
      }
      nativeWorldRendererEnabled = nativeRendererRequested;
      if (configuredServerUrl && configurationRetryTimer !== null) {
        window.clearTimeout(configurationRetryTimer);
        configurationRetryTimer = null;
      }
      serverConfigurationListeners.forEach((listener) => listener());
      contentBuildListeners.forEach((listener) => listener());
      nativeWorldRendererListeners.forEach((listener) => listener());
    } else if (detail?.event === 'world.renderer_ready' && nativeWorldRendererEnabled) {
      nativeWorldRendererReady = true;
      nativeWorldRendererListeners.forEach((listener) => listener());
    } else if (detail?.event === 'world.renderer_metrics') {
      perfMonitor.recordNativePresentation(detail.payload?.fps, detail.payload?.frameMs);
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

export function isNativeWorldRendererEnabled() {
  return nativeWorldRendererEnabled;
}

export function isNativeWorldRendererReady() {
  return nativeWorldRendererReady;
}

export function subscribeNativeWorldRenderer(listener: () => void) {
  nativeWorldRendererListeners.add(listener);
  return () => nativeWorldRendererListeners.delete(listener);
}

export function sendNativeWorldRenderFrame(frame: NativeWorldRenderFrame) {
  if (!nativeWorldRendererEnabled || !window.yuyib?.post) return;
  window.yuyib.post({
    version: 1,
    id: nextBridgeMessageId++,
    endpoint: 'world.frame',
    payload: frame,
  });
}

/**
 * The canonical world display-list transport. It is kept separate from the
 * old entity frame during the migration, so an incomplete WGPU executor can
 * never silently replace the proven Canvas image.
 */
export function sendNativeRenderScene(scene: RenderScene) {
  if (!nativeWorldRendererEnabled || !window.yuyib?.post) return;
  if (scene.version !== 1 || scene.commands.length > 65_536) return;
  window.yuyib.post({
    version: 1,
    id: nextBridgeMessageId++,
    endpoint: 'world.scene',
    payload: scene,
  });
}

/**
 * Retained native world transport. Static geometry is sent only on an
 * invalidation; the dynamic list remains small and is the only realtime
 * message crossing WebView2 on ordinary gameplay frames.
 */
export function sendNativeStaticRenderScene(scene: RenderScene) {
  sendNativeLayeredRenderScene('world.scene.static', scene);
}

export function sendNativeDynamicRenderScene(scene: RenderScene) {
  sendNativeLayeredRenderScene('world.scene.dynamic', scene);
}

function sendNativeLayeredRenderScene(endpoint: 'world.scene.static' | 'world.scene.dynamic', scene: RenderScene) {
  if (!nativeWorldRendererEnabled || !window.yuyib?.post) return;
  if (scene.version !== 1 || scene.commands.length > 65_536) return;
  window.yuyib.post({
    version: 1,
    id: nextBridgeMessageId++,
    endpoint,
    payload: scene,
  });
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
    } else if (type === 'horde_join_rejected') {
      // The server keeps one global run. A rejection must release the client
      // transition lock immediately, otherwise repeated attempts look like a
      // stuck "joining" state for six seconds.
      this.hordeTransition = null;
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
