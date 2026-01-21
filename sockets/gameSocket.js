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
        appendRoomLog(roomCode, `Room created by ${userId} ${email}`);
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
        // Check if player is already in the room
        const existingPlayer = game.players.find(p => p.userId.toString() === userId.toString());
        if (existingPlayer) {
          // Only join socket room and emit roomJoined ONCE
          socket.join(roomCode);
          socket._roomCode = roomCode;
          socket._userId = userId;
          socket.emit('roomJoined', { game });
          return;
        }
        // Only allow new player if room is not full and game not started
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
        socket.emit('roomJoined', { game });
        io.to(roomCode).emit('playerJoined', { game });
        broadcastRoomsList(io);
        if (game.players.length === 4) {
          startGame(roomCode, io);
        }
        appendRoomLog(roomCode, `Player joined: ${userId} ${email}`);
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
        // Notify all players in the room to go to lobby
        io.to(roomCode).emit('roomClosed', { roomCode });
        broadcastRoomsList(io);
        if (leavingPlayerEmail) {
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
        appendRoomLog(roomCode, `Place auction bid attempt: Player ${userId} bidding ${quantity} ${suit}`);
        
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
        appendRoomLog(roomCode, `Pass auction attempt: userId ${userId} passing`);
        
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
        // Record pass
        game.auctionPassed.push(player.position);
        appendRoomLog(roomCode, `Auction passed: Player ${player.position} (${player.email || player.userId})`);
        appendRoomLog(roomCode, `game.auctionPassed.length: ${game ? game.auctionPassed.length : 'N/A'}`);
        appendRoomLog(roomCode, `game.auctionBids: ${game && game.auctionBids ? game.auctionBids.length : 'N/A'}`);
        // Check if all 4 players have passed (all pass scenario)
        if ((!game.auctionBids || game.auctionBids.length === 0) && game.auctionPassed.length === 4) {
          // Enter frish phase
          appendRoomLog(roomCode, 'Auction completed: All players passed, entering frish phase.');
          game.status = 'frish';
          await game.save();
          activeGames.set(roomCode, game);
          io.to(roomCode).emit('frishStarted', { game });
          return;
        }

        // During final raise, allow auction winner to pass to end auction
        if (game.auctionFinalRaise && player.position === game.auctionWinner) {
          appendRoomLog(roomCode, `auctionFinalRaise: ${game.auctionFinalRaise} Player ${player.position} (${player.email || player.userId}) passed to end auction.`);
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

        // Broadcast pass to all players
        io.to(roomCode).emit('auctionPassed', { position: player.position, game });
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
      // On disconnect, do not remove player or abort game. Only log disconnect.
      if (socket._roomCode && socket._userId) {
        appendRoomLog(socket._roomCode, `User disconnected: ${socket._userId}`);
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

    // Ensure scores array is initialized for all players
    if (!Array.isArray(game.scores)) game.scores = [];
    for (let i = 0; i < 4; i++) {
      if (!game.scores.find(s => s.position === i)) {
        game.scores.push({ position: i, score: 0 });
      }
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
  const roundTricks = [];
  const tricksCount = game.players[0].tricksWon + game.players[1].tricksWon + game.players[2].tricksWon + game.players[3].tricksWon;
  // For each trick, you would need to store the cards played and who won. This assumes you have a way to track all tricks in the round (not just the last one).
  // For now, we'll just send an empty array for tricks. You should adapt this to your actual trick-tracking logic.

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
