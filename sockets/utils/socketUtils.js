async function advanceAuctionTurn(game, roomCode, io, activeGames) {
  // Check if auction is complete (3 have passed, 1 remains)
  if (game.auctionPassed.length === 3) {
    // Auction winner is the only player who hasn't passed
    const winner = [0, 1, 2, 3].find(pos => !game.auctionPassed.includes(pos));
    game.auctionWinner = winner;

    // Give auction winner one final chance to raise
    if (!game.auctionFinalRaise) {
      game.auctionFinalRaise = true;
      game.auctionCurrentBidder = winner;
      await game.save();
      activeGames.set(roomCode, game);
      io.to(roomCode).emit('auctionNextBidder', { game });
      return;
    }
  }

  // Find next player who hasn't passed
  let nextBidder = (game.auctionCurrentBidder + 1) % 4;
  let turns = 0;

  while (game.auctionPassed.includes(nextBidder) && turns < 4) {
    nextBidder = (nextBidder + 1) % 4;
    turns++;
  }

  // Check if auction is complete (after final raise)
  if (game.auctionPassed.length === 3 && game.auctionFinalRaise) {
    const winner = game.auctionWinner;
    // Set trump suit from auction winner's bid
    if (game.auctionHighestBid) {
      game.trumpSuit = game.auctionHighestBid.suit === 'NT' ? null : game.auctionHighestBid.suit;
    }
    // Initialize bidding phase with auction winner's bid
    game.status = 'bidding';
    game.bids = [null, null, null, null];
    game.bids[winner] = game.auctionHighestBid.quantity; // Auction winner's bid is fixed
    game.currentBidder = (winner + 1) % 4; // Next player after winner starts bidding
    game.minBid = game.players[0].hand.length <= 5 ? 1 : 0;
    game.lastBid = 0;
    game.auctionFinalRaise = false; // Reset for next round
    await game.save();
    activeGames.set(roomCode, game);
    appendRoomLog(roomCode, `Auction completed: Winner is Player ${winner} (${game.players[winner]?.email || game.players[winner]?.userId}), bid ${game.auctionHighestBid.quantity} ${game.auctionHighestBid.suit}`);
    io.to(roomCode).emit('auctionComplete', { game });
    return;
  }

  // Update current bidder and continue auction
  game.auctionCurrentBidder = nextBidder;
  await game.save();
  activeGames.set(roomCode, game);
  io.to(roomCode).emit('auctionNextBidder', { game });
}
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

module.exports = { broadcastRoomsList, generateRoomCode, startGame, advanceAuctionTurn };