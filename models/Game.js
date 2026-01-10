const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true },
  players: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    position: { type: Number, min: 0, max: 3 }, // 0: North, 1: East, 2: South, 3: West
    hand: [String], // Array of card strings like "AS", "KH", "QD", "JC"
    tricksWon: { type: Number, default: 0 }
  }],
  status: { 
    type: String, 
    enum: ['waiting', 'auction', 'bidding', 'playing', 'finished'], 
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
