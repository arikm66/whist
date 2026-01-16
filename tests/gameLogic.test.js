const {
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
} = require('../utils/gameLogic');

describe('Deck Generation and Shuffling', () => {
  describe('generateDeck', () => {
    test('generates a standard 52-card deck', () => {
      const deck = generateDeck();
      expect(deck).toHaveLength(52);
    });

    test('contains all suits', () => {
      const deck = generateDeck();
      const suits = deck.map(card => card.slice(-1));
      expect(suits).toContain('H');
      expect(suits).toContain('D');
      expect(suits).toContain('C');
      expect(suits).toContain('S');
    });

    test('contains all ranks', () => {
      const deck = generateDeck();
      const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      ranks.forEach(rank => {
        const hasRank = deck.some(card => card.startsWith(rank));
        expect(hasRank).toBe(true);
      });
    });

    test('has exactly 13 cards of each suit', () => {
      const deck = generateDeck();
      ['H', 'D', 'C', 'S'].forEach(suit => {
        const suitCards = deck.filter(card => card.endsWith(suit));
        expect(suitCards).toHaveLength(13);
      });
    });
  });

  describe('shuffleDeck', () => {
    test('returns deck with same length', () => {
      const deck = generateDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled).toHaveLength(deck.length);
    });

    test('contains all the same cards', () => {
      const deck = generateDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled.sort()).toEqual(deck.sort());
    });

    test('does not modify original deck', () => {
      const deck = generateDeck();
      const original = [...deck];
      shuffleDeck(deck);
      expect(deck).toEqual(original);
    });

    test('produces different order (probabilistic)', () => {
      const deck = generateDeck();
      const shuffled = shuffleDeck(deck);
      // Very unlikely to have same order after shuffle
      const isDifferent = deck.some((card, i) => card !== shuffled[i]);
      expect(isDifferent).toBe(true);
    });
  });

  describe('dealCards', () => {
    test('deals 13 cards to each of 4 players', () => {
      const dealt = dealCards();
      expect(dealt.player0).toHaveLength(13);
      expect(dealt.player1).toHaveLength(13);
      expect(dealt.player2).toHaveLength(13);
      expect(dealt.player3).toHaveLength(13);
    });

    test('no duplicate cards across players', () => {
      const dealt = dealCards();
      const allCards = [
        ...dealt.player0,
        ...dealt.player1,
        ...dealt.player2,
        ...dealt.player3
      ];
      const uniqueCards = [...new Set(allCards)];
      expect(uniqueCards).toHaveLength(52);
    });
  });
});

describe('Card Utilities', () => {
  describe('getCardValue', () => {
    test('returns correct numeric values', () => {
      expect(getCardValue('2H')).toBe(2);
      expect(getCardValue('5D')).toBe(5);
      expect(getCardValue('10C')).toBe(10);
    });

    test('returns correct face card values', () => {
      expect(getCardValue('JH')).toBe(11);
      expect(getCardValue('QD')).toBe(12);
      expect(getCardValue('KC')).toBe(13);
      expect(getCardValue('AS')).toBe(14);
    });
  });

  describe('getCardSuit', () => {
    test('returns correct suit', () => {
      expect(getCardSuit('2H')).toBe('H');
      expect(getCardSuit('10D')).toBe('D');
      expect(getCardSuit('KC')).toBe('C');
      expect(getCardSuit('AS')).toBe('S');
    });
  });

  describe('sortHand', () => {
    test('sorts by suit then value', () => {
      const hand = ['AH', '2S', 'KD', '3S', 'QC', '5H'];
      const sorted = sortHand(hand);
      expect(sorted).toEqual(['2S', '3S', '5H', 'AH', 'QC', 'KD']);
    });

    test('handles single suit', () => {
      const hand = ['KH', '2H', 'AH', '5H'];
      const sorted = sortHand(hand);
      expect(sorted).toEqual(['2H', '5H', 'KH', 'AH']);
    });
  });
});

