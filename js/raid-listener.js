import { RaidHistory } from './raid-history.js';

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

/**
 * Listens for channel.raid events targeting the logged-in broadcaster,
 * using Twitch's EventSub WebSocket transport — the only way to observe
 * raids at all, since Twitch has no REST endpoint for past raid history.
 * This only captures raids that happen while connected; see
 * raid-history.js for the caveat that implies.
 *
 * channel.raid needs no special OAuth scope over the WebSocket transport
 * (just a valid user token), so this works with the scopes the app
 * already requests at login.
 */
export class RaidListener {
  constructor(api, broadcasterId, { onRaid, onStatusChange } = {}) {
    this.api = api;
    this.broadcasterId = broadcasterId;
    this.onRaid = onRaid ?? (() => {});
    this.onStatusChange = onStatusChange ?? (() => {});
    this.socket = null;
    this.status = 'disconnected'; // disconnected | connecting | connected | error
  }

  start() {
    this._connect(EVENTSUB_WS_URL);
  }

  stop() {
    this.socket?.close();
    this.socket = null;
    this._setStatus('disconnected');
  }

  _setStatus(status) {
    this.status = status;
    this.onStatusChange(status);
  }

  _connect(url) {
    this._setStatus('connecting');
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this._handleMessage(message);
    });

    socket.addEventListener('close', () => {
      if (this.socket === socket) this._setStatus('disconnected');
    });

    socket.addEventListener('error', () => {
      if (this.socket === socket) this._setStatus('error');
    });
  }

  async _handleMessage(message) {
    const type = message.metadata?.message_type;

    if (type === 'session_welcome') {
      const sessionId = message.payload.session.id;
      try {
        await this.api.createEventSubWebSocketSubscription(
          'channel.raid',
          '1',
          { to_broadcaster_user_id: this.broadcasterId },
          sessionId
        );
        this._setStatus('connected');
      } catch (e) {
        console.error('Failed to subscribe to channel.raid:', e);
        this._setStatus('error');
      }
      return;
    }

    if (type === 'session_reconnect') {
      // Twitch is asking us to migrate to a new session before this one
      // closes; existing subscriptions carry over automatically.
      const reconnectUrl = message.payload.session.reconnect_url;
      const oldSocket = this.socket;
      this._connect(reconnectUrl);
      setTimeout(() => oldSocket?.close(), 1000);
      return;
    }

    if (type === 'notification' && message.payload?.subscription?.type === 'channel.raid') {
      const event = message.payload.event;
      RaidHistory.record({
        broadcasterId: event.from_broadcaster_user_id,
        login: event.from_broadcaster_user_login,
        displayName: event.from_broadcaster_user_name,
        viewerCount: event.viewers,
        raidedAt: new Date().toISOString(),
        toBroadcasterId: event.to_broadcaster_user_id,
      });
      this.onRaid(event);
      return;
    }

    // 'session_keepalive' and 'revocation' messages need no handling here.
  }
}
