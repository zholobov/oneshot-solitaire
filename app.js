/**
 * Classic Solitaire - Game Logic and UI
 */

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠'
};

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
        this.value = RANKS.indexOf(rank);
    }
}

class Game {
    constructor() {
        this.deck = [];
        this.stock = [];
        this.waste = [];
        this.foundations = { hearts: [], diamonds: [], clubs: [], spades: [] };
        this.tableaus = Array.from({ length: 7 }, () => []);
        this.moves = 0;
        this.timer = 0;
        this.timerInterval = null;
        this.selectedCard = null; // { card: Card, source: string }
    }

    init() {
        this.deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.deck.push(new Card(suit, rank));
            }
        }
        this.shuffle(this.deck);

        this.stock = [];
        this.waste = [];
        this.foundations = { hearts: [], diamonds: [], clubs: [], spades: [] };
        this.tableaus = Array.from({ length: 7 }, () => []);
        this.moves = 0;
        this.timer = 0;
        this.selectedCard = null;

        // Deal tableau
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j <= i; j++) {
                const card = this.deck.pop();
                card.isFaceUp = (j === i);
                this.tableaus[i].push(card);
            }
        }

        // Remainder to stock
        while (this.deck.length > 0) {
            const card = this.deck.pop();
            card.isFaceUp = false;
            this.stock.push(card);
        }
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    drawFromStock() {
        if (this.stock.length === 0) {
            // Recycle waste to stock
            const recycled = this.waste.map(c => ({ ...c, isFaceUp: false }));
            this.stock = recycled;
            this.waste = [];
        } else {
            const card = this.stock.pop();
            card.isFaceUp = true;
            this.waste.push(card);
        }
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timer++;
            this.updateTimerUI();
        }, 1000);
    }

    updateTimerUI() {
        const mins = Math.floor(this.timer / 60).toString().padStart(2, '0');
        const secs = (this.timer % 60).toString().padStart(2, '0');
        document.getElementById('timer').textContent = `${mins}:${secs}`;
    }

    checkWin() {
        return Object.values(this.foundations).every(f => f.length === 13);
    }

    canMoveToTableau(card, tableau) {
        if (tableau.length === 0) {
            return card.rank === 'K';
        }
        const topCard = tableau[tableau.length - 1];
        return (card.color !== topCard.color && card.value === topCard.value - 1);
    }

    canMoveToFoundation(card) {
        const f = this.foundations[card.suit];
        if (f.length === 0) {
            return card.rank === 'A';
        }
        const topCard = f[f.length - 1];
        return card.suit === topCard.suit && card.value === topCard.value + 1;
    }
}

