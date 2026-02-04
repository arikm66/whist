/**
 * Test script to calibrate bidding algorithm
 * Simulates 50 rounds and calculates average sum of 4 player bids
 */

const { calculateTrickBid } = require('./biddingHelper');

// All possible cards
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Generate a full deck of 52 cards
 */
function createDeck() {
  const deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      deck.push(rank + suit);
    });
  });
  return deck;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal 13 cards to 4 players
 */
function dealHands() {
  const deck = shuffle(createDeck());
  return [
    deck.slice(0, 13),
    deck.slice(13, 26),
    deck.slice(26, 39),
    deck.slice(39, 52)
  ];
}

/**
 * Simulate one round and return sum of bids
 */
function simulateRound(trumpSuit) {
  const hands = dealHands();
  const bids = hands.map(hand => calculateTrickBid(hand, trumpSuit).bid);
  const sum = bids.reduce((a, b) => a + b, 0);
  return { sum, bids, hands };
}

/**
 * Run simulation
 */
function runSimulation(rounds = 50) {
  const separator = '='.repeat(60);
  const line = '-'.repeat(40);
  
  console.log('');
  console.log(separator);
  console.log('BIDDING ALGORITHM CALIBRATION TEST');
  console.log(separator);
  console.log('');
  
  const trumpSuits = ['S', 'H', 'D', 'C', null]; // Include No Trump
  const results = {};
  
  trumpSuits.forEach(trump => {
    const trumpName = trump || 'No Trump';
    console.log('');
    console.log('Testing with Trump: ' + trumpName);
    console.log(line);
    
    const sums = [];
    let totalBids = 0;
    let totalSum = 0;
    
    for (let i = 0; i < rounds; i++) {
      const { sum, bids } = simulateRound(trump);
      sums.push(sum);
      totalBids += bids.length;
      totalSum += sum;
    }
    
    const average = totalSum / rounds;
    const min = Math.min(...sums);
    const max = Math.max(...sums);
    const median = sums.sort((a, b) => a - b)[Math.floor(rounds / 2)];
    
    results[trumpName] = {
      average,
      min,
      max,
      median,
      target: 13
    };
    
    console.log('  Rounds Simulated: ' + rounds);
    console.log('  Average Sum: ' + average.toFixed(2) + ' tricks');
    console.log('  Median Sum:  ' + median + ' tricks');
    console.log('  Min Sum:     ' + min + ' tricks');
    console.log('  Max Sum:     ' + max + ' tricks');
    console.log('  Target Sum:  13 tricks');
    const diff = (average - 13).toFixed(2);
    const diffPercent = ((average - 13) / 13 * 100).toFixed(1);
    console.log('  Difference:  ' + diff + ' tricks (' + diffPercent + '%)');
  });
  
  // Overall statistics
  console.log('');
  console.log(separator);
  console.log('OVERALL SUMMARY');
  console.log(separator);
  console.log('');
  
  const allAverages = Object.values(results).map(r => r.average);
  const overallAverage = allAverages.reduce((a, b) => a + b, 0) / allAverages.length;
  
  // Separate averages for Trump vs No Trump
  const trumpAverages = [results['S'].average, results['H'].average, results['D'].average, results['C'].average];
  const trumpAverage = trumpAverages.reduce((a, b) => a + b, 0) / trumpAverages.length;
  const noTrumpAverage = results['No Trump'].average;
  
  console.log('With Trump Average: ' + trumpAverage.toFixed(2) + ' tricks (Target: 13)');
  const trumpDiff = (trumpAverage - 13).toFixed(2);
  const trumpDiffPercent = ((trumpAverage - 13) / 13 * 100).toFixed(1);
  console.log('  Difference: ' + trumpDiff + ' tricks (' + trumpDiffPercent + '%)');
  
  console.log('');
  console.log('No Trump Average: ' + noTrumpAverage.toFixed(2) + ' tricks (Target: 13)');
  const noTrumpDiff = (noTrumpAverage - 13).toFixed(2);
  const noTrumpDiffPercent = ((noTrumpAverage - 13) / 13 * 100).toFixed(1);
  console.log('  Difference: ' + noTrumpDiff + ' tricks (' + noTrumpDiffPercent + '%)');
  
  console.log('');
  console.log('Overall Average across all scenarios: ' + overallAverage.toFixed(2) + ' tricks');
  console.log('Target: 13 tricks');
  const overallDiff = (overallAverage - 13).toFixed(2);
  const overallDiffPercent = ((overallAverage - 13) / 13 * 100).toFixed(1);
  console.log('Difference: ' + overallDiff + ' tricks (' + overallDiffPercent + '%)');

  
  if (Math.abs(overallAverage - 13) < 1) {
    console.log('');
    console.log('✓ Algorithm is well-calibrated (within 1 trick of target)');
  } else if (overallAverage < 13) {
    const below = (13 - overallAverage).toFixed(2);
    console.log('');
    console.log('⚠ Algorithm is conservative (bidding ' + below + ' tricks below target)');
    console.log('  Consider increasing card values or reducing safety factor');
  } else {
    const above = (overallAverage - 13).toFixed(2);
    console.log('');
    console.log('⚠ Algorithm is aggressive (bidding ' + above + ' tricks above target)');
    console.log('  Consider decreasing card values or increasing safety factor');
  }
  
  // Sample hands for reference
  console.log('');
  console.log(separator);
  console.log('SAMPLE ROUND ANALYSIS');
  console.log(separator);
  console.log('');
  
  const { sum, bids, hands } = simulateRound('S'); // Spades as trump
  console.log('Trump: Spades');
  console.log('');
  
  hands.forEach((hand, idx) => {
    const { bid, reasoning } = calculateTrickBid(hand, 'S');
    console.log('Player ' + (idx + 1) + ':');
    console.log('  Hand: ' + hand.join(', '));
    console.log('  Bid:  ' + bid + ' tricks');
    console.log('  Reasoning: ' + reasoning);
    console.log('');
  });
  
  console.log('Total Bids: ' + sum + ' (Target: 13)');
  console.log('');
}

// Run the simulation
runSimulation(100);
