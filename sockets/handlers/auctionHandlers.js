const Game = require('../../models/Game');
const { appendRoomLog } = require('../../utils/logToFile');
const { isValidAuctionBid } = require('../../utils/gameLogic');
const { advanceAuctionTurn } = require('../utils/socketUtils');

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
      io.to(roomCode).emit('auctionBidPlaced', { position: player.position, bid, game });
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
        io.to(roomCode).emit('frishStarted', { game });
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
        io.to(roomCode).emit('auctionComplete', { game });
        return;
      }
      io.to(roomCode).emit('auctionPassed', { position: player.position, game });
      await advanceAuctionTurn(game, roomCode, io, activeGames);
    } catch (error) {
      console.error('Pass auction error:', error);
      appendRoomLog(roomCode, `Invalid action: Failed to pass auction (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to pass' });
    }
  });

  // Handle frish card selection
  socket.on('selectFrishCard', async ({ roomCode, userId, frish }) => {
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
      const cardInHand = Array.isArray(player.hand)
        ? player.hand.includes(frish.card) || player.hand.some(c => (c.card || c) === frish.card)
        : false;
      if (!cardInHand) {
        appendRoomLog(roomCode, `Invalid action: Card not in hand (userId: ${userId}, card: ${frish.card})`);
        socket.emit('error', { message: 'Card not in hand' });
        return;
      }
      if (typeof frish.place !== 'number' || frish.place < 0 || frish.place >= player.hand.length) {
        appendRoomLog(roomCode, `Invalid action: Invalid card place (userId: ${userId}, place: ${frish.place})`);
        socket.emit('error', { message: 'Invalid card place' });
        return;
      }
      if (!Array.isArray(player.frish)) player.frish = [];
      const existingIdx = player.frish.findIndex(f => f.place === frish.place && f.card === frish.card);
      if (existingIdx >= 0) {
        player.frish.splice(existingIdx, 1);
        appendRoomLog(roomCode, `selectFrishCard event: Player ${player.position}, action=deselected, userId=${userId}, card=${frish?.card}, place=${frish?.place}`);
      } else {
        if (player.frish.length >= 3) {
          appendRoomLog(roomCode, `Invalid action: Cannot select more than 3 frish cards (userId: ${userId})`);
          socket.emit('error', { message: 'You can only select up to 3 frish cards.' });
          return;
        }
        player.frish.push({ place: frish.place, card: frish.card });
        appendRoomLog(roomCode, `selectFrishCard event: Player ${player.position}, action=selected, userId=${userId}, card=${frish?.card}, place=${frish?.place}`);
      }
      await game.save();
      activeGames.set(roomCode, game);
      socket.emit('frishCardSelected', { userId, frish, game });
    } catch (error) {
      appendRoomLog(roomCode, `Invalid action: Failed to select frish card (userId: ${userId})`);
      socket.emit('error', { message: 'Failed to select frish card' });
    }
  });
}

// You must provide advanceAuctionTurn as a dependency from the main file
module.exports = { registerAuctionHandlers };
