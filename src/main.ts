import "./styles.css";

import {
  SUITS,
  autoMoveToFoundation,
  createNewGame,
  drawFromStock,
  elapsedMilliseconds,
  getMovableCards,
  isSuit,
  moveCards,
  type Card,
  type GameState,
  type MoveSource,
  type MoveTarget,
  type Suit,
} from "./game";
import { loadSession, MAX_HISTORY, saveSession } from "./storage";

const SUIT_SYMBOLS: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const SUIT_NAMES: Record<Suit, string> = {
  clubs: "clubs",
  diamonds: "diamonds",
  hearts: "hearts",
  spades: "spades",
};

const RANK_NAMES = [
  "",
  "Ace",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "Jack",
  "Queen",
  "King",
] as const;

const RANK_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PendingDrag {
  pointerId: number;
  source: MoveSource;
  origin: HTMLElement;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  active: boolean;
  ghost: HTMLElement | null;
}

interface DropResult {
  target: MoveTarget;
  element: HTMLElement;
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required interface element is missing: ${selector}`);
  }

  return element;
}

const boardElement = requireElement<HTMLElement>("#board");
const topRowElement = requireElement<HTMLElement>("#top-row");
const tableauElement = requireElement<HTMLElement>("#tableau");
const movesElement = requireElement<HTMLElement>("#moves-value");
const timeElement = requireElement<HTMLElement>("#time-value");
const statusElement = requireElement<HTMLElement>("#game-status");
const undoButton = requireElement<HTMLButtonElement>("#undo-button");
const newGameButton = requireElement<HTMLButtonElement>("#new-game-button");
const installButton = requireElement<HTMLButtonElement>("#install-button");
const toastElement = requireElement<HTMLElement>("#toast");
const announcerElement = requireElement<HTMLElement>("#announcer");
const newGameDialog = requireElement<HTMLDialogElement>("#new-game-dialog");
const winDialog = requireElement<HTMLDialogElement>("#win-dialog");
const installDialog = requireElement<HTMLDialogElement>("#install-dialog");
const freshDealButton = requireElement<HTMLButtonElement>("#fresh-deal-button");
const restartDealButton = requireElement<HTMLButtonElement>("#restart-deal-button");
const winNewDealButton = requireElement<HTMLButtonElement>("#win-new-deal-button");
const winSummaryElement = requireElement<HTMLElement>("#win-summary");
const installInstructionsElement = requireElement<HTMLElement>("#install-instructions");

const loaded = loadSession();
let state: GameState = loaded.session?.state ?? createNewGame();
let history: GameState[] = loaded.session?.history ?? [];
let selection: MoveSource | null = null;
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let toastTimer: number | null = null;
let lastStorageError: string | null = null;
let pendingDrag: PendingDrag | null = null;
let activeDropElement: HTMLElement | null = null;
let suppressClickUntil = 0;

function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank] ?? card.rank} of ${SUIT_NAMES[card.suit]}`;
}

function sourceKey(source: MoveSource): string {
  if (source.area === "tableau") {
    return `tableau-${source.pileIndex}-${source.cardIndex}`;
  }

  return source.area === "waste" ? "waste" : `foundation-${source.suit}`;
}

function sameSource(first: MoveSource, second: MoveSource): boolean {
  if (first.area !== second.area) {
    return false;
  }

  if (first.area === "waste" && second.area === "waste") {
    return true;
  }

  if (first.area === "foundation" && second.area === "foundation") {
    return first.suit === second.suit;
  }

  return (
    first.area === "tableau" &&
    second.area === "tableau" &&
    first.pileIndex === second.pileIndex &&
    first.cardIndex === second.cardIndex
  );
}

function isSelectedCard(source: MoveSource): boolean {
  if (!selection) {
    return false;
  }

  if (selection.area === "tableau" && source.area === "tableau") {
    return selection.pileIndex === source.pileIndex && source.cardIndex >= selection.cardIndex;
  }

  return sameSource(selection, source);
}

