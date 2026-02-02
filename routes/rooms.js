const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Game = require('../models/Game');
const User = require('../models/User');

// DELETE /api/rooms/:roomCode
// Only Admins can delete rooms
router.delete('/:roomCode', auth, async (req, res) => {
  try {
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.role !== 'Admin') {
      return res.status(403).json({ msg: 'Only Admins can delete rooms' });
    }
    const { roomCode } = req.params;
    const game = await Game.findOneAndDelete({ roomCode });
    if (!game) return res.status(404).json({ msg: 'Room not found' });

    // Remove from in-memory activeGames if present
    if (global.activeGames && typeof global.activeGames.delete === 'function') {
      global.activeGames.delete(roomCode);
    }

    // Log game aborted by admin
    try {
      const { closeRoomLog, appendRoomLog } = require('../utils/logToFile');
      appendRoomLog(roomCode, 'Game aborted: room deleted by admin');
      closeRoomLog(roomCode);
    } catch (e) {}

    // Notify all clients in the room to go to lobby
    if (req.app.get('io')) {
      const io = req.app.get('io');
      // Emit roomClosed to all sockets in the deleted room
      io.to(roomCode).emit('roomClosed', { roomCode });
      // Also refresh room list for all clients
      const Game = require('../models/Game');
      Game.find({}).select('roomCode players status dealer createdAt').then(rooms => {
        io.emit('roomsList', { rooms });
      });
    }

    res.json({ msg: 'Room deleted', roomCode });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
