// ...existing code...
// Integration tests for Socket.io game logic in Whist
// Environment: Jest, socket.io-client

const { Server } = require('socket.io');
const Client = require('socket.io-client');
const http = require('http');

let io, serverSocket, httpServer, httpServerAddr;

beforeAll((done) => {
  httpServer = http.createServer();
  io = new Server(httpServer);
  // Track players in each room
  const roomPlayers = {};
  io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
      const { roomId, playerId } = data;
      if (!roomPlayers[roomId]) roomPlayers[roomId] = new Set();
      if (roomPlayers[roomId].size >= 4) {
        socket.emit('joinRejected', { reason: 'Room is full' });
        return;
      }
      roomPlayers[roomId].add(playerId);
      socket.join(roomId);
      // Store playerId and roomId on socket for disconnect cleanup
      socket._whistPlayerId = playerId;
      socket._whistRoomId = roomId;
      socket.emit('joinedGame', { roomId, playerId });
    });
    socket.on('disconnecting', () => {
      const roomId = socket._whistRoomId;
      const playerId = socket._whistPlayerId;
      if (roomId && playerId && roomPlayers[roomId]) {
        roomPlayers[roomId].delete(playerId);
      }
    });
  });
  httpServer.listen(() => {
    httpServerAddr = httpServer.address();
    done();
  });
});

afterAll((done) => {
  io.close();
  httpServer.close(done);
});

// Example: Connect four clients and join a room
describe('Socket.io Whist Game Integration', () => {
  let clients = [];

  beforeEach((done) => {
    clients = [];
    let connected = 0;
    for (let i = 0; i < 4; i++) {
      const client = Client(`http://localhost:${httpServerAddr.port}`);
      clients.push(client);
      client.on('connect', () => {
        connected++;
        if (connected === 4) done();
      });
    }
  });

  afterEach(() => {
    clients.forEach((client) => client.disconnect());
  });

  it('should allow four players to join a game room', (done) => {
    let joinCount = 0;
    clients.forEach((client, idx) => {
      client.emit('joinGame', { roomId: 'test-room', playerId: `player${idx}` });
      client.on('joinedGame', (data) => {
        joinCount++;
        if (joinCount === 4) done();
      });
    });
  });

  it('should reject a 5th player from joining a full game room', (done) => {
    // First, connect 4 players and join the room
    let joinCount = 0;
    clients.forEach((client, idx) => {
      client.emit('joinGame', { roomId: 'full-room', playerId: `player${idx}` });
      client.on('joinedGame', () => {
        joinCount++;
        if (joinCount === 4) {
          // Now try to connect a 5th player
          const fifthClient = Client(`http://localhost:${httpServerAddr.port}`);
          fifthClient.on('connect', () => {
            fifthClient.emit('joinGame', { roomId: 'full-room', playerId: 'player4' });
          });
          fifthClient.on('joinRejected', (data) => {
            expect(data).toBeDefined();
            expect(data.reason).toBe('Room is full');
            fifthClient.disconnect();
            done();
          });
        }
      });
    });
  });
  it('should allow a 5th player to join after one leaves', (done) => {
    let joinCount = 0;
    let firstFour = [];
    clients.forEach((client, idx) => {
      firstFour.push(client);
      client.emit('joinGame', { roomId: 'leave-room', playerId: `player${idx}` });
      client.on('joinedGame', () => {
        joinCount++;
        if (joinCount === 4) {
          // Disconnect the first player
          firstFour[0].disconnect();
          setTimeout(() => {
            // Now try to connect a 5th player
            const fifthClient = Client(`http://localhost:${httpServerAddr.port}`);
            fifthClient.on('connect', () => {
              fifthClient.emit('joinGame', { roomId: 'leave-room', playerId: 'player4' });
            });
            fifthClient.on('joinedGame', (data) => {
              expect(data).toBeDefined();
              expect(data.roomId).toBe('leave-room');
              expect(data.playerId).toBe('player4');
              fifthClient.disconnect();
              done();
            });
            fifthClient.on('joinRejected', () => {
              // Should not be called
              done(new Error('5th player was incorrectly rejected after a player left'));
            });
          }, 200); // Wait a bit for the disconnect to propagate
        }
      });
    });
  });
});
