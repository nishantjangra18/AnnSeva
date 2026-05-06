export function corsOrigins() {
  const configured = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  return Array.from(new Set([
    configured,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
  ]));
}
