import { buildWsUrl } from './backendConfig';
import {
  ChessMatchedPayload,
  NotificationItem,
  SceneUser,
  SpeedMatchedPayload,
} from '../types';

export type LobbyEvent =
  | { type: 'presence_update'; onlineCount: number; onlineUserIds: string[] }
  | { type: 'pong'; onlineCount?: number; onlineUserIds?: string[] }
  | { type: 'users_updated'; user?: SceneUser }
  | { type: 'rooms_updated' }
  | { type: 'aura_voted'; targetUserId: string; newAura: number }
  | { type: 'notification'; notification: NotificationItem }
  | { type: 'friends_updated' }
  | { type: 'history_updated'; gameId?: string }
  | { type: 'speed_queued' }
  | ({ type: 'speed_matched' } & SpeedMatchedPayload)
  | { type: 'chess_queued' }
  | ({ type: 'chess_matched' } & ChessMatchedPayload);

type Listener = (event: LobbyEvent) => void;

class LobbySocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private userId = '';
  private alias = '';
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  public onlineCount = 0;
  public onlineUserIds: string[] = [];

  public connect(userId: string, alias: string) {
    if (typeof window === 'undefined' || !userId) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.userId === userId && this.alias === alias) return;
      this.disconnect();
    }

    this.userId = userId;
    this.alias = alias;
    this.intentionalClose = false;

    const url = buildWsUrl('/ws/lobby', { userId, alias });
    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        this.startPing();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as LobbyEvent & { type: string };
          if (data.type === 'presence_update' || data.type === 'pong') {
            if (typeof data.onlineCount === 'number') {
              this.onlineCount = data.onlineCount;
            }
            if (Array.isArray(data.onlineUserIds)) {
              this.onlineUserIds = data.onlineUserIds;
            }
          }
          if (
            data.type === 'users_updated' ||
            data.type === 'rooms_updated' ||
            data.type === 'aura_voted' ||
            data.type === 'friends_updated' ||
            data.type === 'history_updated' ||
            data.type === 'notification'
          ) {
            window.dispatchEvent(new CustomEvent('sceneon-sync', { detail: data }));
          }
          this.listeners.forEach((cb) => cb(data));
        } catch {
          // Ignore invalid JSON payloads
        }
      };

      socket.onclose = () => {
        this.stopPing();
        if (this.ws === socket) this.ws = null;
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      socket.onerror = () => {
        // Closed handler triggers reconnect cleanly
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.intentionalClose = true;
    this.stopPing();
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isOnline(userId?: string | null): boolean {
    if (!userId) return false;
    return this.onlineUserIds.includes(userId);
  }

  public send(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  public joinSpeedQueue(user: SceneUser): boolean {
    return this.send({ type: 'speed_queue_join', user });
  }

  public leaveSpeedQueue(): boolean {
    return this.send({ type: 'speed_queue_leave' });
  }

  public joinChessQueue(
    user: { id: string; alias: string; username?: string; avatar: SceneUser['avatar'] },
    timeControlMs: number
  ): boolean {
    return this.send({ type: 'chess_queue_join', user, timeControlMs });
  }

  public leaveChessQueue(): boolean {
    return this.send({ type: 'chess_queue_leave' });
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ type: 'ping' });
    }, 25000);
  }

  private stopPing() {
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalClose || !this.userId) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose && this.userId) {
        this.connect(this.userId, this.alias);
      }
    }, 2500);
  }
}

export const lobbySocket = new LobbySocketClient();
