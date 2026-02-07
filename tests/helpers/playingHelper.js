/**
 * KISS (Keep It Simple, Stupid) card playing strategy for testing
 * Simple rule: Need tricks → play high, Don't need → play low
 */

/**
 * Calculate which card to play using simplified strategy
 * @param {Array} hand - Player's current hand
 * @param {Array} trickCards - Cards already played in current trick
 * @param {string|null} trumpSuit - Trump suit for the round
 * @param {number} myBid - Player's bid
 * @param {number} myTricksWon - Tricks player has won so far
 * @returns {Object} - {card: Card, reasoning: string}
 */
function calculateCardToPlayKiss(hand, trickCards, trumpSuit, myBid, myTricksWon) {
    if (!hand || hand.length === 0) {
        throw new Error('Hand is empty');
    }

    const needTricks = (myBid - myTricksWon) > 0;
    let legalCards = hand;

    // Rule 1: Must follow suit if possible
    if (trickCards.length > 0) {
        const ledSuit = trickCards[0].suit;
        const cardsInSuit = hand.filter(card => card.suit === ledSuit);
        
        if (cardsInSuit.length > 0) {
            legalCards = cardsInSuit;
        }
    }

    // Rule 2: Play high if need tricks, low if don't
    const sortedCards = [...legalCards].sort((a, b) => {
        return needTricks ? b.rank - a.rank : a.rank - b.rank;
    });

    const chosenCard = sortedCards[0];
    
    // Rule 3: If can't follow suit and need tricks, prefer trump
    if (trickCards.length > 0 && legalCards.length === hand.length) {
        // Couldn't follow suit
        if (needTricks && trumpSuit) {
            const trumpCards = hand.filter(card => card.suit === trumpSuit);
            if (trumpCards.length > 0) {
                const lowestTrump = trumpCards.sort((a, b) => a.rank - b.rank)[0];
                return {
                    card: lowestTrump,
                    reasoning: `Need ${myBid - myTricksWon} more trick(s), playing lowest trump`
                };
            }
        }
    }

    const action = needTricks ? 'highest' : 'lowest';
    const status = needTricks ? `need ${myBid - myTricksWon} more` : 'bid met';
    
    return {
        card: chosenCard,
        reasoning: `Playing ${action} legal card (${status})`
    };
}

/**
 * Advanced card playing strategy with memory and tactical analysis
 * @param {Array} hand - Player's current hand
 * @param {Array} trickCards - Cards already played in current trick
 * @param {string|null} trumpSuit - Trump suit for the round
 * @param {number} myBid - Player's bid
 * @param {number} myTricksWon - Tricks player has won so far
 * @param {Array} allBids - All 4 players' bids [p0, p1, p2, p3]
 * @param {Array} cardsPlayedThisRound - All cards played in completed tricks
 * @returns {Object} - {card: Card, reasoning: string}
 */
