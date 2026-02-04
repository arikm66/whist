const Client = require('socket.io-client');
require('dotenv').config();
const { createTestSetup, SERVER_URL } = require('./helpers/testSetup');
const {
  testLog,
  emitAndWait,
  waitForConnections,
  createRoom,
  joinRoom
} = require('./helpers/socketHelpers');

const setup = createTestSetup();

beforeAll(async () => {
  await setup.loginAdmin();
});

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
  test('should create a room and receive roomCreated event', async () => {
    const client = Client(SERVER_URL);
    const testUser = { userId: '507f1f77bcf86cd799439011', email: 'test1@example.com' };
    
    await waitForConnections([client]);
    
    const data = await createRoom(client, testUser);
    expect(data).toBeDefined();
    expect(data.roomCode).toBeDefined();
    expect(data.game).toBeDefined();
    expect(data.game.players[0].userId).toBe(testUser.userId);
    
    client.close();
    await setup.deleteRoom(data.roomCode);
  });

  test('should allow a user to join a created room', async () => {
    const client1 = Client(SERVER_URL);
    const client2 = Client(SERVER_URL);
    const testUser1 = { userId: '507f1f77bcf86cd799439012', email: 'test2@example.com' };
    const testUser2 = { userId: '507f1f77bcf86cd799439013', email: 'test3@example.com' };

    await waitForConnections([client1, client2]);
    
    const roomData = await createRoom(client1, testUser1);
    const createdRoomCode = roomData.roomCode;
    
    const joinData = await joinRoom(client2, createdRoomCode, testUser2);
    expect(joinData).toBeDefined();
    expect(joinData.game).toBeDefined();
    expect(joinData.game.players.length).toBeGreaterThanOrEqual(2);
    
    client1.close();
    client2.close();
    await setup.deleteRoom(createdRoomCode);
  });

  test('should not allow joining a non-existent room', async () => {
    const client = Client(SERVER_URL);
    const testUser = { userId: '507f1f77bcf86cd799439014', email: 'test4@example.com' };
    
    await waitForConnections([client]);
    
    // Server emits 'error' event but we're waiting for 'roomJoined', so it will timeout or error
    try {
      await emitAndWait(
        client,
        'joinRoom',
        { roomCode: 'NONEXISTENTROOM', userId: testUser.userId, email: testUser.email },
        'roomJoined',
        2000
      );
      // If we get here, the test should fail
      expect(true).toBe(false); // Force fail if no error thrown
    } catch (error) {
      // Expect either a timeout or room not found error
      expect(error).toBeDefined();
      expect(error.message).toMatch(/(Timeout|Room not found)/i);
    } finally {
      client.close();
    }
  });
});