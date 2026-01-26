const { appendRoomLog } = require('../../utils/logToFile');
const Game = require('../../models/Game');

function registerAuthHandlers(io, socket) {
  socket.on('login', async ({ userId, email }) => {
    try {
      // Find all games where this user is a participant
      const games = await Game.find({ 'players.userId': userId });
      for (const game of games) {
        // Only log if the room is active (not finished or aborted)
        if (game.status !== 'finished' && game.status !== 'aborted') {
          appendRoomLog(game.roomCode, `User logged in: ${email || userId}`);
        }
      }
    } catch (err) {
      console.error('Login event error:', err);
      appendRoomLog('lobby', `Error during login event for userId: ${userId}, email: ${email} - ${err.message}`);
    }
  });

  socket.on('logout', async ({ userId, email }) => {
    try {
      // Find all games where this user is a participant
      const games = await Game.find({ 'players.userId': userId });
      for (const game of games) {
        // Only log if the room is active (not finished or aborted)
        if (game.status !== 'finished' && game.status !== 'aborted') {
          appendRoomLog(game.roomCode, `User logged out: ${email || userId}`);
        }
      }
    } catch (err) {
      console.error('Logout event error:', err);
      appendRoomLog('lobby', `Error during logout event for userId: ${userId}, email: ${email} - ${err.message}`);
    }
  });
}

module.exports = { registerAuthHandlers };
