const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true },
  players: {
    type: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      email: String,
      position: { type: Number, min: 0, max: 3 },
      hand: [String],
      tricksWon: { type: Number, default: 0 },
      frishCards: [{
        card: { type: String, required: true }
      }],
      readyForFrish: { type: Boolean, default: false }
    }],
    validate: {
      validator: function(players) {
        return players.length <= 4;
      },
      message: 'A game cannot have more than 4 players'
    }
  },
  status: { 
    type: String, 
    enum: ['waiting', 'auction', 'frish', 'bidding', 'playing', 'finished'], 
    default: 'waiting' 
  },
  currentTurn: { type: Number, default: 0 }, // Position index (0-3)
  currentTrick: [{
    position: Number,
    card: String
  }],
  trumpSuit: { type: String, enum: ['H', 'D', 'C', 'S', null], default: null },
  // Auction phase fields
  auctionBids: [{
    position: Number,
    quantity: Number,
    suit: String,
    timestamp: Date
  }],
  auctionCurrentBidder: { type: Number, default: 0 },
  auctionWinner: { type: Number, default: null },
  auctionHighestBid: {
    quantity: Number,
    suit: String
  },
  auctionPassed: [Number], // Positions that have passed in auction
  auctionFinalRaise: { type: Boolean, default: false }, // True when auction winner gets final raise chance
  readyForFrishCount: { type: Number, default: 0 }, // Count of players ready for frish
  // Bidding phase fields
  bids: [Number], // Bids for each player position (0-3)
  currentBidder: { type: Number, default: 0 }, // Which player is currently bidding
  minBid: { type: Number, default: 1 }, // Minimum bid allowed
  lastBid: { type: Number, default: 0 }, // Last bid placed
  scores: [{
    position: Number,
    score: { type: Number, default: 0 }
  }],
  round: { type: Number, default: 1 },
  dealer: { type: Number, default: 0 },
  leadSuit: String, // First card suit played in current trick
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', GameSchema);
