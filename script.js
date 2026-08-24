// Solitaire Game Logic

const suits = ['♥', '♦', '♣', '♠'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const rankValues = { 'A':1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13 };

let stock = [];
let waste = [];
let foundations = [[],[],[],[]]; // 0-3
let tableau = [[],[],[],[],[],[],[]]; // 7 columns

let score = 0;
let selectedCards = []; // array of card objects
let selectedSource = null; // {type: 'waste'|'tableau', index: colIndex, startIndex: undefined for waste}
let isDragging = false; // not used for click

// Card object representation
function Card(suit, rank, faceUp = false) {
    return { suit, rank, faceUp };
}

// Initialize game
function initGame() {
    // create deck
    const deck = [];
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push(Card(suit, rank, false));
        }
    }
    // shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // deal tableau
    for (let col = 0; col < 7; col++) {
        for (let row = 0; row <= col; row++) {
            const card = deck.pop();
            // only top card of column is face up
            card.faceUp = (row === col);
            tableau[col].push(card);
        }
    }
    // remaining cards go to stock (face down)
    stock = deck.map(c => { c.faceUp = false; return c; });
    waste = [];
    foundations = [[],[],[],[]];
    score = 0;
    selectedCards = [];
    selectedSource = null;
    render();
}

// Render UI
function render() {
    // stock
    const stockEl = document.getElementById('stock');
    stockEl.innerHTML = '';
    if (stock.length === 0) {
        stockEl.classList.add('empty');
        stockEl.innerHTML = '∅';
    } else {
        stockEl.classList.remove('empty');
        stockEl.innerHTML = ''; // back of card shown via CSS
    }
    // waste
    const wasteEl = document.getElementById('waste');
    wasteEl.innerHTML = '';
    if (waste.length > 0) {
        // show top 3 cards? We'll show all waste spread out? Simpler: show only top card
        const topCard = waste[waste.length - 1];
        const cardEl = createCardElement(topCard, true);
        wasteEl.appendChild(cardEl);
    }
    // foundations
    const foundationsEl = document.getElementById('foundations');
    foundationsEl.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const foundationEl = document.createElement('div');
        foundationEl.className = 'foundation';
        foundationEl.dataset.foundationIndex = i;
        if (foundations[i].length > 0) {
            const topCard = foundations[i][foundations[i].length - 1];
            const cardEl = createCardElement(topCard, true);
            foundationEl.appendChild(cardEl);
        }
        foundationsEl.appendChild(foundationEl);
    }
    // tableau
    const tableauEl = document.getElementById('tableau');
    tableauEl.innerHTML = '';
    for (let col = 0; col < 7; col++) {
        const columnEl = document.createElement('div');
        columnEl.className = 'tableau-column';
        columnEl.dataset.colIndex = col;
        for (let row = 0; row < tableau[col].length; row++) {
            const card = tableau[col][row];
            const cardEl = createCardElement(card, false);
            // position stack
            const stackEl = document.createElement('div');
            stackEl.className = 'card-stack';
            stackEl.style.top = (row * 20) + 'px'; // offset each card
            stackEl.appendChild(cardEl);
            columnEl.appendChild(stackEl);
        }
        tableauEl.appendChild(columnEl);
    }
    // score
    document.getElementById('score').textContent = `Score: ${score}`;
}