function setSourceData(element: HTMLElement, source: MoveSource): void {
  element.dataset.sourceArea = source.area;
  element.dataset.sourceKey = sourceKey(source);

  if (source.area === "tableau") {
    element.dataset.pileIndex = String(source.pileIndex);
    element.dataset.cardIndex = String(source.cardIndex);
  } else if (source.area === "foundation") {
    element.dataset.suit = source.suit;
  }
}

function sourceFromElement(element: HTMLElement): MoveSource | null {
  const area = element.dataset.sourceArea;

  if (area === "waste") {
    return { area: "waste" };
  }

  if (area === "foundation") {
    const suit = element.dataset.suit;
    return suit && isSuit(suit) ? { area: "foundation", suit } : null;
  }

  if (area === "tableau") {
    const pileIndex = Number(element.dataset.pileIndex);
    const cardIndex = Number(element.dataset.cardIndex);

    if (Number.isInteger(pileIndex) && Number.isInteger(cardIndex)) {
      return { area: "tableau", pileIndex, cardIndex };
    }
  }

  return null;
}

function targetForSource(source: MoveSource): MoveTarget | null {
  if (source.area === "tableau") {
    return { area: "tableau", pileIndex: source.pileIndex };
  }

  if (source.area === "foundation") {
    return { area: "foundation", suit: source.suit };
  }

  return null;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes}:${seconds.toString().padStart(2, "0")}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function announce(message: string): void {
  announcerElement.textContent = "";
  window.setTimeout(() => {
    announcerElement.textContent = message;
  }, 20);
}

function showToast(message: string): void {
  toastElement.textContent = message;
  toastElement.classList.add("is-visible");

  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    toastElement.classList.remove("is-visible");
    toastTimer = null;
  }, 3_200);
}

function persistGame(): void {
  const error = saveSession(state, history);

  if (error && error !== lastStorageError) {
    lastStorageError = error;
    showToast(error);
  }
}

function createCardElement(
  card: Card,
  source: MoveSource | null,
  interactive: boolean,
): HTMLElement {
  const element =
    interactive && card.faceUp
      ? document.createElement("button")
      : document.createElement("div");
  element.className = `playing-card ${card.faceUp ? "face-up" : "face-down"}`;
  element.dataset.cardId = card.id;

  if (element instanceof HTMLButtonElement) {
    element.type = "button";
  }

  if (!card.faceUp) {
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "Face-down card");
    return element;
  }

  element.classList.add(`suit-${card.suit}`);

  const topCorner = document.createElement("span");
  topCorner.className = "card-corner";

  const rank = document.createElement("span");
  rank.className = "card-rank";
  rank.textContent = RANK_LABELS[card.rank] ?? String(card.rank);

  const cornerSuit = document.createElement("span");
  cornerSuit.className = "corner-suit";
  cornerSuit.textContent = SUIT_SYMBOLS[card.suit];
  topCorner.append(rank, cornerSuit);

  const centerSuit = document.createElement("span");
  centerSuit.className = "center-suit";
  centerSuit.textContent = SUIT_SYMBOLS[card.suit];
  centerSuit.setAttribute("aria-hidden", "true");

  const bottomCorner = topCorner.cloneNode(true) as HTMLElement;
  bottomCorner.classList.add("card-corner-bottom");
  element.append(topCorner, centerSuit, bottomCorner);

  if (source) {
    setSourceData(element, source);
    const movingCount = getMovableCards(state, source).length;
    const sequenceDescription =
      movingCount > 1 ? `, moving a sequence of ${movingCount} cards` : "";
    element.setAttribute("aria-label", `${cardName(card)}${sequenceDescription}`);
    element.setAttribute("aria-pressed", String(sameSource(selection ?? source, source) && selection !== null));

    if (isSelectedCard(source)) {
      element.classList.add("is-selected");
    }
  } else {
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", cardName(card));
  }

  return element;
}

function createEmptySlot(label: string, symbol: string): HTMLButtonElement {
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "empty-slot";
  slot.setAttribute("aria-label", label);

  const symbolElement = document.createElement("span");
  symbolElement.setAttribute("aria-hidden", "true");
  symbolElement.textContent = symbol;
  slot.append(symbolElement);
  return slot;
}

