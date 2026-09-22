const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const rooms = new Map();
const clients = new Map();
const POINTS = [5, 3, 2, 1];
const NORMAL_ROUNDS = 10;

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  const name = String(value || '').trim().replace(/[^\w \-]/g, '').slice(0, 16);
  return name || 'Player';
}

function send(socket, message) {
  if (!socket || socket.destroyed) return;
  const body = Buffer.from(JSON.stringify(message));
  const length = body.length;
  const header = length < 126 ? Buffer.from([0x81, length]) : Buffer.from([0x81, 126, length >> 8, length & 255]);
  socket.write(Buffer.concat([header, body]));
}

function broadcast(room, message) {
  for (const player of room.players.values()) send(player.socket, message);
}

function publicPlayers(room) {
  return [...room.players.values()].map(({ id, name, score, locked }) => ({ id, name, score, locked }));
}

function snapshot(room) {
  return {
    type: 'state',
    roomCode: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    suddenDeath: room.suddenDeath,
    players: publicPlayers(room),
    cueAt: room.cueAt || null,
    fakeouts: room.fakeouts || [],
    lastResults: room.lastResults || [],
    winnerIds: room.winnerIds || [],
    serverNow: Date.now(),
  };
}

function announce(room) { broadcast(room, snapshot(room)); }

function schedule(room, delay, callback) {
  const timer = setTimeout(() => {
    room.timers.delete(timer);
    if (rooms.get(room.code) === room) callback();
  }, delay);
  room.timers.add(timer);
}

function beginRound(room, suddenDeath = false) {
  room.phase = 'countdown';
  room.suddenDeath = suddenDeath;
  room.reactions = [];
  room.cueAt = Date.now() + 4000;
  room.fakeouts = [room.cueAt - 2800, room.cueAt - 1450];
  for (const player of room.players.values()) player.locked = false;
  announce(room);

  schedule(room, 4000, () => {
    if (room.phase !== 'countdown') return;
    room.phase = 'active';
    announce(room);
    // Sudden death gets a little more breathing room. It never declares a
    // winner without a real, server-accepted reaction.
    schedule(room, suddenDeath ? 7000 : 4500, () => finishRound(room));
  });
}

function finishRound(room) {
  if (room.phase !== 'active') return;
  room.phase = 'results';
  const results = room.reactions.map((reaction, index) => ({
    id: reaction.id,
    name: room.players.get(reaction.id)?.name || 'Disconnected player',
    points: POINTS[index] || 0,
    reactionMs: reaction.at - room.cueAt,
  }));
  room.lastResults = results;
  announce(room);
  schedule(room, 3800, () => advance(room));
}

function leaders(room) {
  const highest = Math.max(...[...room.players.values()].map(p => p.score));
  return [...room.players.values()].filter(p => p.score === highest);
}

function advance(room) {
  if (room.suddenDeath) {
    // A round where everyone false-started (or simply missed the cue) is not
    // a tie-break result. Run another clean sudden-death attempt instead.
    if (!room.reactions.length) return beginRound(room, true);
    room.phase = 'winner';
    room.winnerIds = room.reactions.length ? [room.reactions[0].id] : [];
    announce(room);
    return;
  }
  if (room.round < NORMAL_ROUNDS) {
    room.round += 1;
    beginRound(room);
    return;
  }
  const tied = leaders(room);
  if (tied.length === 1) {
    room.phase = 'winner';
    room.winnerIds = [tied[0].id];
    announce(room);
    return;
  }
  // Only the tied leaders remain eligible during sudden death.
  for (const player of room.players.values()) player.locked = !tied.some(leader => leader.id === player.id);
  room.suddenDeathPlayers = new Set(tied.map(player => player.id));
  beginRound(room, true);
}

function createRoom(socket, name) {
  const id = crypto.randomUUID();
  const room = { code: makeCode(), players: new Map(), hostId: id, phase: 'lobby', round: 0, suddenDeath: false, timers: new Set() };
  const player = { id, name: cleanName(name), socket, score: 0, locked: false };
  room.players.set(id, player);
  rooms.set(room.code, room);
  clients.set(socket, { room, id });
  send(socket, { ...snapshot(room), selfId: id });
}

