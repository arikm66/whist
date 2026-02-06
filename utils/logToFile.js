const fs = require('fs');
const path = require('path');
const { formatTimestamp } = require('./constants');

const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Helper function to append a timestamped log entry to a file
function appendLogEntry(filePath, message, flag = 'a') {
  const timestamp = formatTimestamp();
  const entry = `[${timestamp}] ${message}\n`;
  
  if (flag === 'w') {
    fs.writeFileSync(filePath, entry, { flag });
  } else {
    fs.appendFile(filePath, entry, err => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }
}

// Create a log file for a room
function createRoomLog(roomCode) {
  const filePath = path.join(LOG_DIR, `room-${roomCode}.log`);
  appendLogEntry(filePath, 'Room created', 'w');
}

// Append a message to a room's log file
function appendRoomLog(roomCode, message) {
  const filePath = path.join(LOG_DIR, `room-${roomCode}.log`);
  appendLogEntry(filePath, message);
}

// Mark the room log as closed/finished
function closeRoomLog(roomCode, reason = 'Room closed') {
  const filePath = path.join(LOG_DIR, `room-${roomCode}.log`);
  appendLogEntry(filePath, reason);
}

module.exports = {
  createRoomLog,
  appendRoomLog,
  closeRoomLog
};
