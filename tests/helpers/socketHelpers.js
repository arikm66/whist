const fs = require('fs');
const path = require('path');

const TEST_LOG_PATH = path.join(__dirname, '..', 'test-debug.log');

function testLog(msg) {
  fs.appendFileSync(TEST_LOG_PATH, `[${new Date().toLocaleString('en-US', { hour12: false, timeZoneName: 'short' })}] ${msg}\n`);
}

/**
 * Emit a socket event and wait for a response
 * @param {Object} client - Socket.IO client
 * @param {string} emitEvent - Event to emit
 * @param {Object} emitData - Data to send
 * @param {string} responseEvent - Event to wait for
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Response data
 */
async function emitAndWait(client, emitEvent, emitData, responseEvent, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${responseEvent} after ${emitEvent}`));
    }, timeout);
    
    client.once(responseEvent, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    
    client.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    
    client.emit(emitEvent, emitData);
  });
}

/**
 * Wait for multiple clients to connect
 * @param {Array} clients - Array of socket clients
 * @returns {Promise<void>}
 */
async function waitForConnections(clients) {
  for (let i = 0; i < clients.length; i++) {
    await new Promise((resolve, reject) => {
      if (clients[i].connected) {
        resolve();
        return;
      }
      clients[i].on('connect', resolve);
      clients[i].on('connect_error', reject);
    });
  }
}

/**
 * Create a room with the first user
 * @param {Object} client - Socket.IO client
 * @param {Object} user - User object with userId and email
 * @returns {Promise<Object>} Room data with roomCode and game
 */
async function createRoom(client, user) {
  const data = await emitAndWait(
    client,
    'createRoom',
    { userId: user.userId, email: user.email },
    'roomCreated'
  );
  testLog(`Room created by ${user.email}: ${data.roomCode}`);
  return data;
}

/**
 * Join a room
 * @param {Object} client - Socket.IO client
 * @param {string} roomCode - Room code to join
 * @param {Object} user - User object with userId and email
 * @returns {Promise<Object>} Room data
 */
async function joinRoom(client, roomCode, user) {
  const data = await emitAndWait(
    client,
    'joinRoom',
    { roomCode, userId: user.userId, email: user.email },
    'roomJoined'
  );
  testLog(`${user.email} joined room: ${roomCode}`);
  return data;
}

/**
 * Get rooms list from server
 * @param {Object} client - Socket.IO client
 * @returns {Promise<Array>} Array of rooms
 */
async function getRoomsList(client) {
  const data = await emitAndWait(client, 'getRooms', {}, 'roomsList');
  return Array.isArray(data) ? data : data.rooms;
}

/**
 * Place an auction bid
 * @param {Object} client - Socket.IO client
 * @param {string} roomCode - Room code
 * @param {string} userId - User ID
 * @param {number} quantity - Bid quantity
 * @param {string} suit - Bid suit
 * @returns {Promise<Object>} Bid data
 */
async function placeAuctionBid(client, roomCode, userId, quantity, suit) {
  const data = await emitAndWait(
    client,
    'placeAuctionBid',
    { roomCode, userId, quantity, suit },
    'auctionBidPlaced'
  );
  testLog(`Player placed auction bid: ${quantity} ${suit}`);
  return data;
}

/**
 * Pass in auction
 * @param {Object} client - Socket.IO client
 * @param {string} roomCode - Room code
 * @param {string} userId - User ID
 * @param {number} playerIdx - Player index for logging
 * @returns {Promise<Object>} Pass data
 */
async function passAuction(client, roomCode, userId, playerIdx) {
  const data = await emitAndWait(
    client,
    'passAuction',
    { roomCode, userId },
    'auctionPassed'
  );
  testLog(`Player ${playerIdx} passed auction`);
  return data;
}

/**
 * Pass in auction and wait for auction complete (for final pass)
 * @param {Object} client - Socket.IO client
 * @param {string} roomCode - Room code
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Auction complete data
 */
async function passAuctionFinal(client, roomCode, userId) {
  const data = await emitAndWait(
    client,
    'passAuction',
    { roomCode, userId },
    'auctionComplete'
  );
  testLog(`Auction completed, winner: Player ${data.game.auctionWinner}, status: ${data.game.status}`);
  return data;
}

/**
 * Add a small delay between operations
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  testLog,
  emitAndWait,
  waitForConnections,
  createRoom,
  joinRoom,
  getRoomsList,
  placeAuctionBid,
  passAuction,
  passAuctionFinal,
  delay
};
