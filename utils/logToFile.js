const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create a log file for a room
function createRoomLog(roomCode) {
  const filePath = path.join(LOG_DIR, `room-${roomCode}.log`);
  const entry = `[${new Date().toISOString()}] Room created\n`;
  fs.writeFileSync(filePath, entry, { flag: 'w' });
}

// Append a message to a room's log file
function appendRoomLog(roomCode, message) {
  const filePath = path.join(LOG_DIR, `room-${roomCode}.log`);
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFile(filePath, entry, err => {
    if (err) {
      console.error('Failed to write to room log file:', err);
    }
  });
}

// Mark the room log as closed/finished
function closeRoomLog(roomCode, reason = 'Room closed') {
  const filePath = path.join(LOG_DIR, `room-${roomCode}.log`);
  const entry = `[${new Date().toISOString()}] ${reason}\n`;
  fs.appendFile(filePath, entry, err => {
    if (err) {
      console.error('Failed to close room log file:', err);
    }
  });
}

module.exports = {
  createRoomLog,
  appendRoomLog,
  closeRoomLog
};