function renderTopRow(): void {
  const fragment = document.createDocumentFragment();

  const stockSlot = document.createElement("button");
  stockSlot.type = "button";
  stockSlot.className = "card-slot stock-slot";
  stockSlot.dataset.action = "draw-stock";

  if (state.stock.length > 0) {
    stockSlot.setAttribute(
      "aria-label",
      `Draw a card from the stock. ${state.stock.length} cards remain.`,
    );
    stockSlot.append(createCardElement(state.stock.at(-1) ?? state.stock[0]!, null, false));
  } else if (state.waste.length > 0) {
    stockSlot.classList.add("recycle-slot");
    stockSlot.setAttribute("aria-label", "Turn the waste over and recycle it into the stock.");
    const recycleIcon = document.createElement("span");
    recycleIcon.className = "recycle-icon";
    recycleIcon.setAttribute("aria-hidden", "true");
    recycleIcon.textContent = "↻";
    stockSlot.append(recycleIcon);
  } else {
    stockSlot.disabled = true;
    stockSlot.setAttribute("aria-label", "The stock and waste are empty.");
    const emptyStock = document.createElement("div");
    emptyStock.className = "empty-slot empty-slot-passive";
    emptyStock.setAttribute("aria-hidden", "true");
    stockSlot.append(emptyStock);
  }

  fragment.append(stockSlot);

  const wasteSlot = document.createElement("div");
  wasteSlot.className = "card-slot waste-slot";
  wasteSlot.setAttribute("aria-label", "Waste pile");
  const wasteCard = state.waste.at(-1);

  if (wasteCard) {
    wasteSlot.append(createCardElement(wasteCard, { area: "waste" }, true));
  } else {
    const emptyWaste = document.createElement("div");
    emptyWaste.className = "empty-slot empty-slot-passive";
    emptyWaste.setAttribute("aria-hidden", "true");
    wasteSlot.append(emptyWaste);
  }

  fragment.append(wasteSlot);

  const spacer = document.createElement("div");
  spacer.className = "top-spacer";
  spacer.setAttribute("aria-hidden", "true");
  fragment.append(spacer);

  for (const suit of SUITS) {
    const foundationSlot = document.createElement("div");
    foundationSlot.className = `card-slot foundation-slot suit-${suit}`;
    foundationSlot.dataset.dropArea = "foundation";
    foundationSlot.dataset.suit = suit;
    foundationSlot.setAttribute("aria-label", `${SUIT_NAMES[suit]} foundation`);
    const card = state.foundations[suit].at(-1);

    if (card) {
      foundationSlot.append(
        createCardElement(card, { area: "foundation", suit }, true),
      );
    } else {
      foundationSlot.append(
        createEmptySlot(`Empty ${SUIT_NAMES[suit]} foundation`, SUIT_SYMBOLS[suit]),
      );
    }

    fragment.append(foundationSlot);
  }

  topRowElement.replaceChildren(fragment);
}

function renderTableau(): void {
  const fragment = document.createDocumentFragment();

  state.tableau.forEach((pile, pileIndex) => {
    const pileElement = document.createElement("div");
    pileElement.className = "tableau-pile";
    pileElement.dataset.dropArea = "tableau";
    pileElement.dataset.pileIndex = String(pileIndex);
    pileElement.setAttribute("aria-label", `Tableau column ${pileIndex + 1}`);

    if (pile.length === 0) {
      pileElement.append(createEmptySlot(`Empty tableau column ${pileIndex + 1}`, "K"));
    } else {
      pile.forEach((card, cardIndex) => {
        const source: MoveSource = { area: "tableau", pileIndex, cardIndex };
        const cardElement = createCardElement(card, card.faceUp ? source : null, card.faceUp);

        if (!card.faceUp) {
          cardElement.setAttribute(
            "aria-label",
            `Face-down card in tableau column ${pileIndex + 1}`,
          );
        }

        pileElement.append(cardElement);
      });
    }

    fragment.append(pileElement);
  });

  tableauElement.replaceChildren(fragment);
}

function updateStats(): void {
  movesElement.textContent = String(state.moves);
  timeElement.textContent = formatDuration(elapsedMilliseconds(state));
}

