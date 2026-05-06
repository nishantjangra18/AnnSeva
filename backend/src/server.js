import http from 'node:http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { registerSocketHandlers } from './sockets/location.socket.js';

dotenv.config();

const PORT = process.env.PORT || 8080;
const app = createApp();
const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: '*',
    credentials: true
  }
});

app.set('io', io);
registerSocketHandlers(io);

await connectDb();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
