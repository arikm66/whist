const Game = require('../models/Game');
const { dealCards, determineTrickWinner, isValidPlay, getCardSuit, sortHand, isValidAuctionBid, compareAuctionBids } = require('../utils/gameLogic');
const { createRoomLog, appendRoomLog, closeRoomLog } = require('../utils/logToFile');
const { registerRoomHandlers } = require('./handlers/roomHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');
const { registerAuctionHandlers } = require('./handlers/auctionHandlers');
const { registerGameHandlers } = require('./handlers/gameHandlers');

// Store active games in memory for faster access
const activeGames = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    registerAuthHandlers(io, socket);
    registerRoomHandlers(io, socket, activeGames);
    registerAuctionHandlers(io, socket, activeGames);
    registerGameHandlers(io, socket, activeGames);

    socket.on('disconnect', async () => {
      // On disconnect, do not remove player or abort game. Only log disconnect.
      if (socket._roomCode && socket._userId) {
        appendRoomLog(socket._roomCode, `User disconnected: ${socket._userId}`);
      }
      console.log('User disconnected:', socket.id);
    });
  });
};


