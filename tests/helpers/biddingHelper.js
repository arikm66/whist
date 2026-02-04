/**
 * Bidding Helper - Calculates recommended trick bid for a Whist player
 * 
 * Card Format: "AS" = Ace of Spades, "KH" = King of Hearts, etc.
 * Ranks: A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2
 * Suits: S (Spades), H (Hearts), D (Diamonds), C (Clubs)
 */

// Card values represent expected trick-winning potential (out of 1 trick per card)
// Calibrated to average ~13 total tricks per round across 4 players
const CARD_VALUES = {
  'A': 1.0,   // Ace - very likely to win 1 trick
  'K': 0.85,  // King - likely to win if Ace doesn't appear
  'Q': 0.65,  // Queen - moderate chance
  'J': 0.45,  // Jack - decent chance
  '10': 0.30, // 10 - possible winner
  '9': 0.15,  // 9 - can win in right situations
};

const TRUMP_MULTIPLIER = 1.2; // Trump cards worth 20% more

/**
 * Parse a card string into rank and suit
 * @param {string} card - Card in format "AS", "10H", etc.
 * @returns {Object} {rank, suit}
 */
function parseCard(card) {
  if (card.length === 2) {
    return { rank: card[0], suit: card[1] };
  }
  // Handle "10" rank
  return { rank: card.substring(0, card.length - 1), suit: card[card.length - 1] };
}

/**
 * Count cards by suit
 * @param {Array<string>} hand - Array of card strings
 * @returns {Object} Suit counts {S: 3, H: 2, D: 4, C: 4}
 */
function getSuitDistribution(hand) {
  const distribution = { S: 0, H: 0, D: 0, C: 0 };
  hand.forEach(card => {
    const { suit } = parseCard(card);
    distribution[suit]++;
  });
  return distribution;
}

/**
 * Calculate trick bid for a player
 * @param {Array<string>} hand - Player's hand (e.g., ["AS", "KH", "10C"])
 * @param {string|null} trumpSuit - Trump suit ('S', 'H', 'D', 'C') or null for No Trump
 * @returns {Object} {bid: number, reasoning: string}
 */
function calculateTrickBid(hand, trumpSuit) {
  if (!hand || hand.length === 0) {
    return { bid: 0, reasoning: "Empty hand" };
  }

  let totalValue = 0;
  let highCards = 0;
  let trumpCount = 0;
  let trumpValue = 0;
  const reasoningParts = [];

  // Count suit distribution
  const distribution = getSuitDistribution(hand);

  // 1. High Card Value & Trump Power
  hand.forEach(card => {
    const { rank, suit } = parseCard(card);
    const baseValue = CARD_VALUES[rank] || 0;
    
    if (baseValue > 0) {
      highCards++;
    }

    // Apply trump multiplier if this is a trump card
    if (trumpSuit && suit === trumpSuit) {
      trumpCount++;
      const trumpCardValue = baseValue * TRUMP_MULTIPLIER;
      trumpValue += trumpCardValue;
      totalValue += trumpCardValue;
    } else {
      totalValue += baseValue;
    }
  });

  // 2. Short Suit Strategy - potential for trumping
  let shortSuitBonus = 0;
  if (trumpSuit) {
    Object.entries(distribution).forEach(([suit, count]) => {
      // If we have 0-1 cards in a non-trump suit and we have trumps
      if (suit !== trumpSuit && count === 0 && trumpCount > 0) {
        shortSuitBonus += 0.5; // Void adds ruffing potential
      } else if (suit !== trumpSuit && count === 1 && trumpCount > 2) {
        shortSuitBonus += 0.3; // Singleton with enough trumps
      }
    });
  }

  totalValue += shortSuitBonus;

  // 3. Trump Length Bonus - having many trumps is powerful
  let trumpLengthBonus = 0;
  if (trumpCount >= 6) {
    trumpLengthBonus = 1.2; // Very long trumps
    reasoningParts.push(`Long Trump (${trumpCount})`);
  } else if (trumpCount >= 5) {
    trumpLengthBonus = 0.8;
    reasoningParts.push(`Long Trump (${trumpCount})`);
  } else if (trumpCount >= 4) {
    trumpLengthBonus = 0.4;
  }

  totalValue += trumpLengthBonus;

  // 4. No Trump Compensation - compensate for lack of trump bonuses
  // In No Trump, high cards are more valuable and predictable
  if (!trumpSuit) {
    totalValue *= 1.15; // 15% boost for No Trump scenarios
  }

  // 5. Safety Margin - be slightly conservative
  // Reduce the bid slightly to account for uncertainty
  const safetyFactor = 0.96; // Very slight reduction for uncertainty
  const adjustedValue = totalValue * safetyFactor;

  // Round down to be conservative
  const recommendedBid = Math.floor(adjustedValue);

  // Build reasoning string
  if (highCards > 0) {
    reasoningParts.unshift(`${highCards} High Cards`);
  }
  if (trumpCount > 0 && trumpCount < 5) {
    reasoningParts.push(`${trumpCount} Trump${trumpCount > 1 ? 's' : ''}`);
  }
  if (shortSuitBonus > 0) {
    const voidCount = Object.values(distribution).filter(c => c === 0).length;
    const singletonCount = Object.values(distribution).filter(c => c === 1).length;
    if (voidCount > 0) reasoningParts.push(`${voidCount} Void`);
    if (singletonCount > 0) reasoningParts.push(`${singletonCount} Singleton`);
  }

  const reasoning = reasoningParts.length > 0 
    ? reasoningParts.join(' + ') 
    : "Low hand strength";

  // Ensure bid is within valid range (0 to hand size)
  const finalBid = Math.max(0, Math.min(recommendedBid, hand.length));

  return {
    bid: finalBid,
    reasoning: reasoning
  };
}

/**
 * Get detailed hand analysis for debugging
 * @param {Array<string>} hand - Player's hand
 * @param {string|null} trumpSuit - Trump suit or null
 * @returns {Object} Detailed analysis
 */
function analyzeHand(hand, trumpSuit) {
  const distribution = getSuitDistribution(hand);
  const trumps = hand.filter(card => {
    const { suit } = parseCard(card);
    return trumpSuit && suit === trumpSuit;
  });
  
  const highCards = hand.filter(card => {
    const { rank } = parseCard(card);
    return ['A', 'K', 'Q', 'J', '10'].includes(rank);
  });

  const { bid, reasoning } = calculateTrickBid(hand, trumpSuit);

  return {
    handSize: hand.length,
    distribution,
    trumpCount: trumps.length,
    highCardCount: highCards.length,
    highCards: highCards,
    recommendedBid: bid,
    reasoning
  };
}

module.exports = {
  calculateTrickBid,
  analyzeHand,
  parseCard,
  getSuitDistribution
};
