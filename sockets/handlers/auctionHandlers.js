const Game = require('../../models/Game');
const { appendRoomLog } = require('../../utils/logToFile');
const { isValidAuctionBid, sortHand } = require('../../utils/gameLogic');
const { advanceAuctionTurn } = require('../utils/socketUtils');
const { getFilteredGameForPlayer, completeFrishPhase } = require('../utils/socketUtils');

function registerAuctionHandlers(io, socket, activeGames) {
  // Place auction bid or pass during auction phase
  socket.on('placeAuctionBid', async ({ roomCode, userId, quantity, suit }) => {
    try {
      const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
      if (!game) {
        appendRoomLog(roomCode, `Invalid action: Game not found (userId: ${userId})`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      if (game.status !== 'auction') {
        appendRoomLog(roomCode, `Invalid action: Not in auction phase (userId: ${userId})`);
        socket.emit('error', { message: 'Not in auction phase' });
        return;
      }
      const player = game.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        appendRoomLog(roomCode, `Invalid action: Player not in game (userId: ${userId})`);
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
      if (player.position !== game.auctionCurrentBidder) {
        appendRoomLog(roomCode, `Invalid action: Not your turn in auction (userId: ${userId})`);
        socket.emit('error', { message: 'Not your turn in auction' });
        return;
      }
      if (game.auctionPassed.includes(player.position)) {
        appendRoomLog(roomCode, `Invalid action: Already passed in auction (userId: ${userId})`);
        socket.emit('error', { message: 'You have already passed' });
        return;
      }
      const cardsDealt = game.players[0].hand.length;
      const bid = { quantity, suit };
      if (!isValidAuctionBid(bid, cardsDealt, game.auctionHighestBid)) {
        const minQty = Math.max(1, cardsDealt - 8);
        let msg = `Invalid bid. Minimum: ${minQty}, Maximum: ${cardsDealt}`;
        if (game.auctionHighestBid) {
          msg += `. Must beat ${game.auctionHighestBid.quantity} ${game.auctionHighestBid.suit}`;
        }
        appendRoomLog(roomCode, `Invalid action: ${msg} (userId: ${userId})`);
        socket.emit('error', { message: msg });
        return;
      }
      game.auctionBids.push({
        position: player.position,
        quantity,
        suit,
        timestamp: new Date()
      });
      game.auctionHighestBid = bid;
      appendRoomLog(roomCode, `Auction bid placed: Player ${player.position} (${player.email || player.userId}) bid ${quantity} ${suit}`);
      // Emit filtered game to each player
      game.players.forEach(p => {
        const filteredGame = getFilteredGameForPlayer(game, p.userId);
        io.to(p.userId.toString()).emit('auctionBidPlaced', { position: player.position, bid, game: filteredGame });
      });
      await advanceAuctionTurn(game, roomCode, io, activeGames);
    } catch (error) {
      console.error('Place auction bid error:', error);
      appendRoomLog(roomCode, `Invalid action: Failed to place auction bid (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to place auction bid' });
    }
  });

  // Pass during auction phase
  socket.on('passAuction', async ({ roomCode, userId }) => {
    try {
      const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
      if (!game) {
        appendRoomLog(roomCode, `Invalid action: Game not found (userId: ${userId})`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      if (game.status !== 'auction') {
        appendRoomLog(roomCode, `Invalid action: Not in auction phase (userId: ${userId})`);
        socket.emit('error', { message: 'Not in auction phase' });
        return;
      }
      const player = game.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        appendRoomLog(roomCode, `Invalid action: Player not in game (userId: ${userId})`);
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
      if (player.position !== game.auctionCurrentBidder) {
        appendRoomLog(roomCode, `Invalid action: Not your turn in auction (userId: ${userId})`);
        socket.emit('error', { message: 'Not your turn in auction' });
        return;
      }
      if (game.auctionPassed.includes(player.position)) {
        appendRoomLog(roomCode, `Invalid action: Already passed in auction (userId: ${userId})`);
        socket.emit('error', { message: 'You have already passed' });
        return;
      }
      game.auctionPassed.push(player.position);
      appendRoomLog(roomCode, `Auction passed: Player ${player.position} (${player.email || player.userId})`);
      if ((!game.auctionBids || game.auctionBids.length === 0) && game.auctionPassed.length === 4) {
        appendRoomLog(roomCode, 'Auction completed: All players passed, entering frish phase.');
        game.status = 'frish';
        await game.save();
        activeGames.set(roomCode, game);
        // Emit filtered game to each player
        game.players.forEach(p => {
          const filteredGame = getFilteredGameForPlayer(game, p.userId);
          io.to(p.userId.toString()).emit('frishStarted', { game: filteredGame });
        });
        return;
      }
      if (game.auctionFinalRaise && player.position === game.auctionWinner) {
        appendRoomLog(roomCode, `auctionFinalRaise: ${game.auctionFinalRaise} Player ${player.position} (${player.email || player.userId}) passed to end auction.`);
        const winner = game.auctionWinner;
        if (game.auctionHighestBid) {
          game.trumpSuit = game.auctionHighestBid.suit === 'NT' ? null : game.auctionHighestBid.suit;
        }
        game.status = 'bidding';
        game.bids = [null, null, null, null];
        game.bids[winner] = game.auctionHighestBid.quantity;
        game.currentBidder = (winner + 1) % 4;
        game.minBid = game.players[0].hand.length <= 5 ? 1 : 0;
        game.lastBid = 0;
        game.auctionFinalRaise = false;
        await game.save();
        activeGames.set(roomCode, game);
        // Emit filtered game to each player
        game.players.forEach(p => {
          const filteredGame = getFilteredGameForPlayer(game, p.userId);
          io.to(p.userId.toString()).emit('auctionComplete', { game: filteredGame });
        });
        return;
      }
      // Emit filtered game to each player
      game.players.forEach(p => {
        const filteredGame = getFilteredGameForPlayer(game, p.userId);
        io.to(p.userId.toString()).emit('auctionPassed', { position: player.position, game: filteredGame });
      });
      await advanceAuctionTurn(game, roomCode, io, activeGames);
    } catch (error) {
      console.error('Pass auction error:', error);
      appendRoomLog(roomCode, `Invalid action: Failed to pass auction (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to pass' });
    }
  });

  // Handle frish card selection
  socket.on('selectFrishCard', async ({ roomCode, userId, frishCard }) => {
    try {
      const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
      if (!game) {
        appendRoomLog(roomCode, `Invalid action: Game not found (userId: ${userId})`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      if (game.status !== 'frish') {
        appendRoomLog(roomCode, `Invalid action: Not in frish phase (userId: ${userId})`);
        socket.emit('error', { message: 'Not in frish phase' });
        return;
      }
      const player = game.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        appendRoomLog(roomCode, `Invalid action: Player not in game (userId: ${userId})`);
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
        const cardInHand = Array.isArray(player.hand) ? player.hand.includes(frishCard) : false;
        if (!cardInHand) {
          appendRoomLog(roomCode, `Invalid action: Card not in hand (userId: ${userId}, card: ${frishCard})`);
          socket.emit('error', { message: 'Card not in hand' });
          return;
        }
        if (!Array.isArray(player.frishCards)) player.frishCards = [];
        const existingIdx = player.frishCards.indexOf(frishCard);
        if (existingIdx >= 0) {
          player.frishCards.splice(existingIdx, 1);
          appendRoomLog(roomCode, `Frish card de-selected: Player ${player.position}, userId=${userId}, card=${frishCard}`);
        } else {
          if (player.frishCards.length >= 3) {
            appendRoomLog(roomCode, `Invalid action: Cannot select more than 3 frish cards (userId: ${userId})`);
            socket.emit('error', { message: 'You can only select up to 3 frish cards.' });
            return;
          }
          player.frishCards.push(frishCard);
          appendRoomLog(roomCode, `Frish card selected: Player ${player.position}, userId=${userId}, card=${frishCard}`);
        }
      await game.save();
      activeGames.set(roomCode, game);
      // Emit frish selection counts to all players
      const frishCounts = game.players.map(p => ({ userId: p.userId, count: Array.isArray(p.frishCards) ? p.frishCards.length : 0 }));
      // Emit filtered game to each player
      game.players.forEach(p => {
        const filteredGame = getFilteredGameForPlayer(game, p.userId);
        io.to(p.userId.toString()).emit('frishSelectionCounts', { frishCounts, game: filteredGame });
      });
      // Also emit to the acting socket for immediate feedback
      const filteredGame = getFilteredGameForPlayer(game, userId);
      socket.emit('frishCardSelected', { userId, frishCard, game: filteredGame });
    } catch (error) {
      appendRoomLog(roomCode, `Invalid action: Failed to select frish card (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to select frish card' });
    }
  });

  // Handle readyForFrish event
  socket.on('readyForFrish', async ({ roomCode, userId }) => {
    try {
      const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
      if (!game) {
        appendRoomLog(roomCode, `Invalid action: Game not found (userId: ${userId})`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      if (game.status !== 'frish') {
        appendRoomLog(roomCode, `Invalid action: Not in frish phase (userId: ${userId})`);
        socket.emit('error', { message: 'Not in frish phase' });
        return;
      }
      const player = game.players.find(p => p.userId.toString() === userId.toString());
      if (!player) {
        appendRoomLog(roomCode, `Invalid action: Player not in game (userId: ${userId})`);
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
      if (!Array.isArray(player.frishCards) || player.frishCards.length !== 3) {
        appendRoomLog(roomCode, `Invalid action: Player does not have 3 frish cards selected (userId: ${userId})`);
        socket.emit('error', { message: 'You must select exactly 3 frish cards before continuing.' });
        return;
      }
      if (player.readyForFrish) {
        appendRoomLog(roomCode, `Invalid action: Player already marked ready for frish (userId: ${userId})`);
        socket.emit('error', { message: 'You are already marked as ready for frish.' });
        return;
      }
      player.readyForFrish = true;
      // Count how many players are ready
      const readyCount = game.players.filter(p => p.readyForFrish).length;
      game.readyForFrishCount = readyCount;
      appendRoomLog(roomCode, `Player ${player.position} (${player.email || player.userId}) marked ready for frish. Total ready: ${readyCount}`);

      // If all 4 players are ready, swap frish cards
      if (readyCount === 4) {
        completeFrishPhase(game, roomCode, io, activeGames, sortHand, appendRoomLog);
      }
      await game.save();
      activeGames.set(roomCode, game);
      // Emit filtered game to each player for frishReady
      game.players.forEach(p => {
        const filteredGame = getFilteredGameForPlayer(game, p.userId);
        io.to(p.userId.toString()).emit('frishReady', { userId, game: filteredGame });
      });
      return;
    } catch (error) {
      appendRoomLog(roomCode, `Invalid action: Failed to mark ready for frish (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to mark ready for frish' });
    }
  });
}

module.exports = { registerAuctionHandlers };
