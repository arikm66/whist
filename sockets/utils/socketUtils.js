// Complete frish phase: exchange cards, reset flags, start new auction
function completeFrishPhase(game, roomCode, io, activeGames, sortHand, appendRoomLog) {
  // 1. Remove frish cards from each player's hand
  for (let i = 0; i < 4; i++) {
    const p = game.players[i];
    if (Array.isArray(p.frishCards)) {
      for (const f of p.frishCards) {
        const idx = p.hand.indexOf(f);
        if (idx !== -1) p.hand.splice(idx, 1);
      }
    }
  }
  // 2. Push to each player's hand the frish cards from the previous player (N-1, wrap around)
  for (let i = 0; i < 4; i++) {
    const prev = (i + 3) % 4;
    const prevFrish = Array.isArray(game.players[prev].frishCards) ? game.players[prev].frishCards : [];
    game.players[i].hand.push(...prevFrish);
  }
  // 3. Sort all hands using sortHand()
  for (let i = 0; i < 4; i++) {
    game.players[i].hand = sortHand(game.players[i].hand);
  }
  appendRoomLog(roomCode, 'All players ready for frish. Frish cards exchanged and hands sorted.');
  // Reset frish-related flags and arrays
  for (let i = 0; i < 4; i++) {
    game.players[i].readyForFrish = false;
    game.players[i].frishCards = [];
  }
  game.readyForFrishCount = 0;
  // Prepare for new auction phase
  game.status = 'auction';
  game.auctionBids = [];
  game.auctionCurrentBidder = 0;
  game.auctionWinner = null;
  game.auctionHighestBid = null;
  game.auctionPassed = [];
  game.auctionFinalRaise = false;
  // Optionally reset other auction/bidding fields if needed
  game.bids = [null, null, null, null];
  game.currentBidder = 0;
  game.minBid = 1;
  game.lastBid = 0;
  appendRoomLog(roomCode, 'Frish phase complete. Game reset for new auction phase.');
  // Emit filtered game to each player
  const { getFilteredGameForPlayer } = require('./socketUtils');
  game.players.forEach(p => {
    const filteredGame = getFilteredGameForPlayer(game, p.userId);
    io.to(p.userId.toString()).emit('auctionRestarted', { game: filteredGame });
  });
}
function getFilteredGameForPlayer(game, userId) {
  // Deep clone the game object (shallow for performance, deep for hand)
  const filtered = JSON.parse(JSON.stringify(game));
  filtered.players = filtered.players.map(p => {
    if (p.userId.toString() === userId.toString()) {
      return p; // This player's own hand and frishCards are visible
    } else {
      // Hide other players' hands and frishCards
      return { ...p, hand: [], frishCards: [] };
    }
  });
  return filtered;
}

