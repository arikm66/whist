const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Game = require('../../models/Game');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Game.deleteMany({});
});

describe('Game Model', () => {
  describe('Schema Validation', () => {
    test('creates a valid game with minimum required fields', async () => {
      const gameData = {
        roomCode: 'TEST123',
        players: [{
          email: 'test@example.com',
          position: 0,
          hand: [],
          tricksWon: 0
        }]
      };

      const game = new Game(gameData);
      const savedGame = await game.save();

      expect(savedGame.roomCode).toBe('TEST123');
      expect(savedGame.status).toBe('waiting');
      expect(savedGame.players).toHaveLength(1);
    });

    test('requires roomCode', async () => {
      const game = new Game({
        players: [{
          email: 'test@example.com',
          position: 0
        }]
      });

      await expect(game.save()).rejects.toThrow();
    });

    test('roomCode must be unique', async () => {
      const gameData = {
        roomCode: 'UNIQUE',
        players: [{
          email: 'test@example.com',
          position: 0
        }]
      };

      await new Game(gameData).save();
      
      const duplicate = new Game(gameData);
      await expect(duplicate.save()).rejects.toThrow();
    });

    test('status must be valid enum value', async () => {
      const game = new Game({
        roomCode: 'TEST123',
        status: 'invalid_status',
        players: []
      });

      await expect(game.save()).rejects.toThrow();
    });

    test('position must be between 0 and 3', async () => {
      const game = new Game({
        roomCode: 'TEST123',
        players: [{
          email: 'test@example.com',
          position: 5
        }]
      });

      await expect(game.save()).rejects.toThrow();
    });
  });

  describe('Player Management', () => {
    test('can add multiple players', async () => {
      const game = new Game({
        roomCode: 'TEST123',
        players: [
          { email: 'player1@example.com', position: 0, hand: [] },
          { email: 'player2@example.com', position: 1, hand: [] },
          { email: 'player3@example.com', position: 2, hand: [] },
          { email: 'player4@example.com', position: 3, hand: [] }
        ]
      });

      const savedGame = await game.save();
      expect(savedGame.players).toHaveLength(4);
    });

    test('initializes tricksWon to 0 by default', async () => {
      const game = new Game({
        roomCode: 'TEST123',
        players: [{
          email: 'test@example.com',
          position: 0,
          hand: []
        }]
      });

      const savedGame = await game.save();
      expect(savedGame.players[0].tricksWon).toBe(0);
    });

    test('stores player hands as array of strings', async () => {
      const game = new Game({
        roomCode: 'TEST123',
        players: [{
          email: 'test@example.com',
          position: 0,
          hand: ['AS', 'KH', 'QD', 'JC']
        }]
      });

      const savedGame = await game.save();
      expect(savedGame.players[0].hand).toEqual(['AS', 'KH', 'QD', 'JC']);
    });

    test('rejects adding more than 4 players', async () => {
      const game = new Game({
        roomCode: 'TEST123',
        players: [
          { email: 'player1@example.com', position: 0, hand: [] },
          { email: 'player2@example.com', position: 1, hand: [] },
          { email: 'player3@example.com', position: 2, hand: [] },
          { email: 'player4@example.com', position: 3, hand: [] },
          { email: 'player5@example.com', position: 0, hand: [] }
        ]
      });

      await expect(game.save()).rejects.toThrow('A game cannot have more than 4 players');
    });
  });

  describe('Game State', () => {
    test('defaults to waiting status', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        players: []
      }).save();

      expect(game.status).toBe('waiting');
    });

    test('tracks current turn', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        currentTurn: 2,
        players: []
      }).save();

      expect(game.currentTurn).toBe(2);
    });

    test('stores current trick', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        currentTrick: [
          { position: 0, card: 'AS' },
          { position: 1, card: 'KH' }
        ],
        players: []
      }).save();

      expect(game.currentTrick).toHaveLength(2);
      expect(game.currentTrick[0].card).toBe('AS');
    });

    test('stores trump suit', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        trumpSuit: 'H',
        players: []
      }).save();

      expect(game.trumpSuit).toBe('H');
    });
  });

  describe('Auction Phase', () => {
    test('stores auction bids with timestamps', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        auctionBids: [{
          position: 0,
          quantity: 7,
          suit: 'H',
          timestamp: new Date()
        }],
        players: []
      }).save();

      expect(game.auctionBids).toHaveLength(1);
      expect(game.auctionBids[0].quantity).toBe(7);
      expect(game.auctionBids[0].suit).toBe('H');
    });

    test('tracks auction winner', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        auctionWinner: 2,
        players: []
      }).save();

      expect(game.auctionWinner).toBe(2);
    });

    test('stores highest bid', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        auctionHighestBid: {
          quantity: 8,
          suit: 'S'
        },
        players: []
      }).save();

      expect(game.auctionHighestBid.quantity).toBe(8);
      expect(game.auctionHighestBid.suit).toBe('S');
    });
  });

  describe('Bidding Phase', () => {
    test('stores bids array', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        bids: [3, 4, 2, 5],
        players: []
      }).save();

      expect(game.bids).toEqual([3, 4, 2, 5]);
    });

    test('tracks current bidder', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        currentBidder: 1,
        players: []
      }).save();

      expect(game.currentBidder).toBe(1);
    });
  });

  describe('Scoring', () => {
    test('stores scores for each position', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        scores: [
          { position: 0, score: 10 },
          { position: 1, score: 20 },
          { position: 2, score: 15 },
          { position: 3, score: 5 }
        ],
        players: []
      }).save();

      expect(game.scores).toHaveLength(4);
      expect(game.scores[1].score).toBe(20);
    });

    test('tracks round number', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        round: 3,
        players: []
      }).save();

      expect(game.round).toBe(3);
    });
  });

  describe('Timestamps', () => {
    test('automatically sets createdAt', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        players: []
      }).save();

      expect(game.createdAt).toBeInstanceOf(Date);
    });

    test('automatically sets updatedAt', async () => {
      const game = await new Game({
        roomCode: 'TEST123',
        players: []
      }).save();

      expect(game.updatedAt).toBeInstanceOf(Date);
    });
  });
});