function calculateCardToPlay(hand, trickCards, trumpSuit, myBid, myTricksWon, allBids, cardsPlayedThisRound) {
    if (!hand || hand.length === 0) {
        throw new Error('Hand is empty');
    }

    // Helper: Convert card rank to numeric value
    const getRankValue = (rank) => {
        const values = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
        return values[rank.toString()] || parseInt(rank);
    };

    // Analyze cards played by suit
    const playedBySuit = {
        H: cardsPlayedThisRound.filter(c => c.suit === 'H'),
        D: cardsPlayedThisRound.filter(c => c.suit === 'D'),
        C: cardsPlayedThisRound.filter(c => c.suit === 'C'),
        S: cardsPlayedThisRound.filter(c => c.suit === 'S')
    };

    // Helper: Check if card has been played (in completed tricks OR current trick)
    const isCardGone = (rank, suit) => {
        const inCompletedTricks = playedBySuit[suit]?.some(c => getRankValue(c.rank) === getRankValue(rank));
        const inCurrentTrick = trickCards.some(tc => tc.suit === suit && getRankValue(tc.rank) === getRankValue(rank));
        return inCompletedTricks || inCurrentTrick;
    };

    // Helper: Get highest remaining rank in suit (considering all cards in deck)
    const highestRemainingInSuit = (suit) => {
        const allRanks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
        for (let rank of allRanks) {
            if (!isCardGone(rank, suit)) {
                return getRankValue(rank);
            }
        }
        return 0;
    };

    // Helper: Check if my card is the highest remaining in its suit
    const isMyCardHigh = (card) => {
        const myRank = getRankValue(card.rank);
        const highestRemaining = highestRemainingInSuit(card.suit);
        return myRank >= highestRemaining;
    };

    // Helper: Determine current winning card in trick
    const getCurrentWinningCard = (trick, trump) => {
        if (trick.length === 0) return null;
        
        const leadSuit = trick[0].suit;
        let winner = trick[0];
        
        for (let card of trick) {
            const winnerIsTrump = winner.suit === trump;
            const cardIsTrump = card.suit === trump;
            
            if (cardIsTrump && !winnerIsTrump) {
                winner = card;
            } else if (cardIsTrump && winnerIsTrump) {
                if (getRankValue(card.rank) > getRankValue(winner.rank)) {
                    winner = card;
                }
            } else if (!cardIsTrump && !winnerIsTrump && card.suit === leadSuit) {
                if (getRankValue(card.rank) > getRankValue(winner.rank)) {
                    winner = card;
                }
            }
        }
        return winner;
    };

    // Context Analysis
    const totalBids = allBids.reduce((sum, b) => sum + b, 0);
    const tricksCompletedThisRound = Math.floor(cardsPlayedThisRound.length / 4);
    const totalTricksInRound = hand.length + tricksCompletedThisRound;
    const roundType = totalBids > totalTricksInRound ? 'over' : totalBids < totalTricksInRound ? 'under' : 'exact';
    
    const myDeficit = myBid - myTricksWon;
    const needsTricks = myDeficit > 0;
    const hasMetBid = myDeficit <= 0;
    const tricksRemaining = hand.length;
    
    const position = trickCards.length; // 0=leading, 1-2=middle, 3=last
    const isLeading = position === 0;
    const isLast = position === 3;

    // Determine legal cards (must follow suit)
    let legalCards = hand;
    let canFollowSuit = true;
    
    if (!isLeading) {
        const ledSuit = trickCards[0].suit;
        const cardsInSuit = hand.filter(c => c.suit === ledSuit);
        if (cardsInSuit.length > 0) {
            legalCards = cardsInSuit;
        } else {
            canFollowSuit = false;
        }
    }

    // Find guaranteed winners (highest remaining cards I hold)
    const guaranteedWinners = hand.filter(c => isMyCardHigh(c));

    // CRITICAL RULE 1: Strict bid-met mode in over-rounds - ALWAYS play lowest
    if (hasMetBid && roundType === 'over') {
        const sorted = [...legalCards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
        return { card: sorted[0], reasoning: `Bid met in over-round - playing lowest to avoid extra tricks` };
    }

    // CRITICAL RULE 2: Desperation mode - MUST win every remaining trick
    const inDesperationMode = needsTricks && myDeficit === tricksRemaining;
    if (inDesperationMode && !isLeading) {
        const currentWinner = getCurrentWinningCard(trickCards, trumpSuit);
        const winningRank = getRankValue(currentWinner.rank);
        
        if (canFollowSuit) {
            const beatingCards = legalCards.filter(c => {
                const isTrump = c.suit === trumpSuit;
                const winnerIsTrump = currentWinner.suit === trumpSuit;
                
                if (isTrump && !winnerIsTrump) return true;
                if (isTrump && winnerIsTrump) return getRankValue(c.rank) > winningRank;
                if (!isTrump && !winnerIsTrump) return getRankValue(c.rank) > winningRank;
                return false;
            });
            
            if (beatingCards.length > 0) {
                const best = beatingCards.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank))[0];
                return { card: best, reasoning: `Desperation: MUST win (need ${myDeficit} with ${tricksRemaining} left)` };
            }
        }
        
        // Can't follow suit - try trump
        if (trumpSuit && !canFollowSuit) {
            const trumpCards = hand.filter(c => c.suit === trumpSuit);
            if (trumpCards.length > 0) {
                const winnerIsTrump = currentWinner.suit === trumpSuit;
                if (winnerIsTrump) {
                    const higherTrumps = trumpCards.filter(c => getRankValue(c.rank) > winningRank);
                    if (higherTrumps.length > 0) {
                        const best = higherTrumps.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank))[0];
                        return { card: best, reasoning: `Desperation: over-trumping to survive` };
                    }
                } else {
                    const best = trumpCards.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank))[0];
                    return { card: best, reasoning: `Desperation: trumping to survive` };
                }
            }
        }
    }

    // CRITICAL RULE 3: Conservative mode - one trick away from bid
    const oneAway = needsTricks && myDeficit === 1;
    if (oneAway && !isLeading && roundType === 'over') {
        const currentWinner = getCurrentWinningCard(trickCards, trumpSuit);
        const winningRank = getRankValue(currentWinner.rank);
        
        if (canFollowSuit) {
            const beatingCards = legalCards.filter(c => {
                const isTrump = c.suit === trumpSuit;
                const winnerIsTrump = currentWinner.suit === trumpSuit;
                
                if (isTrump && !winnerIsTrump) return true;
                if (isTrump && winnerIsTrump) return getRankValue(c.rank) > winningRank;
                if (!isTrump && !winnerIsTrump) return getRankValue(c.rank) > winningRank;
                return false;
            });
            
            // Only take trick if we can win with lowest beater
            if (beatingCards.length > 0 && isLast) {
                const best = beatingCards.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
                return { card: best, reasoning: `Conservative: taking last trick to meet bid` };
            }
            
            // Don't risk it in middle positions
            if (beatingCards.length > 0 && !isLast) {
                const sorted = [...legalCards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
                return { card: sorted[0], reasoning: `Conservative: saving last trick for better position` };
            }
        }
    }

    // Leading Strategy
    if (isLeading) {
        if (needsTricks && guaranteedWinners.length > 0) {
            // Play highest winner to secure trick
            const best = guaranteedWinners.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank))[0];
            return { card: best, reasoning: `Leading guaranteed winner (need ${myDeficit} more)` };
        }
        
        // Removed sabotage logic - just play low when bid is met
        if (!needsTricks) {
            // Don't need tricks - play low
            const sorted = [...hand].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
            return { card: sorted[0], reasoning: `Leading low card (bid met)` };
        }
        
        // Play highest card to fight for trick
        const sorted = [...hand].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
        return { card: sorted[0], reasoning: `Leading high card (need ${myDeficit} more)` };
    }

    // Middle/Last Position Strategy
    const currentWinner = getCurrentWinningCard(trickCards, trumpSuit);
    const winningRank = getRankValue(currentWinner.rank);
    
    if (canFollowSuit) {
        // Can follow suit
        const beatingCards = legalCards.filter(c => {
            const isTrump = c.suit === trumpSuit;
            const winnerIsTrump = currentWinner.suit === trumpSuit;
            
            if (isTrump && !winnerIsTrump) return true;
            if (isTrump && winnerIsTrump) return getRankValue(c.rank) > winningRank;
            if (!isTrump && !winnerIsTrump) return getRankValue(c.rank) > winningRank;
            return false;
        });

        if (needsTricks && beatingCards.length > 0) {
            // Play lowest card that wins
            const best = beatingCards.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
            return { card: best, reasoning: `Winning efficiently (need ${myDeficit} more)` };
        }
        
        if (needsTricks && beatingCards.length === 0) {
            // Can't win - play low to save high cards for later
            const sorted = [...legalCards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
            return { card: sorted[0], reasoning: `Can't win, playing low to preserve high cards` };
        }
        
        // Don't need trick - play low
        const sorted = [...legalCards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
        return { card: sorted[0], reasoning: `Avoiding trick (bid met)` };
    }

    // Can't follow suit - Trump or discard strategy
    if (trumpSuit) {
        const trumpCards = hand.filter(c => c.suit === trumpSuit);
        
        if (trumpCards.length > 0 && needsTricks) {
            // Check if current winner is trump
            const winnerIsTrump = currentWinner.suit === trumpSuit;
            
            if (winnerIsTrump) {
                // Need higher trump to win
                const higherTrumps = trumpCards.filter(c => getRankValue(c.rank) > winningRank);
                if (higherTrumps.length > 0) {
                    const best = higherTrumps.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
                    return { card: best, reasoning: `Over-trumping (need ${myDeficit} more)` };
                }
            } else {
                // Can win with any trump
                const best = trumpCards.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
                return { card: best, reasoning: `Trumping (need ${myDeficit} more)` };
            }
        }
        
        // Removed trump sabotage logic
    }
    
    // Discard lowest card
    const sorted = [...hand].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
    const discard = sorted[0];
    return { card: discard, reasoning: needsTricks ? `Discarding (can't win)` : `Discarding safely (bid met)` };
}

module.exports = {
    calculateCardToPlayKiss,
    calculateCardToPlay
};