function renderStatus(): void {
  if (state.status === "won") {
    statusElement.textContent = "All four suits completed";
    return;
  }

  if (selection) {
    const firstCard = getMovableCards(state, selection)[0];
    statusElement.textContent = firstCard ? `${cardName(firstCard)} selected` : "Choose a destination";
    return;
  }

  statusElement.textContent =
    state.moves === 0 ? "Tap the deck to begin" : "Draw one · unlimited passes";
}

function render(): void {
  renderTopRow();
  renderTableau();
  updateStats();
  renderStatus();
  undoButton.disabled = history.length === 0;
  boardElement.classList.toggle("game-won", state.status === "won");

  if (selection) {
    const key = sourceKey(selection);
    window.requestAnimationFrame(() => {
      const selectedElement = boardElement.querySelector<HTMLElement>(
        `[data-source-key="${key}"]`,
      );
      selectedElement?.focus({ preventScroll: true });
    });
  }
}

function showWinDialog(): void {
  winSummaryElement.textContent = `${state.moves} moves in ${formatDuration(
    elapsedMilliseconds(state),
  )}.`;

  if (!winDialog.open) {
    winDialog.showModal();
  }
}

function commit(nextState: GameState, message: string): void {
  const wasWon = state.status === "won";
  history = [...history.slice(-(MAX_HISTORY - 1)), state];
  state = nextState;
  selection = null;
  persistGame();
  render();
  announce(message);

  if (!wasWon && state.status === "won") {
    window.setTimeout(showWinDialog, 350);
  }
}

function startGame(seed?: number): void {
  state = seed === undefined ? createNewGame() : createNewGame(seed);
  history = [];
  selection = null;
  persistGame();

  if (winDialog.open) {
    winDialog.close();
  }

  if (newGameDialog.open) {
    newGameDialog.close();
  }

  render();
  announce("A new game has been dealt.");
}

function undo(): void {
  const previousState = history.pop();

  if (!previousState) {
    return;
  }

  state = previousState;
  selection = null;
  persistGame();

  if (winDialog.open) {
    winDialog.close();
  }

  render();
  announce("Last move undone.");
}

function flashInvalid(element: HTMLElement | null): void {
  if (!element) {
    return;
  }

  element.classList.remove("is-invalid");
  window.requestAnimationFrame(() => {
    element.classList.add("is-invalid");
    window.setTimeout(() => element.classList.remove("is-invalid"), 320);
  });
}

function attemptMove(
  source: MoveSource,
  target: MoveTarget,
  targetElement: HTMLElement | null,
): boolean {
  const movingCards = getMovableCards(state, source);
  const firstCard = movingCards[0];
  const nextState = moveCards(state, source, target);

  if (!nextState || !firstCard) {
    flashInvalid(targetElement);
    announce("That move is not available.");
    return false;
  }

  const destination =
    target.area === "foundation"
      ? `${SUIT_NAMES[target.suit]} foundation`
      : `tableau column ${target.pileIndex + 1}`;
  commit(nextState, `${cardName(firstCard)} moved to ${destination}.`);
  return true;
}

function selectSource(source: MoveSource): void {
  if (getMovableCards(state, source).length === 0) {
    return;
  }

  selection = source;
  render();
  const selectedCard = getMovableCards(state, source)[0];

  if (selectedCard) {
    announce(`${cardName(selectedCard)} selected. Choose a destination.`);
  }
}

function handleCardTap(source: MoveSource, cardElement: HTMLElement): void {
  if (state.status === "won") {
    return;
  }

  if (!selection) {
    selectSource(source);
    return;
  }

  if (sameSource(selection, source)) {
    const selectedCard = getMovableCards(state, selection)[0];
    const nextState = autoMoveToFoundation(state, selection);

    if (nextState && selectedCard) {
      commit(nextState, `${cardName(selectedCard)} moved to its foundation.`);
    } else {
      selection = null;
      render();
      announce("Selection cleared.");
    }

    return;
  }

  if (
    selection.area === "tableau" &&
    source.area === "tableau" &&
    selection.pileIndex === source.pileIndex
  ) {
    selectSource(source);
    return;
  }

  const target = targetForSource(source);

  if (target && attemptMove(selection, target, cardElement.closest<HTMLElement>("[data-drop-area]"))) {
    return;
  }

  selectSource(source);
}

