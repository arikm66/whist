const { createTestSetup } = require('./helpers/testSetup');
const {
  testLog,
  getRoomsList,
  joinRoom,
  placeAuctionBid,
  passAuction,
  passAuctionFinal,
  delay
} = require('./helpers/socketHelpers');
const { calculateTrickBid } = require('./helpers/biddingHelper');
const { calculateCardToPlay } = require('./helpers/playingHelper');

// Helper to compare auction bids (C < D < H < S < NT)
function compareAuctionBids(bid1, bid2) {
  const suitRanks = { 'C': 0, 'D': 1, 'H': 2, 'S': 3, 'NT': 4 };
  
  if (bid1.quantity > bid2.quantity) return 1;
  if (bid1.quantity < bid2.quantity) return -1;
  
  const rank1 = suitRanks[bid1.suit];
  const rank2 = suitRanks[bid2.suit];
  
  if (rank1 > rank2) return 1;
  if (rank1 < rank2) return -1;
  return 0;
}

describe('E2E Whist Game', () => {
    testLog(`=================================================`);
    testLog(`=====     Starting E2E Whist Game tests     =====`);
    testLog(`=================================================`);
    
    // Environment variables:
    // - SKIP_ROOM_CLEANUP=1: Keep room after test completion for debugging
    // - FORCE_FRISH=1: Force all players to pass in auction to trigger frish
    
    if (process.env.FORCE_FRISH === '1') {
        testLog(`FORCE_FRISH mode enabled - all players will pass in auction`);
    }
    
    const setup = createTestSetup();
    let dealer;
    const playerHands = [null, null, null, null]; // Store each player's hand
    let currentGame = null; // Store the game state from gameStarted
    let hadFrish = false; // Track if frish occurred (to skip subsequent phases)

    afterAll(async () => {
      const skipCleanup = process.env.SKIP_ROOM_CLEANUP === '1';
      await setup.cleanup(skipCleanup);
    });

    describe('Authentication & Connection', () => {
        test('logs in 4 players', async () => {
          const tokens = await setup.loginAllUsers();
          expect(tokens).toHaveLength(4);
          expect(tokens.every(t => t)).toBe(true);
          testLog(`Successfully logged in 4 test users`);
        });

        test('connects 4 socket clients', async () => {
            const clients = await setup.connectAllClients();
            expect(clients).toHaveLength(4);
            clients.forEach((client) => {
                expect(client.connected).toBe(true);
            });
            testLog('All 4 clients connected');
        });
    });

    describe('Room Creation & Setup', () => {
        test('user1 creates a room and all four players join', async () => {
            // Set up listeners for gameStarted event before creating room
            const gameStartedPromises = [];
            for (let i = 0; i < 4; i++) {
                const promise = new Promise((resolve) => {
                    setup.getClient(i).once('gameStarted', (data) => {
                        // Each player receives filtered game with only their own hand
                        playerHands[i] = data.game.players[i].hand;
                        // Store the game state from player 0
                        if (i === 0) {
                            currentGame = data.game;
                        }
                        testLog(`Player ${i} received hand with ${playerHands[i].length} cards`);
                        resolve();
                    });
                });
                gameStartedPromises.push(promise);
            }

            const roomCode = await setup.createRoomAndJoin();
            expect(roomCode).toBeDefined();
            expect(roomCode).toBeTruthy();

            // Wait for all players to receive their gameStarted event
            await Promise.all(gameStartedPromises);

            // Verify each player received a 13-card hand
            for (let i = 0; i < 4; i++) {
                expect(playerHands[i]).toBeDefined();
                expect(playerHands[i]).toHaveLength(13);
                testLog(`Player ${i} hand: ${playerHands[i].join(', ')}`);
            }
        });

        test('dealer in created room is valid', async () => {
            expect(setup.roomCode).toBeTruthy();
            
            const rooms = await getRoomsList(setup.getClient(0));
            expect(rooms).toBeDefined();
            
            const foundRoom = rooms.find(r => r.roomCode === setup.roomCode);
            expect(foundRoom).toBeDefined();
            
            dealer = foundRoom.dealer;
            expect(dealer).toBeDefined();
            expect(typeof dealer).toBe('number');
            expect(dealer).toBeGreaterThanOrEqual(0);
            expect(dealer).toBeLessThan(4);
            
            testLog(`Dealer for room ${setup.roomCode} is: ${dealer}`);
        });
    });

    describe('Auction Phase', () => {
        test('auction proceeds until complete', async () => {
            // Use the game state from gameStarted event
            expect(currentGame).toBeDefined();
            expect(currentGame.auctionCurrentBidder).toBeDefined();
            
            // Set up each player's AI logic that reacts to events
            const auctionNextBidderHandlers = [];
            
            // Helper function to calculate and place bid or pass
            const processBidTurn = (playerIdx, game) => {
                const client = setup.getClient(playerIdx);
                const user = setup.getUser(playerIdx);
                
                // Force frish if environment variable is set
                if (process.env.FORCE_FRISH === '1') {
                    testLog(`Player ${playerIdx} forced to pass (FORCE_FRISH=1)`);
                    client.emit('passAuction', { roomCode: setup.roomCode, userId: user.userId });
                    return;
                }
                
                // Calculate bids for all trump options
                const trumpOptions = ['H', 'D', 'C', 'S', 'NT'];
                const bidEstimates = trumpOptions.map(trump => {
                    const trumpSuit = trump === 'NT' ? null : trump;
                    const result = calculateTrickBid(playerHands[playerIdx], trumpSuit);
                    return {
                        suit: trump,
                        quantity: result.bid
                    };
                });
                
                // Find the best bid considering both quantity and suit strength
                const bestBid = bidEstimates.reduce((max, current) => 
                    compareAuctionBids(current, max) > 0 ? current : max
                );
                
                const currentHighBid = game.auctionHighestBid;
                const isFirstBidder = !currentHighBid;
                
                // Decide whether to bid or pass (minimum 5 tricks, must beat current high bid)
                const meetsMinimum = bestBid.quantity >= 5;
                const shouldBid = meetsMinimum && (isFirstBidder || compareAuctionBids(bestBid, currentHighBid) > 0);
                
                if (shouldBid) {
                    testLog(`Player ${playerIdx} bids ${bestBid.quantity} tricks with ${bestBid.suit}`);
                    client.emit('placeAuctionBid', { 
                        roomCode: setup.roomCode, 
                        userId: user.userId,
                        quantity: bestBid.quantity,
                        suit: bestBid.suit
                    });
                } else {
                    const highBidStr = currentHighBid ? `${currentHighBid.quantity} ${currentHighBid.suit}` : 'none';
                    testLog(`Player ${playerIdx} decides to pass (best: ${bestBid.quantity} ${bestBid.suit}, current high: ${highBidStr})`);
                    client.emit('passAuction', { roomCode: setup.roomCode, userId: user.userId });
                }
            };
            
            // Set up handlers for each player that call the helper function
            for (let i = 0; i < 4; i++) {
                const handler = (data) => {
                    if (data.game.auctionCurrentBidder === i) {
                        processBidTurn(i, data.game);
                    }
                };
                
                auctionNextBidderHandlers.push(handler);
                setup.getClient(i).on('auctionNextBidder', handler);
            }
            
            // Trigger the first player to start
            testLog(`Starting auction, first bidder: Player ${currentGame.auctionCurrentBidder}`);
            processBidTurn(currentGame.auctionCurrentBidder, currentGame)
            
            // Wait for auction to complete
            const result = await new Promise((resolve) => {
                setup.getClient(0).once('auctionComplete', (data) => {
                    resolve({ type: 'complete', game: data.game });
                });
                setup.getClient(0).once('frishStarted', (data) => {
                    resolve({ type: 'frish', game: data.game });
                });
            });
            
            // Clean up listeners
            for (let i = 0; i < 4; i++) {
                setup.getClient(i).off('auctionNextBidder', auctionNextBidderHandlers[i]);
            }
            
            // Update current game state
            currentGame = result.game;
            
            if (result.type === 'complete') {
                const winningBid = result.game.auctionHighestBid;
                const winner = result.game.auctionWinner;
                testLog(`Auction phase completed: Player ${winner} won auction with ${winningBid.quantity} ${winningBid.suit}`);
            } else {
                testLog(`Auction phase completed: Frish - all players passed`);
            }
            expect(result.type).toBeDefined();
        });
    });

    describe('Bidding Phase', () => {
        test('all players place their bids', async () => {
            // Skip if auction ended in frish or if we had frish
            if (currentGame.status === 'frish' || hadFrish) {
                testLog('Skipping bidding phase - auction ended in frish');
                return;
            }
            
            expect(currentGame.status).toBe('bidding');
            expect(currentGame.currentBidder).toBeDefined();
            
            const nextBidderHandlers = [];
            
            // Helper function to calculate and place bid
            const processBiddingTurn = (playerIdx, game) => {
                // Skip if this player already placed a bid
                if (game.bids[playerIdx] !== null && game.bids[playerIdx] !== undefined) {
                    testLog(`Player ${playerIdx} already placed bid: ${game.bids[playerIdx]}, skipping`);
                    return;
                }
                
                const client = setup.getClient(playerIdx);
                const user = setup.getUser(playerIdx);
                
                // Get trump suit (null for NT)
                const trumpSuit = game.trumpSuit;
                
                // Calculate recommended bid based on hand and trump suit
                const result = calculateTrickBid(playerHands[playerIdx], trumpSuit);
                let myBid = result.bid;
                
                // Check if this is the last bidder and bid would be forbidden
                const tricksAvailable = playerHands[playerIdx].length;
                const currentBidSum = game.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0);
                const lastBidderPos = (game.auctionWinner + 3) % 4;
                
                if (playerIdx === lastBidderPos && currentBidSum + myBid === tricksAvailable) {
                    testLog(`Player ${playerIdx} bid ${myBid} is forbidden (total would be ${tricksAvailable}), using alternative: ${result.alternativeBid}`);
                    myBid = result.alternativeBid;
                }
                
                testLog(`Player ${playerIdx} bids ${myBid} tricks`);
                client.emit('placeBid', {
                    roomCode: setup.roomCode,
                    userId: user.userId,
                    bid: myBid
                });
            };
            
            // Set up handlers for each player
            for (let i = 0; i < 4; i++) {
                const handler = (data) => {
                    if (data.game.currentBidder === i) {
                        processBiddingTurn(i, data.game);
                    }
                };
                
                nextBidderHandlers.push(handler);
                setup.getClient(i).on('nextBidder', handler);
            }
            
            // Trigger the first bidder
            testLog(`Starting bidding phase, first bidder: Player ${currentGame.currentBidder}`);
            processBiddingTurn(currentGame.currentBidder, currentGame);
            
            // Wait for bidding to complete
            const result = await new Promise((resolve) => {
                setup.getClient(0).once('biddingComplete', (data) => {
                    resolve(data.game);
                });
            });
            
            // Clean up listeners
            for (let i = 0; i < 4; i++) {
                setup.getClient(i).off('nextBidder', nextBidderHandlers[i]);
            }
            
            // Update current game state
            currentGame = result;
            
            const bidSum = result.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0);
            const tricksAvailable = playerHands[0].length;
            const roundType = bidSum > tricksAvailable ? 'over-round' : bidSum < tricksAvailable ? 'under-round' : 'exact';
            testLog(`Bidding phase completed. Bids: [${result.bids.join(', ')}], Sum: ${bidSum}/${tricksAvailable} (${roundType})`);
            expect(result.status).toBe('playing');
            expect(result.bids.filter(b => b !== null).length).toBe(4);
        });
    });

    describe('Frish Phase', () => {
        test('handle frish card exchange if auction ended in frish', async () => {
            // Skip if not frish
            if (currentGame.status !== 'frish') {
                testLog('Skipping frish phase - game has normal auction winner');
                return;
            }

            testLog('Starting frish phase - players will exchange 3 cards each');
            expect(currentGame.status).toBe('frish');

            // Helper function to select 3 frish cards for a player
            const selectFrishCards = (playerIdx) => {
                const client = setup.getClient(playerIdx);
                const user = setup.getUser(playerIdx);
                const myHand = playerHands[playerIdx];

                // TODO: Implement smart frish card selection logic
                // For now, just select the first 3 cards
                const selectedCards = myHand.slice(0, 3);
                
                testLog(`Player ${playerIdx} selecting frish cards: ${selectedCards.join(', ')}`);

                // Send each card to server with selectFrishCard event
                selectedCards.forEach((card, index) => {
                    client.emit('selectFrishCard', {
                        roomCode: setup.roomCode,
                        userId: user.userId,
                        card: card
                    });
                    testLog(`Player ${playerIdx} sent frish card ${index + 1}/3: ${card}`);
                });

                // After sending all 3 cards, emit readyForFrish
                client.emit('readyForFrish', {
                    roomCode: setup.roomCode,
                    userId: user.userId
                });
                
                testLog(`Player ${playerIdx} sent readyForFrish`);
            };

            // All players select their 3 frish cards
            for (let i = 0; i < 4; i++) {
                selectFrishCards(i);
            }

            // Wait for server to exchange cards and emit auctionRestarted
            const result = await new Promise((resolve) => {
                setup.getClient(0).once('auctionRestarted', (data) => {
                    resolve(data.game);
                });
            });

            // Update current game state
            currentGame = result;

            testLog('Frish phase completed - auction restarted');
            testLog(`New hands after frish exchange: P0=${currentGame.players[0].hand.length}, P1=${currentGame.players[1].hand.length}, P2=${currentGame.players[2].hand.length}, P3=${currentGame.players[3].hand.length}`);

            // Update playerHands arrays with new hands from server
            for (let i = 0; i < 4; i++) {
                playerHands[i] = currentGame.players[i].hand;
            }

            // Verify status is back to auction
            expect(currentGame.status).toBe('auction');
            expect(currentGame.auctionCurrentBidder).toBeDefined();
            
            // Mark that frish occurred (subsequent tests should skip)
            hadFrish = true;
            testLog('Note: After frish, test suite ends. Second auction/bidding/playing not implemented yet.');
        });
    });

    describe('Playing Phase', () => {
        test('all players play their cards through all tricks', async () => {
            // Skip if frish or had frish
            if (currentGame.status === 'frish' || hadFrish) {
                testLog('Skipping normal playing phase - game ended in frish');
                return;
            }

            expect(currentGame.status).toBe('playing');
            expect(currentGame.currentTurn).toBeDefined();
            
            const totalTricks = playerHands[0].length;
            testLog(`Starting playing phase: ${totalTricks} tricks to play, trump: ${currentGame.trumpSuit || 'NT'}`);
            testLog(`Bids: [${currentGame.bids.join(', ')}]`);
            
            const nextPlayerHandlers = [];
            const nextTrickHandlers = [];
            let tricksCompleted = 0;
            
            // Track tricks won by each player
            const tricksWon = [0, 0, 0, 0];
            
            // Track all cards played in completed tricks for advanced strategy
            const cardsPlayedThisRound = [];
            
            // Helper to convert string card ("4S") to object {rank: "4", suit: "S"}
            const parseCard = (cardStr) => {
                return {
                    rank: cardStr.slice(0, -1),
                    suit: cardStr.slice(-1)
                };
            };
            
            // Helper to convert object card to string
            const cardToString = (card) => `${card.rank}${card.suit}`;
            
            // Set up single trickComplete handler (not per player, as all receive same event)
            setup.getClient(0).on('trickComplete', (data) => {
                tricksCompleted++;
                const winner = data.winner;
                tricksWon[winner]++;
                
                // Track cards from completed trick
                if (data.trick && Array.isArray(data.trick)) {
                    data.trick.forEach(tc => {
                        cardsPlayedThisRound.push(parseCard(tc.card));
                    });
                }
                
                testLog(`Trick ${tricksCompleted}/${totalTricks} won by Player ${winner} (now has ${tricksWon[winner]} tricks)`);
            });
            
            // Helper function to play a card
            const processPlayTurn = (playerIdx, game) => {
                const client = setup.getClient(playerIdx);
                const user = setup.getUser(playerIdx);
                
                // Get current state
                const myHandStrings = playerHands[playerIdx];
                const myBid = game.bids[playerIdx];
                const myTricksWon = tricksWon[playerIdx];
                const currentTrick = game.currentTrick || [];
                
                if (myHandStrings.length === 0) {
                    testLog(`Player ${playerIdx} has no cards left`);
                    return;
                }
                
                // Convert string cards to objects for the helper
                const myHandObjects = myHandStrings.map(parseCard);
                const currentTrickObjects = currentTrick.map(tc => parseCard(tc.card));
                
                // Calculate which card to play using advanced strategy
                const result = calculateCardToPlay(
                    myHandObjects,
                    currentTrickObjects,
                    game.trumpSuit,
                    myBid,
                    myTricksWon,
                    game.bids,
                    cardsPlayedThisRound
                );
                
                const cardToPlay = result.card;
                const cardString = cardToString(cardToPlay);
                testLog(`Player ${playerIdx} plays ${cardString} - ${result.reasoning}`);
                
                // Remove card from hand (as string)
                const cardIndex = myHandStrings.indexOf(cardString);
                if (cardIndex !== -1) {
                    myHandStrings.splice(cardIndex, 1);
                }
                
                // Play the card (server expects string format)
                client.emit('playCard', {
                    roomCode: setup.roomCode,
                    userId: user.userId,
                    card: cardString
                });
            };
            
            // Set up handlers for each player
            for (let i = 0; i < 4; i++) {
                const cardPlayedHandler = (data) => {
                    if (data.game.currentTurn === i) {
                        processPlayTurn(i, data.game);
                    }
                };
                
                const nextTrickHandler = (data) => {
                    if (data.game.currentTurn === i) {
                        processPlayTurn(i, data.game);
                    }
                };
                
                nextPlayerHandlers.push(cardPlayedHandler);
                nextTrickHandlers.push(nextTrickHandler);
                
                setup.getClient(i).on('cardPlayed', cardPlayedHandler);
                setup.getClient(i).on('nextTrick', nextTrickHandler);
            }
            
            // Start the first play
            testLog(`First player: Player ${currentGame.currentTurn}`);
            processPlayTurn(currentGame.currentTurn, currentGame);
            
            // Wait for round to complete
            const result = await new Promise((resolve) => {
                setup.getClient(0).once('roundEnded', (data) => {
                    resolve(data.game);
                });
            });
            
            // Clean up listeners
            setup.getClient(0).off('trickComplete'); // Remove single trickComplete handler
            for (let i = 0; i < 4; i++) {
                setup.getClient(i).off('cardPlayed', nextPlayerHandlers[i]);
                setup.getClient(i).off('nextTrick', nextTrickHandlers[i]);
            }
            
            // Update current game state
            currentGame = result;
            
            testLog(`Playing phase completed. Tricks won: [${tricksWon.join(', ')}]`);
            testLog(`Scores: [${result.scores.map(s => s.score).join(', ')}]`);
            
            // Verify all tricks were played
            expect(tricksCompleted).toBe(totalTricks);
            expect(tricksWon.reduce((a, b) => a + b, 0)).toBe(totalTricks);
            
            // Verify hands are empty
            for (let i = 0; i < 4; i++) {
                expect(playerHands[i].length).toBe(0);
            }
        }, 60000); // 60 second timeout for 13 tricks with 3s delays
    });

    // TODO: Add more describe blocks as tests are added
    // describe('Scoring & Round Completion', () => { ... });
});