const Game = require('../models/Game');
const { dealCards, determineTrickWinner, isValidPlay, getCardSuit, sortHand, isValidAuctionBid, compareAuctionBids } = require('../utils/gameLogic');

// Store active games in memory for faster access
const activeGames = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new game room
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
        
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, game });
        
        // Broadcast new room to all connected clients
        io.emit('roomsListUpdated');
        
        console.log(`Room ${roomCode} created by ${email}`);
      } catch (error) {
        socket.emit('error', { message: 'Failed to create room' });
      }
    });

    // Join an existing game room
    socket.on('joinRoom', async ({ roomCode, userId, email }) => {
      try {
        let game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Allow rejoin even if room is full or started
        const existingPlayer = game.players.find(p => p.userId.toString() === userId.toString());
        if (existingPlayer) {
          socket.join(roomCode);
          socket.emit('roomJoined', { game });
          return;
        }

        if (game.players.length >= 4) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }

        if (game.status !== 'waiting') {
          socket.emit('error', { message: 'Game already started' });
          return;
        }

        // Add player
        game.players.push({
          userId,
          email,
          position: game.players.length,
          hand: [],
          tricksWon: 0
        });

        await game.save();
        activeGames.set(roomCode, game);
        
        socket.join(roomCode);
        io.to(roomCode).emit('playerJoined', { game });
        
        // Notify all clients to refresh room list (player count changed)
        io.emit('roomsListUpdated');

        // Start game if 4 players
        if (game.players.length === 4) {
          startGame(roomCode, io);
        }
      } catch (error) {
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Get available rooms
    socket.on('getRooms', async () => {
      try {
        const rooms = await Game.find({ status: 'waiting' }).select('roomCode players createdAt');
        socket.emit('roomsList', { rooms });
      } catch (error) {
        socket.emit('error', { message: 'Failed to fetch rooms' });
      }
    });

    // Place auction bid or pass during auction phase
    socket.on('placeAuctionBid', async ({ roomCode, userId, quantity, suit }) => {
      try {
        const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        if (game.status !== 'auction') {
          socket.emit('error', { message: 'Not in auction phase' });
          return;
        }

        const player = game.players.find(p => p.userId.toString() === userId.toString());
        if (!player) {
          socket.emit('error', { message: 'Player not in game' });
          return;
        }

        if (player.position !== game.auctionCurrentBidder) {
          socket.emit('error', { message: 'Not your turn in auction' });
          return;
        }

        if (game.auctionPassed.includes(player.position)) {
          socket.emit('error', { message: 'You have already passed' });
          return;
        }

        const cardsDealt = game.players[0].hand.length;

        // Validate auction bid
        const bid = { quantity, suit };
        if (!isValidAuctionBid(bid, cardsDealt, game.auctionHighestBid)) {
          const minQty = Math.max(1, cardsDealt - 8);
          let msg = `Invalid bid. Minimum: ${minQty}, Maximum: ${cardsDealt}`;
          if (game.auctionHighestBid) {
            msg += `. Must beat ${game.auctionHighestBid.quantity} ${game.auctionHighestBid.suit}`;
          }
          socket.emit('error', { message: msg });
          return;
        }

        // Record auction bid
        game.auctionBids.push({
          position: player.position,
          quantity,
          suit,
          timestamp: new Date()
        });
        game.auctionHighestBid = bid;

        // Broadcast auction bid to all players
        io.to(roomCode).emit('auctionBidPlaced', { position: player.position, bid, game });

        // Move to next bidder
        await advanceAuctionTurn(game, roomCode, io);
      } catch (error) {
        console.error('Place auction bid error:', error);
        socket.emit('error', { message: 'Failed to place auction bid' });
      }
    });

    // Pass during auction phase
    socket.on('passAuction', async ({ roomCode, userId }) => {
      try {
        const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        if (game.status !== 'auction') {
          socket.emit('error', { message: 'Not in auction phase' });
          return;
        }

        const player = game.players.find(p => p.userId.toString() === userId.toString());
        if (!player) {
          socket.emit('error', { message: 'Player not in game' });
          return;
        }

        if (player.position !== game.auctionCurrentBidder) {
          socket.emit('error', { message: 'Not your turn in auction' });
          return;
        }

        if (game.auctionPassed.includes(player.position)) {
          socket.emit('error', { message: 'You have already passed' });
          return;
        }

        // Record pass
        game.auctionPassed.push(player.position);

        // Broadcast pass to all players
        io.to(roomCode).emit('auctionPassed', { position: player.position, game });

        // Check if all 4 players have passed (all pass scenario)
        if (game.auctionPassed.length === 4) {
          // Hand is "Dead" - reshuffle and deal to next player
          game.dealer = (game.dealer + 1) % 4;
          game.players.forEach(p => p.tricksWon = 0);
          
          const hands = dealCards();
          game.players[0].hand = sortHand(hands.player0);
          game.players[1].hand = sortHand(hands.player1);
          game.players[2].hand = sortHand(hands.player2);
          game.players[3].hand = sortHand(hands.player3);
          
          // Restart auction
          game.auctionCurrentBidder = (game.dealer + 1) % 4;
          game.auctionWinner = null;
          game.auctionHighestBid = null;
          game.auctionPassed = [];
          game.auctionBids = [];
          
          await game.save();
          activeGames.set(roomCode, game);
          io.to(roomCode).emit('auctionRestarted', { game });
          return;
        }

        // Move to next bidder
        await advanceAuctionTurn(game, roomCode, io);
      } catch (error) {
        console.error('Pass auction error:', error);
        socket.emit('error', { message: 'Failed to pass' });
      }
    });

    // Place bid during bidding phase
    socket.on('placeBid', async ({ roomCode, userId, bid }) => {
      try {
        const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        if (game.status !== 'bidding') {
          socket.emit('error', { message: 'Not in bidding phase' });
          return;
        }

        const player = game.players.find(p => p.userId.toString() === userId.toString());
        if (!player) {
          socket.emit('error', { message: 'Player not in game' });
          return;
        }

        if (player.position !== game.currentBidder) {
          socket.emit('error', { message: 'Not your turn to bid' });
          return;
        }

        // Validate bid
        const tricksAvailable = game.players[0].hand.length;
        bid = parseInt(bid);

        // New rules: min 0, max = tricksAvailable, no monotonic constraint
        if (isNaN(bid) || bid < 0 || bid > tricksAvailable) {
          socket.emit('error', { message: `Bid must be between 0 and ${tricksAvailable}` });
          return;
        }

        // Last bidder (4th player after auction winner) cannot make total equal to tricksAvailable
        const lastBidderPos = (game.auctionWinner + 3) % 4;
        if (player.position === lastBidderPos) {
          const sumPrev = game.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0);
          if (sumPrev + bid === tricksAvailable) {
            socket.emit('error', { message: `As last bidder, you cannot bid ${bid} because total would equal ${tricksAvailable}` });
            return;
          }
        }

        // Record bid
        game.bids[player.position] = bid;

        // Broadcast bid to all players
        io.to(roomCode).emit('bidPlaced', { position: player.position, bid, game });

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
        socket.emit('error', { message: 'Failed to place bid' });
      }
    });

    // Play a card
    socket.on('playCard', async ({ roomCode, userId, card }) => {
      try {
        const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        const player = game.players.find(p => p.userId.toString() === userId.toString());
        if (!player) {
          socket.emit('error', { message: 'Player not in game' });
          return;
        }

        if (player.position !== game.currentTurn) {
          socket.emit('error', { message: 'Not your turn' });
          return;
        }

        // Validate play
        if (!isValidPlay(card, player.hand, game.leadSuit, game.currentTrick)) {
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

        // If trick complete (4 cards)
        if (game.currentTrick.length === 4) {
          const winner = determineTrickWinner(game.currentTrick, game.trumpSuit, game.leadSuit);
          game.players[winner].tricksWon++;
          
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
        socket.emit('error', { message: 'Failed to play card' });
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
};

// Helper functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function startGame(roomCode, io) {
  try {
    const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
    
    // Initialize dealer if not set (first game)
    if (game.dealer === undefined) {
      game.dealer = 0;
    }
    
    // Deal cards
    const hands = dealCards();
    
    game.players[0].hand = sortHand(hands.player0);
    game.players[1].hand = sortHand(hands.player1);
    game.players[2].hand = sortHand(hands.player2);
    game.players[3].hand = sortHand(hands.player3);
    
    // Initialize auction phase
    game.status = 'auction';
    game.auctionCurrentBidder = (game.dealer + 1) % 4; // Player after dealer bids first
    game.auctionWinner = null;
    game.auctionHighestBid = null;
    game.auctionPassed = [];
    game.auctionBids = [];
    
    // DO NOT set trump yet; it will be determined after auction
    game.trumpSuit = null;
    
    await game.save();
    activeGames.set(roomCode, game);
    
    io.to(roomCode).emit('gameStarted', { game });
  } catch (error) {
    console.error('Start game error:', error);
  }
}

async function endRound(game, roomCode, io) {
  // Calculate scores based on bidding
  game.players.forEach((player, idx) => {
    const bid = game.bids[idx];
    const tricksWon = player.tricksWon;
    let roundScore = 0;

    if (bid === tricksWon) {
      // Exact match: +10 + tricks²
      roundScore = 10 + (tricksWon * tricksWon);
    } else {
      // Over/under bid: -10 for every gap
      const gap = Math.abs(bid - tricksWon);
      roundScore = -10 * gap;
    }

    const existingScore = game.scores.find(s => s.position === idx);
    if (existingScore) {
      existingScore.score += roundScore;
    } else {
      game.scores.push({ position: idx, score: roundScore });
    }
  });

  game.round++;
  
  // Check if game complete (e.g., after 5 rounds)
  if (game.round > 5) {
    game.status = 'finished';
    await game.save();
    io.to(roomCode).emit('gameFinished', { game });
  } else {
    // Start new round
    game.dealer = (game.dealer + 1) % 4;
    game.players.forEach(p => p.tricksWon = 0);
    
    const hands = dealCards();
    
    // Determine trump from dealer's last card BEFORE sorting
    const dealerHand = hands[`player${game.dealer}`];
    game.trumpSuit = getCardSuit(dealerHand[dealerHand.length - 1]);
    
    game.players[0].hand = sortHand(hands.player0);
    game.players[1].hand = sortHand(hands.player1);
    game.players[2].hand = sortHand(hands.player2);
    game.players[3].hand = sortHand(hands.player3);
    
    // Initialize bidding phase for new round
    game.status = 'bidding';
    game.bids = [null, null, null, null];
    game.currentBidder = (game.dealer + 1) % 4;
    game.minBid = game.players[0].hand.length <= 5 ? 1 : 5;
    game.lastBid = 0;
    
    await game.save();
    activeGames.set(roomCode, game);
    io.to(roomCode).emit('newRound', { game });
  }
}

async function advanceAuctionTurn(game, roomCode, io) {
  // Find next player who hasn't passed
  let nextBidder = (game.auctionCurrentBidder + 1) % 4;
  let turns = 0;

  while (game.auctionPassed.includes(nextBidder) && turns < 4) {
    nextBidder = (nextBidder + 1) % 4;
    turns++;
  }

  // Check if auction is complete (3 have passed, 1 remains)
  if (game.auctionPassed.length === 3) {
    // Auction winner is the only player who hasn't passed
    const winner = [0, 1, 2, 3].find(pos => !game.auctionPassed.includes(pos));
    game.auctionWinner = winner;

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

    await game.save();
    activeGames.set(roomCode, game);
    io.to(roomCode).emit('auctionComplete', { game });
    return;
  }

  // Update current bidder and continue auction
  game.auctionCurrentBidder = nextBidder;
  await game.save();
  activeGames.set(roomCode, game);
  io.to(roomCode).emit('auctionNextBidder', { game });
}
