const { spawn } = require('child_process');
const path = require('path');
const Client = require('socket.io-client');
const fs = require('fs');
const axios = require('axios');

const out = fs.openSync('./server-test.log', 'a'); // 'a' for append mode
let serverProcess;
const SERVER_URL = 'http://localhost:6000'; // Points to the test server we are going to start using spawn

beforeAll((done) => {
  // Start the backend server as a child process
  serverProcess = spawn('node', [path.join(__dirname, '../server.js')], {
    env: { ...process.env, NODE_ENV: 'test', PORT: 6000 },
    stdio: ['ignore', out, out],
    cwd: path.join(__dirname, '..'),
  });
  // Wait for server to be ready
  setTimeout(done, 3000); // Adjust delay if needed
});

afterAll((done) => {
  if (serverProcess) serverProcess.kill();
  setTimeout(done, 500);
});

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

test('should create a room and receive roomCreated event', (done) => {
  const client = Client(SERVER_URL);
  // Use a valid ObjectId string for userId
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


    // Cleanup: log in as admin and delete the created room via API
    axios.post(`${SERVER_URL}/api/auth/login`, {
      email: 'arikm66@yahoo.com',
      password: 'Vibe@2026'
    })
    .then(res => {
      const token = res.data.token;
      return axios.delete(`${SERVER_URL}/api/rooms/${createdRoomCode}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    })
    .then(() => done())
    .catch(err => done(err));
  });

  client.on('error', (err) => {
    client.close();
    done(err);
  });
});