// Create card element
function createCardElement(card, isFaceUp) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.faceUp && isFaceUp ? 'face-up' : 'back'} ${getCardColor(card.suit) === 'red' ? 'red' : 'black'}`;
    cardEl.dataset.suit = card.suit;
    cardEl.dataset.rank = card.rank;
    // rank and suit
    const rankDiv = document.createElement('div');
    rankDiv.className = 'rank';
    rankDiv.textContent = card.rank;
    const suitDiv = document.createElement('div');
    suitDiv.className = 'suit';
    suitDiv.textContent = card.suit;
    cardEl.appendChild(rankDiv);
    cardEl.appendChild(suitDiv);
    return cardEl;
}

// Get card color
function getCardColor(suit) {
    return suit === '♥' || suit === '♦' ? 'red' : 'black';
}

// Event listeners
document.getElementById('stock').addEventListener('click', handleStockClick);
document.getElementById('waste').addEventListener('click', handleWasteClick);
document.getElementById('foundations').addEventListener('click', handleFoundationClick);
document.getElementById('tableau').addEventListener('click', handleTableauClick);
document.getElementById('restart-btn').addEventListener('click', initGame);

function handleStockClick() {
    if (stock.length === 0) {
        // recycle waste back to stock
        if (waste.length > 0) {
            // move waste back to stock (face down)
            while (waste.length) {
                const card = waste.pop();
                card.faceUp = false;
                stock.push(card);
            }
            render();
        }
        return;
    }
    // draw 3 cards (or less) from stock to waste
    const drawCount = Math.min(3, stock.length);
    for (let i = 0; i < drawCount; i++) {
        const card = stock.pop();
        card.faceUp = true;
        waste.push(card);
    }
    render();
}

function handleWasteClick(e) {
    // clicking waste selects the top card (or pile? we only allow moving top card)
    if (waste.length === 0) return;
    const topCardIndex = waste.length - 1;
    selectCards('waste', topCardIndex, 1); // only top card
}

function handleFoundationClick(e) {
    const foundationEl = e.target.closest('.foundation');
    if (!foundationEl) return;
    const foundationIndex = parseInt(foundationEl.dataset.foundationIndex);
    attemptMoveToFoundation(foundationIndex);
}

function handleTableauClick(e) {
    const columnEl = e.target.closest('.tableau-column');
    if (!columnEl) return;
    const colIndex = parseInt(columnEl.dataset.colIndex);
    // find which card was clicked (based on offset Y?)
    // Simpler: clicking anywhere in column selects the topmost face-up card and any face-up cards above it in sequence
    const column = tableau[colIndex];
    // iterate from bottom to top to find topmost face-up card
    let startIdx = -1;
    for (let i = column.length - 1; i >= 0; i--) {
        if (column[i].faceUp) {
            startIdx = i;
            break;
        }
    }
    if (startIdx === -1) return; // no face-up cards
    // now collect consecutive face-up cards from startIdx upwards that are in descending order and alternating colors
    const selected = [];
    for (let i = startIdx; i < column.length; i++) {
        const card = column[i];
        if (!card.faceUp) break;
        if (selected.length === 0) {
            selected.push(card);
        } else {
            const prev = selected[selected.length - 1];
            // check if card is one rank lower and opposite color
            if (rankValues[card.rank] === rankValues[prev.rank] - 1 &&
                getCardColor(card.suit) !== getCardColor(prev.suit)) {
                selected.push(card);
            } else {
                break;
            }
        }
    }
    if (selected.length === 0) return;
    selectCards('tableau', colIndex, startIdx, selected.length);
}

// Select cards for moving
function selectCards(sourceType, pileIndex, startIndex, count = 1) {
    // deselect previous
    selectedCards = [];
    selectedSource = null;
    // remove highlighting
    document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
    // collect cards
    let cards;
    if (sourceType === 'waste') {
        cards = [waste[waste.length - 1]];
        selectedSource = {type: 'waste', index: pileIndex};
    } else if (sourceType === 'tableau') {
        const column = tableau[pileIndex];
        cards = column.slice(startIndex, startIndex + count);
        selectedSource = {type: 'tableau', index: pileIndex, startIndex};
    }
    selectedCards = cards;
    // highlight selected cards in UI (we'll need to find elements)
    // For simplicity, we can add a class to the card elements via re-render with a flag? We'll do a simple approach: after rendering, we can add class.
    // We'll just render and then add selected class to those elements.
    render();
    // highlight
    if (sourceType === 'waste') {
        const wasteEl = document.getElementById('waste');
        const cardEls = wasteEl.querySelectorAll('.card');
        if (cardEls.length > 0) {
            cardEls[cardEls.length - 1].classList.add('selected');
        }
    } else if (sourceType === 'tableau') {
        const columnEl = document.querySelector(`.tableau-column[data-col-index="${pileIndex}"]`);
        const stackEls = columnEl.querySelectorAll('.card-stack');
        for (let i = 0; i < selectedCards.length; i++) {
            const stackEl = stackEls[startIndex + i];
            const cardEl = stackEl.querySelector('.card');
            cardEl.classList.add('selected');
        }
    }
}

// Attempt to move selected cards to a foundation
function attemptMoveToFoundation(foundationIndex) {
    if (selectedCards.length === 0) return false;
    const card = selectedCards[0]; // only single card moves to foundation
    const topFoundation = foundations[foundationIndex];
    let canMove = false;
    if (topFoundation.length === 0) {
        // empty foundation accepts Ace
        canMove = (card.rank === 'A');
    } else {
        const topCard = topFoundation[topFoundation.length - 1];
        canMove = (card.suit === topCard.suit &&
                   rankValues[card.rank] === rankValues[topCard.rank] + 1);
    }
    if (canMove) {
        // remove card from source
        removeCardFromSource(card);
        // add to foundation
        foundations[foundationIndex].push(card);
        // update score
        score += 10;
        // clear selection
        selectedCards = [];
        selectedSource = null;
        render();
        return true;
    }
    return false;
}

// Attempt to move selected cards to tableau column
function attemptMoveToTableau(colIndex) {
    if (selectedCards.length === 0) return false;
    const column = tableau[colIndex];
    // determine if move is valid
    // For moving multiple cards, they must be in descending order alternating colors already (ensured by selection)
    // The target column's top card (if any) must be opposite color and one rank higher than the bottom card of moving stack
    const bottomCard = selectedCards[0]; // Actually bottom card is first selected? We selected from startIdx upwards, so first is lowest index (topmost? Let's think)
    // In tableau, column array index 0 is bottom card, higher index is higher up.
    // We selected startIdx to startIdx+count-1 where startIdx is deeper (closer to bottom) because we iterated from bottom up? Actually we iterated from bottom to top to find first face-up, startIdx is that index (could be bottom if only bottom face-up). Then we took cards from startIdx upwards (i increasing) which are higher in column (closer to top). So selectedCards[0] is the card closest to bottom among selected (lowest index). selectedCards[selectedCards.length-1] is the topmost card.
    // For moving stack, we need to check that the top card of target column (if any) is opposite color and one rank higher than the bottom card of the moving stack? Actually in solitaire, you can move a sequence onto a column if the top card of the sequence is opposite color and one rank lower than the target card? Wait: You can move a card or sequence onto a column if the bottom card of the moved sequence is opposite color and one rank lower than the top card of the target column. Example: target column top card is a red 6, you can move a black 5 or a sequence starting with black 5 onto it.
    // So we need to compare the bottom card of the moving stack (selectedCards[0]) with the top card of target column.
    let canMove = false;
    if (column.length === 0) {
        // empty column can accept a King or any sequence starting with a King? Actually only a King can be moved to empty column.
        canMove = (selectedCards[0].rank === 'K');
    } else {
        const targetTopCard = column[column.length - 1];
        const movingBottomCard = selectedCards[0];
        canMove = (getCardColor(movingBottomCard.suit) !== getCardColor(targetTopCard.suit) &&
                   rankValues[movingBottomCard.rank] === rankValues[targetTopCard.rank] - 1);
    }
    if (canMove) {
        // remove cards from source
        removeCardsFromSource(selectedCards.length);
        // add to target column
        tableau[colIndex].push(...selectedCards);
        // flip the new top card of source column if any (handled in remove)
        // clear selection
        selectedCards = [];
        selectedSource = null;
        render();
        return true;
    }
    return false;
}

// Remove card(s) from source
function removeCardFromSource(card) {
    if (selectedSource.type === 'waste') {
        // remove from waste
        waste.pop();
    } else if (selectedSource.type === 'tableau') {
        const col = tableau[selectedSource.index];
        // remove at startIndex
        col.splice(selectedSource.startIndex, 1);
        // if column not empty and new last card is face down, flip it up
        if (col.length > 0 && !col[col.length - 1].faceUp) {
            col[col.length - 1].faceUp = true;
        }
    }
}

function removeCardsFromSource(count) {
    if (selectedSource.type === 'waste') {
        // remove count cards from waste (should be 1)
        waste.splice(-count, count);
    } else if (selectedSource.type === 'tableau') {
        const col = tableau[selectedSource.index];
        col.splice(selectedSource.startIndex, count);
        // flip new last card if face down
        if (col.length > 0 && !col[col.length - 1].faceUp) {
            col[col.length - 1].faceUp = true;
        }
    }
}

// Check for win (all foundations have 13 cards)
function checkWin() {
    return foundations.every(pile => pile.length === 13);
}

// Initialize game on load
window.addEventListener('load', initGame);