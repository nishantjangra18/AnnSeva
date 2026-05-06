import http from 'node:http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { registerSocketHandlers } from './sockets/location.socket.js';
import { corsOrigins } from './config/cors.js';

dotenv.config();

const port = process.env.PORT || 5000;
const app = createApp();
const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: corsOrigins(),
    credentials: true
  }
});

app.set('io', io);
registerSocketHandlers(io);

await connectDb();

server.listen(port, () => {
  console.log(`AnnSeva API listening on http://localhost:${port}`);
});
