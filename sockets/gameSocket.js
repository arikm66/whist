const Game = require('../models/Game');
const { dealCards, determineTrickWinner, isValidPlay, getCardSuit, sortHand, isValidAuctionBid, compareAuctionBids } = require('../utils/gameLogic');
const { createRoomLog, appendRoomLog, closeRoomLog } = require('../utils/logToFile');

// Store active games in memory for faster access
const activeGames = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
            socket.on('login', async ({ userId, email }) => {
              try {
                // Find all games where this user is a participant
                const games = await Game.find({ 'players.userId': userId });
                for (const game of games) {
                  // Only log if the room is active (not finished or aborted)
                  if (game.status !== 'finished' && game.status !== 'aborted') {
                    appendRoomLog(game.roomCode, `User logged in: ${email || userId}`);
                  }
                }
              } catch (err) {
                console.error('Login event error:', err);
                appendRoomLog('lobby', `Error during login event for userId: ${userId}, email: ${email} - ${err.message}`);
              }
            });
        socket.on('logout', async ({ userId, email }) => {
          try {
            // Find all games where this user is a participant
            const games = await Game.find({ 'players.userId': userId });
            for (const game of games) {
              // Only log if the room is active (not finished or aborted)
              if (game.status !== 'finished' && game.status !== 'aborted') {
                appendRoomLog(game.roomCode, `User logged out: ${email || userId}`);
              }
            }
          } catch (err) {
            console.error('Logout event error:', err);
            appendRoomLog('lobby', `Error during logout event for userId: ${userId}, email: ${email} - ${err.message}`);
          }
        });
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
        createRoomLog(roomCode);
        appendRoomLog(roomCode, `Room created by ${email}`);
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, game });
        
        // Broadcast new room list to all connected clients
        broadcastRoomsList(io);
      } catch (error) {
        socket.emit('error', { message: 'Failed to create room' });
      }
    });

    // Join an existing game room
    socket.on('joinRoom', async ({ roomCode, userId, email }) => {
      try {
        let game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        if (!game) {
          appendRoomLog(roomCode, `Invalid action: Room not found (userId: ${userId})`);
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        // Allow rejoin even if room is full or started
        const existingPlayer = game.players.find(p => p.userId.toString() === userId.toString());
        if (existingPlayer) {
          socket.join(roomCode);
          socket._roomCode = roomCode;
          socket._userId = userId;
          socket.emit('roomJoined', { game });
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
        // Add player atomically using MongoDB to prevent race condition duplicates
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
        socket._roomCode = roomCode;
        socket._userId = userId;
        io.to(roomCode).emit('playerJoined', { game });
        broadcastRoomsList(io);
        if (game.players.length === 4) {
          startGame(roomCode, io);
        }
        appendRoomLog(roomCode, `Player joined: ${email}`);
      } catch (error) {
        appendRoomLog(roomCode, `Invalid action: Failed to join room (userId: ${userId})`);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Handle leaveRoom event
    socket.on('leaveRoom', async ({ roomCode, userId }) => {
      try {
        // Remove player from MongoDB
        await Game.findOneAndUpdate(
          { roomCode },
          { $pull: { players: { userId } } }
        );
        // Remove from in-memory game
        const game = activeGames.get(roomCode);
        let wasActive = false;
        let leavingPlayerEmail = null;
        if (game) {
          const leavingPlayer = game.players.find(p => p.userId.toString() === userId.toString());
          leavingPlayerEmail = leavingPlayer ? leavingPlayer.email : null;
          game.players = game.players.filter(p => p.userId.toString() !== userId.toString());
          // If game is in progress, mark as finished and notify all
          if (game.status === 'playing' || game.status === 'auction') {
            game.status = 'finished';
            await game.save();
            io.to(roomCode).emit('gameFinished', { game });
            appendRoomLog(roomCode, `Game aborted: player left during active game (${leavingPlayerEmail || userId})`);
            closeRoomLog(roomCode);
            wasActive = true;
          }
          activeGames.set(roomCode, game);
        }
        // Leave socket.io room
        socket.leave(roomCode);
        // Notify others (only if not already finished)
        if (!wasActive) io.to(roomCode).emit('playerLeft', { userId });
        broadcastRoomsList(io);
        if (!wasActive && leavingPlayerEmail) {
          appendRoomLog(roomCode, `Player left: ${leavingPlayerEmail}`);
        }
      } catch (err) {
        appendRoomLog(roomCode, `Invalid action: Failed to leave room (userId: ${userId})`);
        socket.emit('error', { message: 'Failed to leave room' });
      }
    });

    // Get rooms (all, including finished) for lobby display
    socket.on('getRooms', async () => {
      try {
        const rooms = await Game.find({}).select('roomCode players status createdAt');
        socket.emit('roomsList', { rooms });
      } catch (error) {
        appendRoomLog('lobby', `Invalid action: Failed to fetch rooms (socketId: ${socket.id})`);
        socket.emit('error', { message: 'Failed to fetch rooms' });
      }
    });

    // Place auction bid or pass during auction phase
    socket.on('placeAuctionBid', async ({ roomCode, userId, quantity, suit }) => {
      try {
        const game = activeGames.get(roomCode) || await Game.findOne({ roomCode });
        
        if (!game) {
          appendRoomLog(roomCode, `Invalid action: Game not found (userId: ${userId})`);
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

        // Validate auction bid
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

        // Record auction bid
        game.auctionBids.push({
          position: player.position,
          quantity,
          suit,
          timestamp: new Date()
        });
        game.auctionHighestBid = bid;
        appendRoomLog(roomCode, `Auction bid placed: Player ${player.position} (${player.email || player.userId}) bid ${quantity} ${suit}`);

        // Broadcast auction bid to all players
        io.to(roomCode).emit('auctionBidPlaced', { position: player.position, bid, game });

        // Move to next bidder
        await advanceAuctionTurn(game, roomCode, io);
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

        // During final raise, allow auction winner to pass to end auction
        if (game.auctionFinalRaise && player.position === game.auctionWinner) {
          // Finalize auction and transition to bidding
          const winner = game.auctionWinner;

          // Set trump suit from auction winner's bid
          if (game.auctionHighestBid) {
            game.trumpSuit = game.auctionHighestBid.suit === 'NT' ? null : game.auctionHighestBid.suit;
          }

          // Initialize bidding phase with auction winner's bid
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

        if (game.auctionPassed.includes(player.position)) {
          appendRoomLog(roomCode, `Invalid action: Already passed in auction (userId: ${userId})`);
          socket.emit('error', { message: 'You have already passed' });
          return;
        }

        // Record pass
        game.auctionPassed.push(player.position);
        appendRoomLog(roomCode, `Auction passed: Player ${player.position} (${player.email || player.userId})`);
        // Broadcast pass to all players
        io.to(roomCode).emit('auctionPassed', { position: player.position, game });
        // Check if all 4 players have passed (all pass scenario)
        if (game.auctionPassed.length === 4) {
          // Hand is "Dead" - reshuffle and deal to next player
          appendRoomLog(roomCode, 'Auction completed: All players passed, hand is dead. Restarting auction.');
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
        appendRoomLog(roomCode, `Invalid action: Failed to pass auction (userId: ${userId})`);
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
      if (socket._roomCode && socket._userId) {
        try {
          await Game.findOneAndUpdate(
            { roomCode: socket._roomCode },
            { $pull: { players: { userId: socket._userId } } }
          );
          const game = activeGames.get(socket._roomCode);
          let wasActive = false;
          if (game) {
            game.players = game.players.filter(p => p.userId.toString() !== socket._userId.toString());
            if (game.status === 'playing' || game.status === 'auction') {
              game.status = 'finished';
              await game.save();
              io.to(socket._roomCode).emit('gameFinished', { game });
              appendRoomLog(socket._roomCode, `Game aborted: player disconnected during active game (${socket._userId})`);
              closeRoomLog(socket._roomCode);
              wasActive = true;
            }
            activeGames.set(socket._roomCode, game);
          }
          socket.leave(socket._roomCode);
             if (!wasActive) {
               appendRoomLog(socket._roomCode, `Player left: ${socket._userId}`);
               io.to(socket._roomCode).emit('playerLeft', { userId: socket._userId });
             }
          broadcastRoomsList(io);
        } catch (err) {
          console.error('Disconnect event error:', err);
          appendRoomLog('lobby', `Error during disconnect event for userId: ${socket._userId}, roomCode: ${socket._roomCode} - ${err.message}`);
        }
      }
      console.log('User disconnected:', socket.id);
    });
  // Helper to broadcast the current room list to all clients
  async function broadcastRoomsList(io) {
    try {
      const rooms = await Game.find({}).select('roomCode players status createdAt');
      io.emit('roomsList', { rooms });
    } catch (error) {
      console.error('Broadcast rooms list error:', error);
      appendRoomLog('lobby', `Error broadcasting rooms list: ${error.message}`);
    }
  }
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
    appendRoomLog(roomCode, 'Game started');
    appendRoomLog(roomCode, 'Auction started');
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
    // Special scoring for bid = 0
    if (bid === 0) {
      const bidSum = game.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0);
      if (tricksWon === 0) {
        // Match: 0 tricks won
        roundScore = bidSum < 13 ? 50 : 25;
      } else {
        // No match: won tricks but bid 0
        if (bidSum < 13) {
          roundScore = -50 + (tricksWon - 1) * 10;
        } else {
          roundScore = -25 + (tricksWon - 1) * 10;
        }
      }
    } else if (bid === tricksWon) {
      // Exact match (bid > 0): +10 + tricks²
      roundScore = 10 + (tricksWon * tricksWon);
    } else {
      // Over/under bid (bid > 0): -10 for every gap
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
  // Log latest scores for all players
  const scoreLines = game.scores.map(s => {
    const player = game.players[s.position];
    return `Player ${s.position} (${player?.email || player?.userId}): ${s.score}`;
  }).join('; ');
  appendRoomLog(roomCode, `Round ended: Round ${game.round}`);
  appendRoomLog(roomCode, `Scores after round ${game.round}: ${scoreLines}`);
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
    // Start new round
    appendRoomLog(roomCode, `Round started: Round ${game.round}`);
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
