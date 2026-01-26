const Game = require('../../models/Game');
const { appendRoomLog } = require('../../utils/logToFile');

async function broadcastRoomsList(io) {
  try {
    const rooms = await Game.find({}).select('roomCode players status createdAt');
    io.emit('roomsList', { rooms });
  } catch (error) {
    console.error('Broadcast rooms list error:', error);
    appendRoomLog('lobby', `Error broadcasting rooms list: ${error.message}`);
  }
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function startGame(roomCode, io, activeGames) {
  const Game = require('../../models/Game');
  const { dealCards, sortHand } = require('../../utils/gameLogic');
  const { appendRoomLog } = require('../../utils/logToFile');
  try {
    const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
    if (game.dealer === undefined) {
      game.dealer = 0;
    }
    if (!Array.isArray(game.scores)) game.scores = [];
    for (let i = 0; i < 4; i++) {
      if (!game.scores.find(s => s.position === i)) {
        game.scores.push({ position: i, score: 0 });
      }
    }
    const hands = dealCards();
    game.players[0].hand = sortHand(hands.player0);
    game.players[1].hand = sortHand(hands.player1);
    game.players[2].hand = sortHand(hands.player2);
    game.players[3].hand = sortHand(hands.player3);
    game.status = 'auction';
    game.auctionCurrentBidder = (game.dealer + 1) % 4;
    game.auctionWinner = null;
    game.auctionHighestBid = null;
    game.auctionPassed = [];
    game.auctionBids = [];
    game.trumpSuit = null;
    await game.save();
    activeGames.set(roomCode, game);
    io.to(roomCode).emit('gameStarted', { game });
    appendRoomLog(roomCode, 'Game started');
    appendRoomLog(roomCode, 'Auction started');
  } catch (error) {
    console.error('Start game error:', error);
  }
}

module.exports = { broadcastRoomsList, generateRoomCode, startGame };