describe('Game Play Logic', () => {
  describe('isValidPlay', () => {
    test('first card is always valid', () => {
      const hand = ['2H', '3D', '4S'];
      const result = isValidPlay('2H', hand, null, []);
      expect(result).toBe(true);
    });

    test('must follow suit if possible', () => {
      const hand = ['2H', '3H', '4D', '5S'];
      const currentTrick = [{ position: 0, card: '7H' }];
      
      // Has hearts, must play hearts
      expect(isValidPlay('4D', hand, 'H', currentTrick)).toBe(false);
      expect(isValidPlay('2H', hand, 'H', currentTrick)).toBe(true);
    });

    test('can play any card if cannot follow suit', () => {
      const hand = ['2D', '3D', '4S'];
      const currentTrick = [{ position: 0, card: '7H' }];
      
      // No hearts, can play anything
      expect(isValidPlay('2D', hand, 'H', currentTrick)).toBe(true);
      expect(isValidPlay('4S', hand, 'H', currentTrick)).toBe(true);
    });

    test('rejects cards not in hand', () => {
      const hand = ['2H', '3D'];
      const result = isValidPlay('AS', hand, null, []);
      expect(result).toBe(false);
    });
  });

  describe('determineTrickWinner', () => {
    test('highest card of lead suit wins without trump', () => {
      const trick = [
        { position: 0, card: '5H' },
        { position: 1, card: '9H' },
        { position: 2, card: '3H' },
        { position: 3, card: '7D' }
      ];
      const winner = determineTrickWinner(trick, null, 'H');
      expect(winner).toBe(1); // 9H wins
    });

    test('trump beats lead suit', () => {
      const trick = [
        { position: 0, card: 'AH' },
        { position: 1, card: '2S' },
        { position: 2, card: 'KH' },
        { position: 3, card: 'QH' }
      ];
      const winner = determineTrickWinner(trick, 'S', 'H');
      expect(winner).toBe(1); // 2S trump wins over AH
    });

    test('highest trump wins when multiple trumps', () => {
      const trick = [
        { position: 0, card: '5S' },
        { position: 1, card: '2S' },
        { position: 2, card: 'KS' },
        { position: 3, card: '7H' }
      ];
      const winner = determineTrickWinner(trick, 'S', 'H');
      expect(winner).toBe(2); // KS wins
    });

    test('first card wins if all different suits', () => {
      const trick = [
        { position: 0, card: '5H' },
        { position: 1, card: '2D' },
        { position: 2, card: '3C' },
        { position: 3, card: '7S' }
      ];
      const winner = determineTrickWinner(trick, null, 'H');
      expect(winner).toBe(0); // First card wins
    });
  });
});

describe('Auction Logic', () => {
  describe('getAuctionSuitRank', () => {
    test('returns correct ranking', () => {
      expect(getAuctionSuitRank('C')).toBe(0);
      expect(getAuctionSuitRank('D')).toBe(1);
      expect(getAuctionSuitRank('H')).toBe(2);
      expect(getAuctionSuitRank('S')).toBe(3);
      expect(getAuctionSuitRank('NT')).toBe(4);
    });

    test('returns -1 for invalid suit', () => {
      expect(getAuctionSuitRank('X')).toBe(-1);
    });
  });

  describe('compareAuctionBids', () => {
    test('higher quantity wins', () => {
      const bid1 = { quantity: 8, suit: 'C' };
      const bid2 = { quantity: 7, suit: 'S' };
      expect(compareAuctionBids(bid1, bid2)).toBe(1);
      expect(compareAuctionBids(bid2, bid1)).toBe(-1);
    });

    test('same quantity, higher suit wins', () => {
      const bid1 = { quantity: 7, suit: 'H' };
      const bid2 = { quantity: 7, suit: 'D' };
      expect(compareAuctionBids(bid1, bid2)).toBe(1);
      expect(compareAuctionBids(bid2, bid1)).toBe(-1);
    });

    test('equal bids return 0', () => {
      const bid1 = { quantity: 7, suit: 'S' };
      const bid2 = { quantity: 7, suit: 'S' };
      expect(compareAuctionBids(bid1, bid2)).toBe(0);
    });

    test('no-trump is highest suit', () => {
      const bid1 = { quantity: 7, suit: 'NT' };
      const bid2 = { quantity: 7, suit: 'S' };
      expect(compareAuctionBids(bid1, bid2)).toBe(1);
    });
  });

  describe('isValidAuctionBid', () => {
    test('bid must be within valid range', () => {
      expect(isValidAuctionBid({ quantity: 6, suit: 'H' }, 13, null)).toBe(true);
      expect(isValidAuctionBid({ quantity: 0, suit: 'H' }, 13, null)).toBe(false);
      expect(isValidAuctionBid({ quantity: 14, suit: 'H' }, 13, null)).toBe(false);
    });

    test('bid must be higher than previous bid', () => {
      const highestBid = { quantity: 7, suit: 'D' };
      
      expect(isValidAuctionBid({ quantity: 8, suit: 'C' }, 13, highestBid)).toBe(true);
      expect(isValidAuctionBid({ quantity: 7, suit: 'H' }, 13, highestBid)).toBe(true);
      expect(isValidAuctionBid({ quantity: 7, suit: 'C' }, 13, highestBid)).toBe(false);
      expect(isValidAuctionBid({ quantity: 6, suit: 'S' }, 13, highestBid)).toBe(false);
    });

    test('respects minimum quantity based on cards dealt', () => {
      // With 10 cards dealt: min = 10-8 = 2, max = 10
      expect(isValidAuctionBid({ quantity: 1, suit: 'H' }, 10, null)).toBe(false); // Below minimum
      expect(isValidAuctionBid({ quantity: 2, suit: 'H' }, 10, null)).toBe(true);  // At minimum
      expect(isValidAuctionBid({ quantity: 4, suit: 'H' }, 10, null)).toBe(true);  // Valid bid
      expect(isValidAuctionBid({ quantity: 11, suit: 'H' }, 10, null)).toBe(false); // Above maximum
    });
  });
});

