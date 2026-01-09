const Game = require('../models/Game');
const { dealCards, determineTrickWinner, isValidPlay, getCardSuit, sortHand } = require('../utils/gameLogic');

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
    
    // Deal cards
    const hands = dealCards();
    game.players[0].hand = sortHand(hands.player0);
    game.players[1].hand = sortHand(hands.player1);
    game.players[2].hand = sortHand(hands.player2);
    game.players[3].hand = sortHand(hands.player3);
    
    // Determine trump (simplified - last card of dealer)
    const dealerHand = game.players[game.dealer].hand;
    game.trumpSuit = getCardSuit(dealerHand[dealerHand.length - 1]);
    
    game.status = 'playing';
    game.currentTurn = (game.dealer + 1) % 4;
    
    await game.save();
    activeGames.set(roomCode, game);
    
    io.to(roomCode).emit('gameStarted', { game });
  } catch (error) {
    console.error('Start game error:', error);
  }
}

async function endRound(game, roomCode, io) {
  // Calculate scores (simplified scoring)
  game.players.forEach((player, idx) => {
    const existingScore = game.scores.find(s => s.position === idx);
    const roundScore = player.tricksWon;
    
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
    game.players[0].hand = sortHand(hands.player0);
    game.players[1].hand = sortHand(hands.player1);
    game.players[2].hand = sortHand(hands.player2);
    game.players[3].hand = sortHand(hands.player3);
    
    const dealerHand = game.players[game.dealer].hand;
    game.trumpSuit = getCardSuit(dealerHand[dealerHand.length - 1]);
    game.currentTurn = (game.dealer + 1) % 4;
    
    await game.save();
    activeGames.set(roomCode, game);
    io.to(roomCode).emit('newRound', { game });
  }
}
