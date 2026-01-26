const Game = require('../models/Game');
const { dealCards, determineTrickWinner, isValidPlay, getCardSuit, sortHand, isValidAuctionBid, compareAuctionBids } = require('../utils/gameLogic');
const { createRoomLog, appendRoomLog, closeRoomLog } = require('../utils/logToFile');
const { registerRoomHandlers } = require('./handlers/roomHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');
const { registerAuctionHandlers } = require('./handlers/auctionHandlers');

// Store active games in memory for faster access
const activeGames = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    registerAuthHandlers(io, socket);
    registerRoomHandlers(io, socket, activeGames);
    registerAuctionHandlers(io, socket, activeGames);


    // Place bid during bidding phase
    socket.on('placeBid', async ({ roomCode, userId, bid }) => {
      try {
        const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        if (game.status !== 'bidding') {
          appendRoomLog(roomCode, `Invalid action: Not in bidding phase (userId: ${userId})`);
          socket.emit('error', { message: 'Not in bidding phase' });
          return;
        }

        const player = game.players.find(p => p.userId.toString() === userId.toString());
        if (!player) {
          appendRoomLog(roomCode, `Invalid action: Player not in game (userId: ${userId})`);
          socket.emit('error', { message: 'Player not in game' });
          return;
        }

        if (player.position !== game.currentBidder) {
          appendRoomLog(roomCode, `Invalid action: Not your turn to bid (userId: ${userId})`);
          socket.emit('error', { message: 'Not your turn to bid' });
          return;
        }

        // Validate bid
        const tricksAvailable = game.players[0].hand.length;
        const bidInt = parseInt(bid);

        // New rules: min 0, max = tricksAvailable, no monotonic constraint
        if (isNaN(bidInt) || bidInt < 0 || bidInt > tricksAvailable) {
          appendRoomLog(roomCode, `Invalid action: Bid must be between 0 and ${tricksAvailable} (userId: ${userId})`);
          socket.emit('error', { message: `Bid must be between 0 and ${tricksAvailable}` });
          return;
        }

        // Last bidder (4th player after auction winner) cannot make total equal to tricksAvailable
        const lastBidderPos = (game.auctionWinner + 3) % 4;
        if (player.position === lastBidderPos) {
          const sumPrev = game.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0);
          if (sumPrev + bidInt === tricksAvailable) {
            appendRoomLog(roomCode, `Invalid action: Last bidder cannot bid ${bidInt} (userId: ${userId})`);
            socket.emit('error', { message: `As last bidder, you cannot bid ${bidInt} because total would equal ${tricksAvailable}` });
            return;
          }
        }

        // Record bid
        game.bids[player.position] = bidInt;
        appendRoomLog(roomCode, `Bid placed: Player ${player.position} (${player.email || player.userId}) bid ${bidInt}`);

        // Broadcast bid to all players
        io.to(roomCode).emit('bidPlaced', { position: player.position, bid: bidInt, game });

        // Move to next bidder
        const bidsReceived = game.bids.filter(b => b !== null).length;
        if (bidsReceived === 4) {
          // All bids received, move to playing phase
          game.status = 'playing';
          game.currentTurn = game.auctionWinner; // Auction winner leads first trick
          game.currentTrick = [];
          game.leadSuit = null;
          
          await game.save();
          activeGames.set(roomCode, game);
          io.to(roomCode).emit('biddingComplete', { game });
        } else {
          // Move to next bidder
          game.currentBidder = (game.currentBidder + 1) % 4;
          await game.save();
          activeGames.set(roomCode, game);
          io.to(roomCode).emit('nextBidder', { game });
        }
      } catch (error) {
        console.error('Place bid error:', error);
        appendRoomLog(roomCode, `Invalid action: Failed to place bid (userId: ${userId})`);
        socket.emit('error', { message: 'Failed to place bid' });
      }
    });

    // Play a card
    socket.on('playCard', async ({ roomCode, userId, card }) => {
      try {
        const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          appendRoomLog(roomCode, `Invalid action: Game not found (userId: ${userId})`);
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        const player = game.players.find(p => p.userId.toString() === userId.toString());
        if (!player) {
          appendRoomLog(roomCode, `Invalid action: Player not in game (userId: ${userId})`);
          socket.emit('error', { message: 'Player not in game' });
          return;
        }

        if (player.position !== game.currentTurn) {
          appendRoomLog(roomCode, `Invalid action: Not your turn to play (userId: ${userId})`);
          socket.emit('error', { message: 'Not your turn' });
          return;
        }

        // Validate play
        if (!isValidPlay(card, player.hand, game.leadSuit, game.currentTrick)) {
          appendRoomLog(roomCode, `Invalid action: Invalid card play (userId: ${userId})`);
          socket.emit('error', { message: 'Invalid card play' });
          return;
        }

        // Set lead suit if first card
        if (game.currentTrick.length === 0) {
          game.leadSuit = getCardSuit(card);
        }

        // Play card
        game.currentTrick.push({ position: player.position, card });
        player.hand = player.hand.filter(c => c !== card);
        appendRoomLog(roomCode, `Card played: Player ${player.position} (${player.email || player.userId}) played ${card}`);

        // If trick complete (4 cards)
        if (game.currentTrick.length === 4) {
          const winner = determineTrickWinner(game.currentTrick, game.trumpSuit, game.leadSuit);
          game.players[winner].tricksWon++;
          const trickCards = game.currentTrick.map(tc => `P${tc.position}: ${tc.card}`).join(', ');
          appendRoomLog(roomCode, `Trick completed: Winner is Player ${winner} (${game.players[winner]?.email || game.players[winner]?.userId}), cards: ${trickCards}`);
          io.to(roomCode).emit('trickComplete', { 
            trick: game.currentTrick, 
            winner,
            game 
          });

          // Reset for next trick
          setTimeout(async () => {
            game.currentTrick = [];
            game.leadSuit = null;
            game.currentTurn = winner;
            
            // Check if round complete (no cards left)
            if (game.players[0].hand.length === 0) {
              endRound(game, roomCode, io);
            } else {
              await game.save();
              activeGames.set(roomCode, game);
              io.to(roomCode).emit('nextTrick', { game });
            }
          }, 3000);
        } else {
          // Next player's turn
          game.currentTurn = (game.currentTurn + 1) % 4;
          await game.save();
          activeGames.set(roomCode, game);
          io.to(roomCode).emit('cardPlayed', { game });
        }
      } catch (error) {
        console.error('Play card error:', error);
        appendRoomLog(roomCode, `Invalid action: Failed to play card (userId: ${userId})`);
        socket.emit('error', { message: 'Failed to play card' });
      }
    });

    socket.on('disconnect', async () => {
      // On disconnect, do not remove player or abort game. Only log disconnect.
      if (socket._roomCode && socket._userId) {
        appendRoomLog(socket._roomCode, `User disconnected: ${socket._userId}`);
      }
      console.log('User disconnected:', socket.id);
    });
  });
};

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


  // Log summary of all players' bids and tricks won
  const bidsAndTricks = game.players.map((player, idx) => {
    const bid = game.bids[idx];
    const tricks = player.tricksWon;
    return `Player ${idx} (${player?.email || player?.userId}): Bid ${bid}, Tricks ${tricks}`;
  }).join('; ');
  appendRoomLog(roomCode, `Round ended: Round ${game.round}`);
  appendRoomLog(roomCode, `Bids and tricks: ${bidsAndTricks}`);

  // Log latest scores for all players
  const scoreLines = game.scores.map(s => {
    const player = game.players[s.position];
    return `Player ${s.position} (${player?.email || player?.userId}): ${s.score}`;
  }).join('; ');
  appendRoomLog(roomCode, `Scores after round ${game.round}: ${scoreLines}`);

  // Emit round summary to all players
  io.to(roomCode).emit('roundEnded', { roundSummary, game });

  game.round++;
  // Check if game complete (e.g., after 5 rounds)
  if (game.round > 5) {
    game.status = 'finished';
    await game.save();
    io.to(roomCode).emit('gameFinished', { game });
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
    await game.save();
    activeGames.set(roomCode, game);
    io.to(roomCode).emit('newRound', { game });
  }
}

