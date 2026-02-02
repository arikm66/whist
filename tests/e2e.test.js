const fs = require('fs');
const path = require('path');
const Client = require('socket.io-client');
const axios = require('axios');
require('dotenv').config();

const SERVER_URL = 'http://localhost:5000'; // Match the PORT in server.js
const TEST_LOG_PATH = path.join(__dirname, 'test-debug.log');
function testLog(msg) {
  fs.appendFileSync(TEST_LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
}

describe('E2E Whist Game', () => {
    testLog(`===== Starting E2E Whist Game tests`);
    let tokens = [];
    let clients = [];
    let roomCode;
    const users = [
      {
        email: process.env.TEST_USER1,
        password: process.env.TEST_PASSWORD,
        userId: '507f1f77bcf86cd799439011'
      },
      {
        email: process.env.TEST_USER2,
        password: process.env.TEST_PASSWORD,
        userId: '507f1f77bcf86cd799439012'
      },
      {
        email: process.env.TEST_USER3,
        password: process.env.TEST_PASSWORD,
        userId: '507f1f77bcf86cd799439013'
      },
      {
        email: process.env.TEST_USER4,
        password: process.env.TEST_PASSWORD,
        userId: '507f1f77bcf86cd799439014'
      }
    ];

    afterAll(async () => {
      if (clients && clients.length) {
        clients.forEach(client => {
          try {
            client.close();
          } catch (err) {
            // Ignore errors on close
          }
        });
      }
      // Delete the room if it was created and SKIP_ROOM_CLEANUP is not set
      if (roomCode && !process.env.SKIP_ROOM_CLEANUP) {
        try {
          const adminRes = await axios.post(`${SERVER_URL}/api/auth/login`, {
            email: process.env.TEST_ADMIN_USER,
            password: process.env.TEST_ADMIN_PASSWORD
          });
          const adminToken = adminRes.data.token;
          await axios.delete(`${SERVER_URL}/api/rooms/${roomCode}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
          });
          testLog(`Room ${roomCode} deleted in afterAll.`);
        } catch (err) {
          testLog(`Room cleanup failed: ${err.message || err}`);
        }
      } else if (roomCode) {
        testLog(`Room cleanup skipped due to SKIP_ROOM_CLEANUP env variable.`);
      }
    });

    test('logs in 4 players', async () => {
      expect(users.every(u => u.email && u.password && u.userId)).toBe(true);

      testLog(`Starting login for 4 test users: ${users.map(u => u.email).join(', ')}`);
      tokens = [];
      for (const user of users) {
        const res = await axios.post(`${SERVER_URL}/api/auth/login`, {
          email: user.email,
          password: user.password
        });
        expect(res.data.token).toBeDefined();
        tokens.push(res.data.token);
      }
      expect(tokens).toHaveLength(4);
      testLog(`Successfully logged in 4 test users with tokens: ${tokens.map((t, i) => `User${i+1}: ${t.substring(0,10)}...`).join(', ')}`);
    });

    test('connects 4 socket clients', async () => {
        expect(tokens).toHaveLength(4);
        clients = [];
        for (let i = 0; i < 4; i++) {
            clients.push(Client(SERVER_URL, { auth: { token: tokens[i] } }));
        }
        // Wait for all clients to connect
        for (let i = 0; i < 4; i++) {
            await new Promise((resolve, reject) => {
                clients[i].on('connect', resolve);
                clients[i].on('connect_error', reject);
            });
            expect(clients[i].connected).toBe(true);
        }
        testLog('All 4 clients connected');
    });

    test('user1 creates a room and all four players join', async () => {
        expect(clients).toHaveLength(4);
        await new Promise((resolve, reject) => {
            clients[0].emit('createRoom', { userId: users[0].userId, email: users[0].email });
            clients[0].on('roomCreated', (data) => {
                try {
                expect(data).toBeDefined();
                expect(data.roomCode).toBeDefined();
                expect(data.game).toBeDefined();
                expect(data.game.players[0].userId).toBe(users[0].userId);
                roomCode = data.roomCode;
                testLog(`Room created by user1: ${roomCode}`);
                resolve();
                } catch (err) {
                reject(err);
                }
            });
            clients[0].on('error', reject);
        });

        // Other users join the room
        for (let i = 1; i < 4; i++) {
        await new Promise((resolve, reject) => {
            clients[i].emit('joinRoom', { roomCode, userId: users[i].userId, email: users[i].email });
            clients[i].on('roomJoined', (data) => {
            try {
                expect(data).toBeDefined();
                expect(data.game).toBeDefined();
                expect(data.game.players.some(p => p.userId === users[i].userId)).toBe(true);
                testLog(`User${i+1} joined room: ${roomCode}`);
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
