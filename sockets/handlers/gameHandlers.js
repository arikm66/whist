const Game = require('../../models/Game');
const { appendRoomLog } = require('../../utils/logToFile');
const { isValidPlay, getCardSuit, determineTrickWinner } = require('../../utils/gameLogic');
const { endRound } = require('../utils/socketUtils');
const { getFilteredGameForPlayer } = require('../utils/socketUtils');

function registerGameHandlers(io, socket, activeGames) {
  // Place bid during bidding phase
  socket.on('placeBid', async ({ roomCode, userId, bid }) => {
    try {
      let game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
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
      game.players.forEach(p => {
        const filteredGame = getFilteredGameForPlayer(game, p.userId);
        io.to(p.userId.toString()).emit('bidPlaced', { position: player.position, bid: bidInt, game: filteredGame });
      });
      // Move to next bidder
      const bidsReceived = game.bids.filter(b => b !== null).length;
      if (bidsReceived === 4) {
        // All bids received, move to playing phase
        game.status = 'playing';
        game.currentTurn = game.auctionWinner; // Auction winner leads first trick
        game.currentTrick = [];
        game.leadSuit = null;
        game = await Game.findByIdAndUpdate(game._id, game.toObject(), { new: true });
        activeGames.set(roomCode, game);
        game.players.forEach(p => {
          const filteredGame = getFilteredGameForPlayer(game, p.userId);
          io.to(p.userId.toString()).emit('biddingComplete', { game: filteredGame });
        });
      } else {
        // Move to next bidder
        game.currentBidder = (game.currentBidder + 1) % 4;
        game = await Game.findByIdAndUpdate(game._id, game.toObject(), { new: true });
        activeGames.set(roomCode, game);
        game.players.forEach(p => {
          const filteredGame = getFilteredGameForPlayer(game, p.userId);
          io.to(p.userId.toString()).emit('nextBidder', { game: filteredGame });
        });
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
      let game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
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
        game.players.forEach(p => {
          const filteredGame = getFilteredGameForPlayer(game, p.userId);
          io.to(p.userId.toString()).emit('trickComplete', { 
            trick: game.currentTrick, 
            winner,
            game: filteredGame 
          });
        });
        // Reset for next trick
        setTimeout(async () => {
          game.currentTrick = [];
          game.leadSuit = null;
          game.currentTurn = winner;
          // Check if round complete (no cards left)
          if (game.players[0].hand.length === 0) {
            await endRound(game, roomCode, io);
          } else {
            game = await Game.findByIdAndUpdate(game._id, game.toObject(), { new: true });
            activeGames.set(roomCode, game);
            game.players.forEach(p => {
              const filteredGame = getFilteredGameForPlayer(game, p.userId);
              io.to(p.userId.toString()).emit('nextTrick', { game: filteredGame });
            });
          }
        }, 3000);
      } else {
        // Next player's turn
        game.currentTurn = (game.currentTurn + 1) % 4;
        game = await Game.findByIdAndUpdate(game._id, game.toObject(), { new: true });
        activeGames.set(roomCode, game);
        game.players.forEach(p => {
          const filteredGame = getFilteredGameForPlayer(game, p.userId);
          io.to(p.userId.toString()).emit('cardPlayed', { game: filteredGame });
        });
      }
    } catch (error) {
      console.error('Play card error:', error);
      appendRoomLog(roomCode, `Invalid action: Failed to play card (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to play card' });
    }
  });
}

module.exports = { registerGameHandlers };
