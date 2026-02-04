const Client = require('socket.io-client');
const axios = require('axios');
require('dotenv').config();
const { testLog, waitForConnections, createRoom, joinRoom } = require('./socketHelpers');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';

/**
 * Test fixture class for managing game test state
 */
class GameTestSetup {
  constructor() {
    this.users = [
      {
        email: process.env.TEST_USER1,
        password: process.env.TEST_PASSWORD
      },
      {
        email: process.env.TEST_USER2,
        password: process.env.TEST_PASSWORD
      },
      {
        email: process.env.TEST_USER3,
        password: process.env.TEST_PASSWORD
      },
      {
        email: process.env.TEST_USER4,
        password: process.env.TEST_PASSWORD
      }
    ];
    this.tokens = [];
    this.clients = [];
    this.roomCode = null;
    this.dealer = null;
    this.adminToken = null;
  }

  /**
   * Login all test users and store their tokens
   * @returns {Promise<Array<string>>} Array of tokens
   */
  async loginAllUsers() {
    this.tokens = [];
    for (const user of this.users) {
      const res = await axios.post(`${SERVER_URL}/api/auth/login`, {
        email: user.email,
        password: user.password
      });
      this.tokens.push(res.data.token);
      // Update user object with actual userId from server
      user.userId = res.data.user.id;
    }
    testLog(`Successfully logged in ${this.tokens.length} test users`);
    return this.tokens;
  }

  /**
   * Login admin user for cleanup operations
   * @returns {Promise<string>} Admin token
   */
  async loginAdmin() {
    const res = await axios.post(`${SERVER_URL}/api/auth/login`, {
      email: process.env.TEST_ADMIN_USER,
      password: process.env.TEST_ADMIN_PASSWORD
    });
    this.adminToken = res.data.token;
    testLog('Admin logged in');
    return this.adminToken;
  }

  /**
   * Create socket clients for all users
   * @returns {Promise<Array<Object>>} Array of connected clients
   */
  async connectAllClients() {
    if (this.tokens.length === 0) {
      throw new Error('Must login users before connecting clients. Call loginAllUsers() first.');
    }
    
    this.clients = [];
    for (let i = 0; i < this.tokens.length; i++) {
      this.clients.push(Client(SERVER_URL, { auth: { token: this.tokens[i] } }));
    }
    
    await waitForConnections(this.clients);
    testLog(`All ${this.clients.length} clients connected`);
    return this.clients;
  }

  /**
   * Create a room with first user and have all others join
   * @returns {Promise<string>} Room code
   */
  async createRoomAndJoin() {
    if (this.clients.length === 0) {
      throw new Error('Must connect clients before creating room. Call connectAllClients() first.');
    }

    // First user creates room
    const roomData = await createRoom(this.clients[0], this.users[0]);
    this.roomCode = roomData.roomCode;

    // Other users join
    for (let i = 1; i < this.clients.length; i++) {
      await joinRoom(this.clients[i], this.roomCode, this.users[i]);
    }

    testLog(`Room ${this.roomCode} created with ${this.clients.length} players`);
    return this.roomCode;
  }

  /**
   * Delete the created room using admin credentials
   * @param {string} roomCode - Room code to delete (uses this.roomCode if not provided)
   * @returns {Promise<void>}
   */
  async deleteRoom(roomCode = null) {
    const codeToDelete = roomCode || this.roomCode;
    if (!codeToDelete) {
      testLog('No room code to delete');
      return;
    }

    if (!this.adminToken) {
      await this.loginAdmin();
    }

    try {
      await axios.delete(`${SERVER_URL}/api/rooms/${codeToDelete}`, {
        headers: { Authorization: `Bearer ${this.adminToken}` }
      });
      testLog(`Room ${codeToDelete} deleted`);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        testLog(`Room ${codeToDelete} already deleted or not found`);
      } else {
        testLog(`Failed to delete room ${codeToDelete}: ${err.message}`);
        throw err;
      }
    }
  }

  /**
   * Close all socket connections
   */
  closeAllClients() {
    this.clients.forEach((client, i) => {
      try {
        if (client && client.connected) {
          client.close();
        }
      } catch (err) {
        testLog(`Error closing client ${i}: ${err.message}`);
      }
    });
    testLog(`Closed ${this.clients.length} socket clients`);
  }

  /**
   * Full cleanup: close clients and delete room
   * @param {boolean} skipRoomCleanup - Skip room deletion if true
   * @returns {Promise<void>}
   */
  async cleanup(skipRoomCleanup = false) {
    this.closeAllClients();
    
    if (!skipRoomCleanup && this.roomCode) {
      await this.deleteRoom();
    } else if (skipRoomCleanup && this.roomCode) {
      testLog(`Room cleanup skipped for ${this.roomCode}`);
    }
  }

  /**
   * Get user by index
   * @param {number} index - User index (0-3)
   * @returns {Object} User object
   */
  getUser(index) {
    return this.users[index];
  }

  /**
   * Get client by index
   * @param {number} index - Client index (0-3)
   * @returns {Object} Socket client
   */
  getClient(index) {
    return this.clients[index];
  }

  /**
   * Get token by index
   * @param {number} index - Token index (0-3)
   * @returns {string} Token
   */
  getToken(index) {
    return this.tokens[index];
  }
}

/**
 * Create a new test setup instance
 * @returns {GameTestSetup}
 */
function createTestSetup() {
  return new GameTestSetup();
}

/**
 * Helper to clean up a room by code (standalone function)
 * @param {string} roomCode - Room code to delete
 * @param {string} adminToken - Admin authorization token
 * @returns {Promise<void>}
 */
async function cleanupRoom(roomCode, adminToken) {
  if (!adminToken) {
    throw new Error('Admin token required for room cleanup');
  }
  
  try {
    await axios.delete(`${SERVER_URL}/api/rooms/${roomCode}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    testLog(`Room ${roomCode} deleted`);
  } catch (err) {
    if (err.response?.status === 404) {
      testLog(`Room ${roomCode} already deleted or not found`);
    } else {
      testLog(`Failed to delete room ${roomCode}: ${err.message}`);
      throw err;
    }
  }
}

/**
 * Login a single user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Login response with token and userId
 */
async function loginUser(email, password) {
  const res = await axios.post(`${SERVER_URL}/api/auth/login`, {
    email,
    password
  });
  return res.data;
}

module.exports = {
  GameTestSetup,
  createTestSetup,
  cleanupRoom,
  loginUser,
  SERVER_URL
};
