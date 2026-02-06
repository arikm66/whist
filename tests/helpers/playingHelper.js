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
function calculateCardToPlay(hand, trickCards, trumpSuit, myBid, myTricksWon) {
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

module.exports = {
    calculateCardToPlay
};