const UI = {
    init(game) {
        this.game = game;
        this.setupEventListeners();
        this.render();
    },

    setupEventListeners() {
        document.getElementById('new-game-btn').addEventListener('click', () => {
            if (confirm("Start a new game?")) {
                this.game.init();
                this.game.startTimer();
                this.render();
            }
        });

        document.getElementById('game-board').addEventListener('click', (e) => {
            const target = e.target.closest('.card-pile, .card');
            if (!target) return;

            if (target.classList.contains('card')) {
                this.handleCardClick(target);
            } else {
                const pileId = target.id;
                this.handlePileClick(pileId);
            }
        });
    },

    handleCardClick(cardEl) {
        if (!cardEl.dataset.cardData) return; 
        const cardData = JSON.parse(cardEl.dataset.cardData);
        const sourcePileId = cardEl.parentElement.id;
        this.processSelection(cardData, sourcePileId);
    },

    handlePileClick(pileId) {
        if (this.game.selectedCard) {
            this.processMove(this.game.selectedCard.card, pileId);
        } else if (pileId === 'stock') {
            this.game.moves++;
            this.game.drawFromStock();
            this.render();
        }
    },

    processSelection(card, sourcePileId) {
        if (this.game.selectedCard && this.game.selectedCard.source === sourcePileId) {
            this.game.selectedCard = null;
        } else {
            this.game.selectedCard = { card, source: sourcePileId };
        }
        this.render();
    },

    processMove(card, targetPileId) {
        const sourcePileId = this.game.selectedCard.source;
        let success = false;

        if (sourcePileId === targetPileId) {
            this.game.selectedCard = null;
            this.render();
            return;
        }

        if (targetPileId.startsWith('f-')) {
            const suit = targetPileId.split('-')[1];
            const foundation = this.game.foundations[suit];
            if (card.suit === suit && (foundation.length === 0 ? card.rank === 'A' : card.value === foundation[foundation.length - 1].value + 1)) {
                this.removeFromSource(card, sourcePileId);
                foundation.push(card);
                success = true;
            }
        } else if (targetPileId.startsWith('t-')) {
            const tableauIdx = parseInt(targetPileId.split('-')[1]) - 1;
            const tableau = this.game.tableaus[tableauIdx];
            if (this.game.canMoveToTableau(card, tableau)) {
                this.removeFromSource(card, sourcePileId);
                tableau.push(card);
                success = true;
            }
        }

        if (success) {
            this.game.moves++;
            if (this.game.checkWin()) {
                alert("Congratulations! You won!");
                this.game.init();
                this.game.startTimer();
            }
        }

        this.game.selectedCard = null;
        this.render();
    },

    removeFromSource(card, sourcePileId) {
        if (sourcePileId === 'waste') {
            this.game.waste.pop();
        } else if (sourcePileId === 'stock') {
            this.game.stock.pop();
        } else if (sourcePileId.startsWith('t-')) {
            const idx = parseInt(sourcePileId.split('-')[1]) - 1;
            this.game.tableaus[idx].pop();
            if (this.game.tableaus[idx].length > 0) {
                this.game.tableaus[idx][this.game.tableaus[idx].length - 1].isFaceUp = true;
            }
        }
    },

    render() {
        this.renderPile('stock', this.game.stock);
        this.renderPile('waste', this.game.waste);
        this.renderFoundation();
        this.renderTableaus();
        document.getElementById('move-count').textContent = `Moves: ${this.game.moves}`;
    },

    renderPile(id, cards) {
        const el = document.getElementById(id);
        el.innerHTML = '';
        if (cards.length === 0) {
            el.classList.add('empty');
        } else {
            el.classList.remove('empty');
            cards.forEach((card, idx) => {
                const isVisible = (id === 'waste' && idx === cards.length - 1) || card.isFaceUp;
                el.appendChild(this.createCardEl(card, isVisible));
            });
        }
    },

    renderFoundation() {
        SUITS.forEach(suit => {
            const el = document.getElementById(`f-${suit}`);
            el.innerHTML = '';
            const cards = this.game.foundations[suit];
            if (cards.length > 0) {
                el.appendChild(this.createCardEl(cards[cards.length - 1], true));
            } else {
                el.classList.add('empty');
            }
        });
    },

    renderTableaus() {
        this.game.tableaus.forEach((tableau, idx) => {
            const el = document.getElementById(`t-${idx + 1}`);
            el.innerHTML = '';
            tableau.forEach((card, cardIdx) => {
                const isFaceUp = card.isFaceUp;
                const cardEl = this.createCardEl(card, isFaceUp);
                if (cardIdx < tableau.length - 1) {
                    cardEl.style.position = 'absolute';
                    cardEl.style.top = `${cardIdx * 25}px`;
                }
                el.appendChild(cardEl);
            });
            el.style.height = `${Math.max(150, tableau.length * 25 + 20)}px`;
        });
    },

    createCardEl(card, isFaceUp) {
        const el = document.createElement('div');
        el.className = `card ${card.color}`;
        if (!isFaceUp) {
            el.classList.add('face-down');
        } else {
            el.dataset.cardData = JSON.stringify({
                suit: card.suit,
                rank: card.rank,
                color: card.color,
                value: card.value
            });
            el.innerHTML = `
                <div class="rank">${card.rank}</div>
                <div class="suit-symbol">${SUIT_SYMBOLS[card.suit]}</div>
            `;
        }
        
        if (this.game.selectedCard && this.game.selectedCard.card === card && this.game.selectedCard.source === el.parentElement.id) {
            el.style.outline = '3px solid yellow';
        }

        return el;
    }
};

// Main initialization
const game = new Game();
UI.init(game);
game.init();
game.startTimer();
UI.render();
