const Client = require('socket.io-client');
const axios = require('axios');
require('dotenv').config();

const SERVER_URL = 'http://localhost:5000'; // Match the PORT in server.js

let adminToken;

beforeAll((done) => {
  axios.post(`${SERVER_URL}/api/auth/login`, {
    email: process.env.TEST_ADMIN_USER,
    password: process.env.TEST_ADMIN_PASSWORD
  })
  .then(res => {
    adminToken = res.data.token;
    done();
  })
  .catch(done);
});

function cleanupRoom(roomCode) {
  return axios.delete(`${SERVER_URL}/api/rooms/${roomCode}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  })
  .catch(err => {
    if (err.response) {
      console.log('Delete room error response:', err.response.data);
    }
    throw err;
  });
}

describe('Socket.io Connection', () => {
  test('should connect to backend Socket.io server', (done) => {
    const client = Client(SERVER_URL);
    client.on('connect', () => {
      expect(client.connected).toBe(true);
      client.close();
      done();
    });
    client.on('connect_error', (err) => {
      done(err);
    });
  });
});

describe('Room Operations', () => {
  test('should create a room and receive roomCreated event', (done) => {
    const client = Client(SERVER_URL);
    const testUser = { userId: '507f1f77bcf86cd799439011', email: 'test1@example.com' };
    client.on('connect', () => {
      client.emit('createRoom', testUser);
    });
    client.on('roomCreated', (data) => {
      expect(data).toBeDefined();
      expect(data.roomCode).toBeDefined();
      expect(data.game).toBeDefined();
      expect(data.game.players[0].userId).toBe(testUser.userId);
      createdRoomCode = data.roomCode;
      client.close();

      cleanupRoom(createdRoomCode)
        .then(() => done())
        .catch(done);
    });

    client.on('error', (err) => {
      client.close();
      done(err);
    });
  });

  test('should allow a user to join a created room', (done) => {
    const client1 = Client(SERVER_URL);
    const client2 = Client(SERVER_URL);
    const testUser1 = { userId: '507f1f77bcf86cd799439012', email: 'test2@example.com' };
    const testUser2 = { userId: '507f1f77bcf86cd799439013', email: 'test3@example.com' };
    let createdRoomCode = null;

    client1.on('connect', () => {
      client1.emit('createRoom', testUser1);
    });

    client1.on('roomCreated', (data) => {
      createdRoomCode = data.roomCode;
      client2.emit('joinRoom', { roomCode: createdRoomCode, userId: testUser2.userId, email: testUser2.email });
    });

    client2.on('roomJoined', (data) => {
      expect(data).toBeDefined();
      expect(data.game).toBeDefined();
      expect(data.game.players.length).toBeGreaterThanOrEqual(2);
      client1.close();
      client2.close();
      cleanupRoom(createdRoomCode)
        .then(() => done())
        .catch(done);
    });
    
    client2.on('error', (err) => {
      client1.close();
      client2.close();
      done(err);
    });
  });

  test('should not allow joining a non-existent room', (done) => {
    const client = Client(SERVER_URL);
    const testUser = { userId: '507f1f77bcf86cd799439014', email: 'test4@example.com' };
    client.on('connect', () => {
      client.emit('joinRoom', { roomCode: 'NONEXISTENTROOM', userId: testUser.userId, email: testUser.email });
    });

    client.on('error', (err) => {
      expect(err).toBeDefined();
      expect(err.message).toMatch(/room not found/i);
      client.close();
      done();
    });
    setTimeout(() => {
      client.close();
      done(new Error('No error received when joining a non-existent room'));
    }, 2000);
  });
});

describe('End-to-End: Whist Full Game', () => {
  const users = [
    { email: process.env.TEST_USER1, password: process.env.TEST_PASSWORD },
    { email: process.env.TEST_USER2, password: process.env.TEST_PASSWORD },
    { email: process.env.TEST_USER3, password: process.env.TEST_PASSWORD },
    { email: process.env.TEST_USER4, password: process.env.TEST_PASSWORD }
  ];

  let tokens = [];
  beforeAll(async () => {
    for (const user of users) {
      if (!user.email || !user.password) {
        throw new Error('Please provide credentials for four test users in your .env file as TEST_USER1, TEST_PASSWORD, etc.');
      }
      const res = await axios.post(`${SERVER_URL}/api/auth/login`, {
        email: user.email,
        password: user.password
      });
      tokens.push(res.data.token);
    }
  });

  let clients = [];
  let createdRoomCode = null;
  afterAll(async () => {
    clients.forEach(client => client.close());
    if (createdRoomCode && !process.env.SKIP_ROOM_CLEANUP) {
      try {
        await cleanupRoom(createdRoomCode);
      } catch (err) {
        // Log but do not throw to avoid failing the suite on cleanup
        console.error('Room cleanup failed:', err.message || err);
      }
    }
  });

  test('connects four socket clients', async () => {
    for (let i = 0; i < 4; i++) {
      const client = Client(SERVER_URL, {
        auth: { token: tokens[i] }
      });
      clients.push(client);
      await new Promise((resolve, reject) => {
        client.on('connect', resolve);
        client.on('connect_error', reject);
      });
      expect(client.connected).toBe(true);
    }
  });

  test('creates room and allows others to join', async () => {
    // Use valid MongoDB ObjectId strings for userId
    const userIds = [
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439013',
      '507f1f77bcf86cd799439014'
    ];

    // TEST_USER1 creates the room
    const user1 = { userId: userIds[0], email: users[0].email };
    let roomCode;
    await new Promise((resolve, reject) => {
      clients[0].emit('createRoom', user1);
      clients[0].on('roomCreated', (data) => {
        try {
          expect(data).toBeDefined();
          expect(data.roomCode).toBeDefined();
          expect(data.game).toBeDefined();
          expect(data.game.players[0].userId).toBe(user1.userId);
          roomCode = data.roomCode;
          createdRoomCode = data.roomCode;
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      clients[0].on('error', reject);
    });

    // Other users join the room
    for (let i = 1; i < 4; i++) {
      const joinUser = { userId: userIds[i], email: users[i].email };
      await new Promise((resolve, reject) => {
        clients[i].emit('joinRoom', { roomCode, userId: joinUser.userId, email: joinUser.email });
        clients[i].on('roomJoined', (data) => {
          try {
            expect(data).toBeDefined();
            expect(data.game).toBeDefined();
            expect(data.game.players.some(p => p.userId === joinUser.userId)).toBe(true);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        clients[i].on('error', reject);
      });
    }
  });
});