function dropResultFromElement(element: Element | null): DropResult | null {
  const dropElement = element?.closest<HTMLElement>("[data-drop-area]");

  if (!dropElement) {
    return null;
  }

  if (dropElement.dataset.dropArea === "tableau") {
    const pileIndex = Number(dropElement.dataset.pileIndex);

    if (Number.isInteger(pileIndex)) {
      return {
        target: { area: "tableau", pileIndex },
        element: dropElement,
      };
    }
  }

  if (dropElement.dataset.dropArea === "foundation") {
    const suit = dropElement.dataset.suit;

    if (suit && isSuit(suit)) {
      return {
        target: { area: "foundation", suit },
        element: dropElement,
      };
    }
  }

  return null;
}

function handleBoardClick(event: MouseEvent): void {
  if (Date.now() < suppressClickUntil || state.status === "won") {
    return;
  }

  const targetElement = event.target;

  if (!(targetElement instanceof Element)) {
    return;
  }

  const stock = targetElement.closest<HTMLElement>('[data-action="draw-stock"]');

  if (stock) {
    selection = null;
    const recycled = state.stock.length === 0 && state.waste.length > 0;
    const nextState = drawFromStock(state);

    if (nextState) {
      commit(nextState, recycled ? "The waste was recycled into the stock." : "A card was drawn.");
    }

    return;
  }

  const cardElement = targetElement.closest<HTMLElement>("[data-source-area]");

  if (cardElement) {
    const source = sourceFromElement(cardElement);

    if (source) {
      handleCardTap(source, cardElement);
    }

    return;
  }

  const dropResult = dropResultFromElement(targetElement);

  if (dropResult && selection) {
    attemptMove(selection, dropResult.target, dropResult.element);
  }
}

function createDragGhost(source: MoveSource, origin: HTMLElement): HTMLElement {
  const cards = getMovableCards(state, source);
  const ghost = document.createElement("div");
  const rect = origin.getBoundingClientRect();
  ghost.className = "drag-ghost";
  ghost.style.width = `${rect.width}px`;

  for (const card of cards) {
    ghost.append(createCardElement(card, null, false));
  }

  document.body.append(ghost);
  return ghost;
}

function markDragOrigin(source: MoveSource, active: boolean): void {
  const sourceElements = boardElement.querySelectorAll<HTMLElement>("[data-source-area]");

  sourceElements.forEach((element) => {
    const elementSource = sourceFromElement(element);

    if (!elementSource) {
      return;
    }

    const matches =
      source.area === "tableau" && elementSource.area === "tableau"
        ? source.pileIndex === elementSource.pileIndex &&
          elementSource.cardIndex >= source.cardIndex
        : sameSource(source, elementSource);

    if (matches) {
      element.classList.toggle("is-drag-origin", active);
    }
  });
}

function updateDropHighlight(result: DropResult | null): void {
  if (activeDropElement === result?.element) {
    return;
  }

  activeDropElement?.classList.remove("is-drag-over");
  activeDropElement = result?.element ?? null;
  activeDropElement?.classList.add("is-drag-over");
}

function positionGhost(drag: PendingDrag, clientX: number, clientY: number): void {
  if (!drag.ghost) {
    return;
  }

  drag.ghost.style.transform = `translate3d(${clientX - drag.offsetX}px, ${
    clientY - drag.offsetY
  }px, 0) rotate(1.5deg)`;
}

function cleanupDrag(): void {
  if (!pendingDrag) {
    return;
  }

  markDragOrigin(pendingDrag.source, false);
  pendingDrag.ghost?.remove();
  activeDropElement?.classList.remove("is-drag-over");
  activeDropElement = null;

  if (pendingDrag.origin.hasPointerCapture(pendingDrag.pointerId)) {
    pendingDrag.origin.releasePointerCapture(pendingDrag.pointerId);
  }

  pendingDrag = null;
}

function handlePointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || state.status === "won") {
    return;
  }

  const eventTarget = event.target;

  if (!(eventTarget instanceof Element)) {
    return;
  }

  const origin = eventTarget.closest<HTMLElement>(".playing-card[data-source-area]");

  if (!origin) {
    return;
  }

  const source = sourceFromElement(origin);

  if (!source || getMovableCards(state, source).length === 0) {
    return;
  }

  const rect = origin.getBoundingClientRect();
  origin.setPointerCapture(event.pointerId);
  pendingDrag = {
    pointerId: event.pointerId,
    source,
    origin,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    active: false,
    ghost: null,
  };
}

function handlePointerMove(event: PointerEvent): void {
  const drag = pendingDrag;

  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);

  if (!drag.active && distance < 9) {
    return;
  }

  event.preventDefault();

  if (!drag.active) {
    drag.active = true;
    drag.ghost = createDragGhost(drag.source, drag.origin);
    markDragOrigin(drag.source, true);
    document.body.classList.add("is-dragging");
  }

  positionGhost(drag, event.clientX, event.clientY);
  updateDropHighlight(dropResultFromElement(document.elementFromPoint(event.clientX, event.clientY)));
}

function handlePointerUp(event: PointerEvent): void {
  const drag = pendingDrag;

  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  if (!drag.active) {
    cleanupDrag();
    return;
  }

  event.preventDefault();
  const dropResult = dropResultFromElement(document.elementFromPoint(event.clientX, event.clientY));
  const source = drag.source;
  suppressClickUntil = Date.now() + 350;
  cleanupDrag();
  document.body.classList.remove("is-dragging");

  if (dropResult) {
    attemptMove(source, dropResult.target, dropResult.element);
  } else {
    announce("Card returned to its pile.");
  }
}

function handlePointerCancel(event: PointerEvent): void {
  if (pendingDrag?.pointerId !== event.pointerId) {
    return;
  }

  suppressClickUntil = Date.now() + 350;
  cleanupDrag();
  document.body.classList.remove("is-dragging");
}

function closeParentDialog(event: Event): void {
  const target = event.currentTarget;
  const dialog = target instanceof Element ? target.closest<HTMLDialogElement>("dialog") : null;
  dialog?.close();
}

boardElement.addEventListener("click", handleBoardClick);
boardElement.addEventListener("pointerdown", handlePointerDown);
document.addEventListener("pointermove", handlePointerMove, { passive: false });
document.addEventListener("pointerup", handlePointerUp);
document.addEventListener("pointercancel", handlePointerCancel);

undoButton.addEventListener("click", undo);
newGameButton.addEventListener("click", () => newGameDialog.showModal());
freshDealButton.addEventListener("click", () => startGame());
restartDealButton.addEventListener("click", () => startGame(state.seed));
winNewDealButton.addEventListener("click", () => startGame());

document.querySelectorAll<HTMLElement>("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", closeParentDialog);
});

for (const dialog of [newGameDialog, winDialog, installDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
    return;
  }

  if (event.key === "Escape" && selection && !document.querySelector("dialog[open]")) {
    selection = null;
    render();
    announce("Selection cleared.");
  }
});

window.addEventListener(
  "beforeinstallprompt",
  ((event: Event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    installButton.hidden = false;
  }) as EventListener,
);

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
  showToast("Solitaire was installed.");
});

installButton.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    const prompt = deferredInstallPrompt;

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;

      if (choice.outcome === "accepted") {
        announce("Solitaire installation accepted.");
      }
    } catch (error) {
      console.error("Unable to show the Solitaire installation prompt.", error);
      showToast("The install prompt could not be opened.");
    } finally {
      deferredInstallPrompt = null;
      installButton.hidden = true;
    }

    return;
  }

  installDialog.showModal();
});

const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  navigatorWithStandalone.standalone === true;
const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent);

if (isAppleMobile && !isStandalone) {
  installButton.hidden = false;
  installInstructionsElement.textContent =
    "In Safari, tap the Share button, then choose Add to Home Screen.";
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error: unknown) => {
      console.error("Unable to register the offline service worker.", error);
      showToast("Offline mode could not be enabled.");
    });
  });
}

window.setInterval(updateStats, 1_000);
document.addEventListener("visibilitychange", updateStats);

render();

if (loaded.error) {
  window.setTimeout(() => showToast(loaded.error ?? ""), 100);
}

if (state.status === "won") {
  window.setTimeout(showWinDialog, 200);
}