async function endRound(game, roomCode, io) {
  // Calculate scores based on bidding
  const roundTricks = [];
  // Score calculation and round summary
  const roundScores = [];
  game.players.forEach((player, idx) => {
    const bid = game.bids[idx];
    const tricksWon = player.tricksWon;
    let roundScore = 0;
    let matchedBid = false;
    if (bid === 0) {
      const bidSum = game.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0);
      if (tricksWon === 0) {
        roundScore = bidSum < 13 ? 50 : 25;
        matchedBid = true;
      } else {
        if (bidSum < 13) {
          roundScore = -50 + (tricksWon - 1) * 10;
        } else {
          roundScore = -25 + (tricksWon - 1) * 10;
        }
      }
    } else if (bid === tricksWon) {
      roundScore = 10 + (tricksWon * tricksWon);
      matchedBid = true;
    } else {
      const gap = Math.abs(bid - tricksWon);
      roundScore = -10 * gap;
    }
    const existingScore = game.scores.find(s => s.position === idx);
    // Always true: update the player's score
    existingScore.score += roundScore;
    roundScores.push({ value: roundScore, matchedBid });
  });

  // Compose round summary for client
  const roundSummary = {
    tricks: roundTricks, // TODO: fill with actual trick data if available
    scores: roundScores
  };

  // Log summary of all players' bids, tricks, and scores
  const bids = game.bids.join(', ');
  const tricks = game.players.map(p => p.tricksWon).join(', ');
  const scores = game.scores.sort((a, b) => a.position - b.position).map(s => s.score).join(', ');
  
  // Convert round number to ordinal (1st, 2nd, 3rd, etc.)
  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  
  appendRoomLog(roomCode, `Round ended: Round ${game.round}`);
  appendRoomLog(roomCode, `Bids:   [${bids}]`);
  appendRoomLog(roomCode, `Tricks: [${tricks}]`);
  appendRoomLog(roomCode, `Scores after ${getOrdinal(game.round)} round: [${scores}]`);

  // Emit round summary to all players
  io.to(roomCode).emit('roundEnded', { roundSummary, game });

  game.round++;
  // Check if game complete (e.g., after 5 rounds)
  if (game.round > 5) {
    game.status = 'finished';
    game = await Game.findByIdAndUpdate(game._id, game.toObject(), { new: true });
    game.players.forEach(p => {
      const filteredGame = getFilteredGameForPlayer(game, p.userId);
      io.to(p.userId.toString()).emit('gameFinished', { game: filteredGame });
    });
    appendRoomLog(roomCode, 'Game finished');
    // Log final scores
    const scoreLines = game.scores.map(s => {
      const player = game.players[s.position];
      return `Player ${s.position} (${player?.email || player?.userId}): ${s.score}`;
    }).join('; ');
    appendRoomLog(roomCode, `Final scores: ${scoreLines}`);
    closeRoomLog(roomCode);
  } else {
    // Start new round with auction phase
    appendRoomLog(roomCode, `Round started: Round ${game.round}`);
    game.dealer = (game.dealer + 1) % 4;
    game.players.forEach(p => p.tricksWon = 0);
    const { dealCards, sortHand } = require('../../utils/gameLogic');
    const hands = dealCards();
    game.players[0].hand = sortHand(hands.player0);
    game.players[1].hand = sortHand(hands.player1);
    game.players[2].hand = sortHand(hands.player2);
    game.players[3].hand = sortHand(hands.player3);
    // Start auction phase for new round
    game.status = 'auction';
    game.auctionCurrentBidder = (game.dealer + 1) % 4;
    game.auctionWinner = null;
    game.auctionHighestBid = null;
    game.auctionPassed = [];
    game.auctionBids = [];
    game.auctionFinalRaise = false;
    game.trumpSuit = null;
    const updateData = game.toObject ? game.toObject() : game;
    game = await Game.findByIdAndUpdate(game._id, updateData, { new: true });
    game.players.forEach(p => {
      const filteredGame = getFilteredGameForPlayer(game, p.userId);
      io.to(p.userId.toString()).emit('newRound', { game: filteredGame });
    });
  }
}
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
      const updateData = game.toObject ? game.toObject() : game;
      game = await Game.findByIdAndUpdate(game._id, updateData, { new: true });
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
    game = await Game.findByIdAndUpdate(game._id, game.toObject(), { new: true });
    activeGames.set(roomCode, game);
    appendRoomLog(roomCode, `Auction completed: Winner is Player ${winner} (${game.players[winner]?.email || game.players[winner]?.userId}), bid ${game.auctionHighestBid.quantity} ${game.auctionHighestBid.suit}`);
    game.players.forEach(p => {
      const filteredGame = getFilteredGameForPlayer(game, p.userId);
      io.to(p.userId.toString()).emit('auctionComplete', { game: filteredGame });
    });
    return;
  }

  // Update current bidder and continue auction
  game.auctionCurrentBidder = nextBidder;
  game = await Game.findByIdAndUpdate(game._id, game.toObject(), { new: true });
  activeGames.set(roomCode, game);
  game.players.forEach(p => {
    const filteredGame = getFilteredGameForPlayer(game, p.userId);
    io.to(p.userId.toString()).emit('auctionNextBidder', { game: filteredGame });
  });
}
const Game = require('../../models/Game');
const { appendRoomLog } = require('../../utils/logToFile');

async function broadcastRoomsList(io) {
  try {
    const rooms = await Game.find({}).select('roomCode players status dealer createdAt').lean();
    const sanitizedRooms = rooms.map(room => ({
        ...room,
        players: room.players.map(p => ({ ...p, hand: [] }))
    }));
    io.emit('roomsList', { rooms: sanitizedRooms });
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
    let game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
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
    const updateData = game.toObject ? game.toObject() : game;
    game = await Game.findByIdAndUpdate(game._id, updateData, { new: true });
    activeGames.set(roomCode, game);
    game.players.forEach(p => {
      const filteredGame = getFilteredGameForPlayer(game, p.userId);
      io.to(p.userId.toString()).emit('gameStarted', { game: filteredGame });
    });
    appendRoomLog(roomCode, 'Game started');
    appendRoomLog(roomCode, 'Auction started');
  } catch (error) {
    console.error('Start game error:', error);
  }
}

module.exports = { broadcastRoomsList, generateRoomCode, startGame, advanceAuctionTurn, endRound, getFilteredGameForPlayer, completeFrishPhase };