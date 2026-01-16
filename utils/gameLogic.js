// Whist Card Game Logic Utilities

// Generate a standard 52-card deck
function generateDeck() {
  const suits = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(rank + suit);
    }
  }
  
  return deck;
}

// Shuffle deck using Fisher-Yates algorithm
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Deal cards to 4 players (13 cards each)
// TODO: For testing, temporarily deal only 3 cards each
function dealCards() {
  const deck = shuffleDeck(generateDeck());
  const CARDS_PER_PLAYER = 13;
  return {
    player0: deck.slice(0, CARDS_PER_PLAYER),
    player1: deck.slice(CARDS_PER_PLAYER, CARDS_PER_PLAYER * 2),
    player2: deck.slice(CARDS_PER_PLAYER * 2, CARDS_PER_PLAYER * 3),
    player3: deck.slice(CARDS_PER_PLAYER * 3, CARDS_PER_PLAYER * 4)
  };
}

// Get card value for comparison (2=2, ..., J=11, Q=12, K=13, A=14)
function getCardValue(card) {
  const rank = card.slice(0, -1);
  const values = { 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return values[rank] || parseInt(rank);
}

// Get card suit
function getCardSuit(card) {
  return card.slice(-1);
}

// Determine winner of a trick
function determineTrickWinner(trick, trumpSuit, leadSuit) {
  let winningPlay = trick[0];
  
  for (let i = 1; i < trick.length; i++) {
    const currentCard = trick[i].card;
    const winningCard = winningPlay.card;
    const currentSuit = getCardSuit(currentCard);
    const winningSuit = getCardSuit(winningCard);
    
    // Trump beats everything
    if (currentSuit === trumpSuit && winningSuit !== trumpSuit) {
      winningPlay = trick[i];
    } 
    // If both trump, higher value wins
    else if (currentSuit === trumpSuit && winningSuit === trumpSuit) {
      if (getCardValue(currentCard) > getCardValue(winningCard)) {
        winningPlay = trick[i];
      }
    }
    // Must follow lead suit
    else if (currentSuit === leadSuit && winningSuit !== trumpSuit) {
      if (winningSuit !== leadSuit || getCardValue(currentCard) > getCardValue(winningCard)) {
        winningPlay = trick[i];
      }
    }
  }
  
  return winningPlay.position;
}

// Validate if a card play is legal
function isValidPlay(card, hand, leadSuit, currentTrick) {
  // First card in trick - any card is valid
  if (currentTrick.length === 0) {
    return hand.includes(card);
  }
  
  const cardSuit = getCardSuit(card);
  
  // Must follow suit if possible
  const hasLeadSuit = hand.some(c => getCardSuit(c) === leadSuit);
  
  if (hasLeadSuit && cardSuit !== leadSuit) {
    return false; // Must follow suit
  }
  
  return hand.includes(card);
}

// Sort hand by suit, then by value ascending (smallest to the left)
function sortHand(hand) {
  const suitOrder = { 'S': 0, 'H': 1, 'C': 2, 'D': 3 };
  
  return hand.sort((a, b) => {
    const suitA = getCardSuit(a);
    const suitB = getCardSuit(b);
    
    if (suitA !== suitB) {
      return suitOrder[suitA] - suitOrder[suitB];
    }
    
    return getCardValue(a) - getCardValue(b);
  });
}

// Auction phase helpers
function getAuctionSuitRank(suit) {
  // Clubs < Diamonds < Hearts < Spades < No-Trump
  const ranks = { 'C': 0, 'D': 1, 'H': 2, 'S': 3, 'NT': 4 };
  return ranks[suit] !== undefined ? ranks[suit] : -1;
}

// Compare two auction bids. Returns 1 if bid1 > bid2, -1 if bid1 < bid2, 0 if equal
function compareAuctionBids(bid1, bid2) {
  if (bid1.quantity > bid2.quantity) return 1;
  if (bid1.quantity < bid2.quantity) return -1;
  
  const suit1Rank = getAuctionSuitRank(bid1.suit);
  const suit2Rank = getAuctionSuitRank(bid2.suit);
  
  if (suit1Rank > suit2Rank) return 1;
  if (suit1Rank < suit2Rank) return -1;
  return 0;
}

// Validate auction bid against minimum and previous highest bid
function isValidAuctionBid(bid, cardsDealt, highestBid) {
  const minQuantity = Math.max(1, cardsDealt - 8);
  if (bid.quantity < minQuantity || bid.quantity > cardsDealt) {
    return false;
  }
  
  if (highestBid && compareAuctionBids(bid, highestBid) <= 0) {
    return false;
  }
  
  return true;
}

// Calculate score for a player in a round
function calculateRoundScore(bid, tricksWon, bidSum) {
  let roundScore = 0;

  // Special scoring for bid = 0
  if (bid === 0) {
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

  return roundScore;
}

module.exports = {
  generateDeck,
  shuffleDeck,
  dealCards,
  getCardValue,
  getCardSuit,
  determineTrickWinner,
  isValidPlay,
  sortHand,
  getAuctionSuitRank,
  compareAuctionBids,
  isValidAuctionBid,
  calculateRoundScore
};