function joinRoom(socket, code, name) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) return send(socket, { type: 'error', message: 'Room not found. Check the code and try again.' });
  if (room.phase !== 'lobby') return send(socket, { type: 'error', message: 'This match is already in progress. Please wait for the next match.' });
  if (room.players.size >= 8) return send(socket, { type: 'error', message: 'This room is full.' });
  const id = crypto.randomUUID();
  room.players.set(id, { id, name: cleanName(name), socket, score: 0, locked: false });
  clients.set(socket, { room, id });
  send(socket, { ...snapshot(room), selfId: id });
  announce(room);
}

function handleMessage(socket, message) {
  const client = clients.get(socket);
  if (message.type === 'create' && !client) return createRoom(socket, message.name);
  if (message.type === 'join' && !client) return joinRoom(socket, message.code, message.name);
  if (!client) return;
  const { room, id } = client;
  if (message.type === 'start') {
    if (id !== room.hostId) return send(socket, { type: 'error', message: 'Only the host can start.' });
    if (room.phase !== 'lobby' || room.players.size < 2) return send(socket, { type: 'error', message: 'At least two players are needed.' });
    room.round = 1;
    beginRound(room);
    return;
  }
  if (message.type === 'react') {
    const player = room.players.get(id);
    if (!player || player.locked || (room.suddenDeath && !room.suddenDeathPlayers?.has(id))) return;
    if (room.phase === 'countdown') {
      player.locked = true;
      send(socket, { type: 'tooEarly' });
      announce(room);
      return;
    }
    if (room.phase !== 'active' || room.reactions.some(r => r.id === id)) return;
    const at = Date.now();
    const place = room.reactions.length;
    room.reactions.push({ id, at });
    player.score += room.suddenDeath ? 0 : (POINTS[place] || 0);
    player.locked = true;
    // The first valid sudden-death reaction is definitive. Closing the round
    // immediately prevents a later tap from overwriting or sharing the win.
    if (room.suddenDeath) return finishRound(room);
    announce(room);
  }
}

function leave(socket) {
  const client = clients.get(socket);
  if (!client) return;
  clients.delete(socket);
  const { room, id } = client;
  room.players.delete(id);
  if (room.players.size === 0) {
    for (const timer of room.timers) clearTimeout(timer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === id) room.hostId = room.players.keys().next().value;
  if (room.phase === 'lobby') announce(room);
}

function parseFrames(socket, chunk) {
  socket.buffer = Buffer.concat([socket.buffer || Buffer.alloc(0), chunk]);
  while (socket.buffer.length >= 2) {
    const first = socket.buffer[0]; const second = socket.buffer[1];
    const opcode = first & 15; let length = second & 127; let offset = 2;
    if (length === 126) { if (socket.buffer.length < 4) return; length = socket.buffer.readUInt16BE(2); offset = 4; }
    if (length === 127 || socket.buffer.length < offset + 4 + length) return;
    const mask = socket.buffer.subarray(offset, offset + 4); offset += 4;
    const payload = Buffer.from(socket.buffer.subarray(offset, offset + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    socket.buffer = socket.buffer.subarray(offset + length);
    if (opcode === 8) return socket.end();
    if (opcode === 1) { try { handleMessage(socket, JSON.parse(payload.toString())); } catch { send(socket, { type: 'error', message: 'Invalid message.' }); } }
  }
}

const server = http.createServer((req, res) => {
  const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.normalize(path.join(ROOT, 'public', requested));
  if (!file.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
});
server.on('upgrade', (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.on('data', chunk => parseFrames(socket, chunk)); socket.on('close', () => leave(socket)); socket.on('error', () => leave(socket));
});
server.listen(PORT, () => console.log(`Wait For It! is running on http://localhost:${PORT}`));

