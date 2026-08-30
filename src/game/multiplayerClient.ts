import { Player, ChatMessage, DropItem } from '../types/game';

export type NetEventListener = (type: string, data: any) => void;

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners: Set<NetEventListener> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: number | null = null;
  private localPlayer: Player | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('chibiverse_mmo_bus');
      this.broadcastChannel.onmessage = (event) => {
        this.emitToListeners(event.data.type, event.data);
      };
    }
  }

  public connect(player: Player) {
    this.localPlayer = player;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

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
    this.listeners.forEach((fn) => fn(type, data));
  }

  public send(msg: any) {
    // Send via WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
    // Also mirror to BroadcastChannel for seamless local multi-tab preview
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        // ignore clone error
      }
    }
  }

  public updatePosition(player: Player) {
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
  }
}

export const net = new MultiplayerClient();
