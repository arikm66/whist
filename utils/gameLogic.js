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
function dealCards() {
  const deck = shuffleDeck(generateDeck());
  return {
    player0: deck.slice(0, 13),
    player1: deck.slice(13, 26),
    player2: deck.slice(26, 39),
    player3: deck.slice(39, 52)
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

// Sort hand by suit and value
function sortHand(hand) {
  const suitOrder = { 'S': 0, 'H': 1, 'D': 2, 'C': 3 };
  
  return hand.sort((a, b) => {
    const suitA = getCardSuit(a);
    const suitB = getCardSuit(b);
    
    if (suitA !== suitB) {
      return suitOrder[suitA] - suitOrder[suitB];
    }
    
    return getCardValue(b) - getCardValue(a);
  });
}

module.exports = {
  generateDeck,
  shuffleDeck,
  dealCards,
  getCardValue,
  getCardSuit,
  determineTrickWinner,
  isValidPlay,
  sortHand
};
