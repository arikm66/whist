const { getFilteredGameForPlayer } = require('../utils/socketUtils');
const Game = require('../../models/Game');
const { createRoomLog, appendRoomLog, closeRoomLog } = require('../../utils/logToFile');
const { broadcastRoomsList, generateRoomCode, startGame } = require('../utils/socketUtils');

function registerRoomHandlers(io, socket, activeGames) {
  // Create Room
  socket.on('createRoom', async ({ userId, email }) => {
    try {
      const roomCode = generateRoomCode();
      const game = new Game({
        roomCode,
        players: [{
          userId,
          email,
          position: 0,
          hand: [],
          tricksWon: 0
        }],
        status: 'waiting'
      });
      await game.save();
      activeGames.set(roomCode, game);
      createRoomLog(roomCode);
      appendRoomLog(roomCode, `Room created by ${userId} ${email}`);
      socket.join(roomCode);
      socket.join(userId.toString());
      const filteredGame = getFilteredGameForPlayer(game, userId);
      socket.emit('roomCreated', { roomCode, game: filteredGame });
      broadcastRoomsList(io);
    } catch (error) {
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  // Join Room
  socket.on('joinRoom', async ({ roomCode, userId, email }) => {
    try {
      let game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
      if (!game) {
        appendRoomLog(roomCode, `Invalid action: Room not found (userId: ${userId})`);
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const existingPlayer = game.players.find(p => p.userId.toString() === userId.toString());
      if (existingPlayer) {
        socket.join(roomCode);
        socket.join(userId.toString());
        socket._roomCode = roomCode;
        socket._userId = userId;
        const filteredGame = getFilteredGameForPlayer(game, userId);
        socket.emit('roomJoined', { game: filteredGame });
        return;
      }
      if (game.players.length >= 4) {
        appendRoomLog(roomCode, `Invalid action: Room is full (userId: ${userId})`);
        socket.emit('error', { message: 'Room is full' });
        return;
      }
      if (game.status !== 'waiting') {
        appendRoomLog(roomCode, `Invalid action: Game already started (userId: ${userId})`);
        socket.emit('error', { message: 'Game already started' });
        return;
      }
      const newPlayer = {
        userId,
        email,
        position: game.players.length,
        hand: [],
        tricksWon: 0
      };
      game = await Game.findByIdAndUpdate(
        game._id,
        { $addToSet: { players: newPlayer } },
        { new: true }
      );
      activeGames.set(roomCode, game);
      socket.join(roomCode);
      socket.join(userId.toString());
      socket._roomCode = roomCode;
      socket._userId = userId;
      const filteredGame = getFilteredGameForPlayer(game, userId);
      socket.emit('roomJoined', { game: filteredGame });
      game.players.forEach(p => {
        const filteredGame = getFilteredGameForPlayer(game, p.userId);
        io.to(p.userId.toString()).emit('playerJoined', { game: filteredGame });
      });
      broadcastRoomsList(io);
      if (game.players.length === 4) {
        startGame(roomCode, io, activeGames);
      }
      appendRoomLog(roomCode, `Player joined: ${userId} ${email}`);
    } catch (error) {
      appendRoomLog(roomCode, `Invalid action: Failed to join room (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Leave Room
  socket.on('leaveRoom', async ({ roomCode, userId }) => {
    try {
      await Game.findOneAndUpdate(
        { roomCode },
        { $pull: { players: { userId } } }
      );
      const game = activeGames.get(roomCode);
      let wasActive = false;
      let leavingPlayerEmail = null;
      if (game) {
        const leavingPlayer = game.players.find(p => p.userId.toString() === userId.toString());
        leavingPlayerEmail = leavingPlayer ? leavingPlayer.email : null;
        game.players = game.players.filter(p => p.userId.toString() !== userId.toString());
        if (game.status === 'playing' || game.status === 'auction') {
          game.status = 'finished';
          await game.save();
          game.players.forEach(p => {
            const filteredGame = getFilteredGameForPlayer(game, p.userId);
            io.to(p.userId.toString()).emit('gameFinished', { game: filteredGame });
          });
          appendRoomLog(roomCode, `Game aborted: player left during active game (${leavingPlayerEmail || userId})`);
          closeRoomLog(roomCode);
          wasActive = true;
        }
        activeGames.set(roomCode, game);
      }
      socket.leave(roomCode);
      socket.leave(userId.toString());
      io.to(roomCode).emit('roomClosed', { roomCode });
      broadcastRoomsList(io);
      if (leavingPlayerEmail) {
        appendRoomLog(roomCode, `Player left: ${leavingPlayerEmail}`);
      }
    } catch (err) {
      appendRoomLog(roomCode, `Invalid action: Failed to leave room (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to leave room' });
    }
  });

  // Get Rooms
  socket.on('getRooms', async () => {
    try {
      const rooms = await Game.find({}).select('roomCode players status createdAt');
      socket.emit('roomsList', { rooms });
    } catch (error) {
      appendRoomLog('lobby', `Invalid action: Failed to fetch rooms (socketId: ${socket.id})`);
      socket.emit('error', { message: 'Failed to fetch rooms' });
    }
  });
}

module.exports = { registerRoomHandlers };
