import { io } from 'socket.io-client';
import { API_URL, getToken } from './api.js';

let socket;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      auth: { token: getToken() },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 800
    });
    socket.on('connect', () => console.log('[socket] connected', socket.id));
    socket.on('connect_error', (err) => console.warn('[socket] connect_error', err.message));
    socket.on('disconnect', (reason) => console.log('[socket] disconnected', reason));
  }
  socket.auth = { token: getToken() };
  if (!socket.connected) socket.connect();
  return socket;
}