describe('Scoring Logic', () => {
  describe('calculateRoundScore', () => {
    describe('bid = 0', () => {
      test('wins 0 tricks when bidSum < 13 scores 50 points', () => {
        expect(calculateRoundScore(0, 0, 10)).toBe(50);
      });

      test('wins 0 tricks when bidSum >= 13 scores 25 points', () => {
        expect(calculateRoundScore(0, 0, 13)).toBe(25);
        expect(calculateRoundScore(0, 0, 15)).toBe(25);
      });

      test('wins 1 trick when bidSum < 13 scores -50 points', () => {
        expect(calculateRoundScore(0, 1, 10)).toBe(-50);
      });

      test('wins 2 tricks when bidSum < 13 scores -40 points', () => {
        expect(calculateRoundScore(0, 2, 10)).toBe(-40);
      });

      test('wins 3 tricks when bidSum < 13 scores -30 points', () => {
        expect(calculateRoundScore(0, 3, 10)).toBe(-30);
      });

      test('wins 1 trick when bidSum >= 13 scores -25 points', () => {
        expect(calculateRoundScore(0, 1, 13)).toBe(-25);
      });

      test('wins 2 tricks when bidSum >= 13 scores -15 points', () => {
        expect(calculateRoundScore(0, 2, 13)).toBe(-15);
      });

      test('wins 3 tricks when bidSum >= 13 scores -5 points', () => {
        expect(calculateRoundScore(0, 3, 13)).toBe(-5);
      });
    });

    describe('bid > 0 - exact match', () => {
      test('bid 1 and win 1 scores 11 points', () => {
        expect(calculateRoundScore(1, 1, 13)).toBe(11); // 10 + 1²
      });

      test('bid 3 and win 3 scores 19 points', () => {
        expect(calculateRoundScore(3, 3, 13)).toBe(19); // 10 + 3²
      });

      test('bid 5 and win 5 scores 35 points', () => {
        expect(calculateRoundScore(5, 5, 13)).toBe(35); // 10 + 5²
      });

      test('bid 7 and win 7 scores 59 points', () => {
        expect(calculateRoundScore(7, 7, 13)).toBe(59); // 10 + 7²
      });
    });

    describe('bid > 0 - over/under', () => {
      test('bid 3 but win 1 scores -20 points', () => {
        expect(calculateRoundScore(3, 1, 13)).toBe(-20); // -10 * 2
      });

      test('bid 3 but win 5 scores -20 points', () => {
        expect(calculateRoundScore(3, 5, 13)).toBe(-20); // -10 * 2
      });

      test('bid 5 but win 0 scores -50 points', () => {
        expect(calculateRoundScore(5, 0, 13)).toBe(-50); // -10 * 5
      });

      test('bid 2 but win 7 scores -50 points', () => {
        expect(calculateRoundScore(2, 7, 13)).toBe(-50); // -10 * 5
      });
    });
  });
});
