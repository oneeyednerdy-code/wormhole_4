const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const MAX_RECONNECT_DELAY_MS = 30_000;
const SEEN_MESSAGE_LIMIT = 200;

/** Maintains an outgoing channel.raid subscription to confirm completed raids. */
export class RaidListener {
  constructor(api, broadcasterId, { onRaidSent, onStatusChange } = {}) {
    this.api = api;
    this.broadcasterId = broadcasterId;
    this.onRaidSent = onRaidSent ?? (() => {});
    this.onStatusChange = onStatusChange ?? (() => {});
    this.socket = null;
    this.sockets = new Set();
    this.status = 'disconnected';
    this.shouldStop = true;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.keepaliveTimer = null;
    this.keepaliveTimeoutSeconds = 10;
    this.seenMessageIds = new Set();
  }

  start() {
    this.stop();
    this.shouldStop = false;
    this._connect(EVENTSUB_WS_URL);
  }

  stop() {
    this.shouldStop = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.keepaliveTimer);
    this.reconnectTimer = null;
    this.keepaliveTimer = null;
    for (const socket of this.sockets) socket.close();
    this.sockets.clear();
    this.socket = null;
    this._setStatus('disconnected');
  }

  _setStatus(status) {
    this.status = status;
    this.onStatusChange(status);
  }

  _connect(url, { isTwitchReconnect = false, oldSocket = null } = {}) {
    if (this.shouldStop) return;
    this._setStatus('connecting');
    const socket = new WebSocket(url);
    this.socket = socket;
    this.sockets.add(socket);

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      const messageId = message.metadata?.message_id;
      if (messageId && this.seenMessageIds.has(messageId)) return;
      if (messageId) {
        this.seenMessageIds.add(messageId);
        if (this.seenMessageIds.size > SEEN_MESSAGE_LIMIT) {
          this.seenMessageIds.delete(this.seenMessageIds.values().next().value);
        }
      }

      this._handleMessage(message, socket, { isTwitchReconnect, oldSocket });
    });

    socket.addEventListener('close', () => {
      this.sockets.delete(socket);
      if (this.shouldStop || this.socket !== socket) return;
      clearTimeout(this.keepaliveTimer);
      this._setStatus('disconnected');
      this._scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (this.socket === socket && !this.shouldStop) this._setStatus('error');
    });
  }

  _scheduleReconnect() {
    if (this.shouldStop || this.reconnectTimer) return;
    this._setStatus('reconnecting');
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect(EVENTSUB_WS_URL);
    }, delay);
  }

  _armKeepaliveTimer() {
    clearTimeout(this.keepaliveTimer);
    if (this.shouldStop) return;
    this.keepaliveTimer = setTimeout(() => {
      if (this.shouldStop) return;
      this.socket?.close();
    }, (this.keepaliveTimeoutSeconds + 5) * 1000);
  }

  async _handleMessage(message, socket, { isTwitchReconnect, oldSocket }) {
    const type = message.metadata?.message_type;

    if (type === 'session_welcome') {
      this.keepaliveTimeoutSeconds = message.payload.session.keepalive_timeout_seconds ?? 10;
      this.reconnectAttempt = 0;
      this._armKeepaliveTimer();

      try {
        if (!isTwitchReconnect) {
          const sessionId = message.payload.session.id;
          await this.api.createEventSubWebSocketSubscription(
            'channel.raid',
            '1',
            { from_broadcaster_user_id: this.broadcasterId },
            sessionId
          );
        }
        this._setStatus('connected');
        if (oldSocket) {
          oldSocket.close();
          this.sockets.delete(oldSocket);
        }
      } catch (error) {
        console.error('Failed to subscribe to channel.raid:', error);
        this._setStatus('error');
        socket.close();
      }
      return;
    }

    if (type === 'session_keepalive' || type === 'notification') {
      this._armKeepaliveTimer();
    }

    if (type === 'session_reconnect') {
      const reconnectUrl = message.payload.session.reconnect_url;
      this._connect(reconnectUrl, { isTwitchReconnect: true, oldSocket: socket });
      return;
    }

    if (type === 'revocation') {
      console.error('Twitch revoked an EventSub subscription:', message.payload?.subscription?.status);
      this._setStatus('error');
      return;
    }

    if (type !== 'notification' || message.payload?.subscription?.type !== 'channel.raid') {
      return;
    }

    const event = message.payload.event;
    if (event.from_broadcaster_user_id === this.broadcasterId) this.onRaidSent(event);
  }
}
