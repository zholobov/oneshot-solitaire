import { SUITS, canFinish, canMove, cardName, hint, isRed, isWon, movingCards, rankLabel, suit, } from "./game.js";
import { SAVE_KEY, advance, createSession, decodeSession, encodeSession, finish, restart, undo, } from "./session.js";
function element(id, type) {
    const found = document.getElementById(id);
    if (!(found instanceof type))
        throw new Error(`Missing page element: ${id}`);
    return found;
}
const board = element("board", HTMLElement);
const message = element("message", HTMLParagraphElement);
const warning = element("warning", HTMLParagraphElement);
const time = element("time", HTMLElement);
const moveCount = element("moves", HTMLElement);
const progress = element("progress", HTMLElement);
const undoButton = element("undo", HTMLButtonElement);
const hintButton = element("hint", HTMLButtonElement);
const restartButton = element("restart", HTMLButtonElement);
const finishButton = element("finish", HTMLButtonElement);
const installButton = element("install", HTMLButtonElement);
const updateButton = element("update", HTMLButtonElement);
const helpDialog = element("help-dialog", HTMLDialogElement);
const installDialog = element("install-dialog", HTMLDialogElement);
const confirmDialog = element("confirm-dialog", HTMLDialogElement);
const winDialog = element("win-dialog", HTMLDialogElement);
const warnings = new Map();
let lastStored = null;
function showWarning(key, text, error) {
    if (text)
        warnings.set(key, text);
    else
        warnings.delete(key);
    warning.textContent = [...warnings.values()].join(" ");
    warning.hidden = warnings.size === 0;
    if (error)
        console.warn(text, error);
}
function load() {
    let raw;
    try {
        raw = localStorage.getItem(SAVE_KEY);
        lastStored = raw;
    }
    catch (error) {
        showWarning("save", "This browser cannot save your game. Keep this page open to keep playing.", error);
        return createSession();
    }
    if (raw === null)
        return createSession();
    try {
        return decodeSession(raw);
    }
    catch (error) {
        showWarning("load", "Your saved game could not be read. A new deal has been started.", error);
        return createSession();
    }
}
let session = load();
let selected = null;
let hintedTarget = null;
let drawHint = false;
let lastClock = performance.now();
let wasActive = !document.hidden && document.hasFocus();
let lastSave = 0;
let suppressClickUntil = 0;
let pendingReset = null;
function formatTime(milliseconds) {
    const total = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
function clock() {
    const now = performance.now();
    if (wasActive && session.state.moves > 0 && !isWon(session.state))
        session.elapsedMs += now - lastClock;
    lastClock = now;
    wasActive = !document.hidden && document.hasFocus();
    time.textContent = formatTime(session.elapsedMs);
}
function save() {
    lastSave = performance.now();
    try {
        const existing = localStorage.getItem(SAVE_KEY);
        if (existing !== null && existing !== lastStored) {
            receiveSave(existing);
            return false;
        }
        const raw = encodeSession(session);
        localStorage.setItem(SAVE_KEY, raw);
        lastStored = raw;
        showWarning("save", null);
        return true;
    }
    catch (error) {
        showWarning("save", "Your game cannot be saved right now. Keep this page open to avoid losing it.", warnings.has("save") ? undefined : error);
        return false;
    }
}
function announce(text, error = false) {
    message.textContent = text;
    message.dataset.tone = error ? "error" : "normal";
}
function receiveSave(raw) {
    const incoming = decodeSession(raw);
    const changed = JSON.stringify(incoming.state) !== JSON.stringify(session.state);
    if (!changed)
        incoming.elapsedMs = Math.max(incoming.elapsedMs, session.elapsedMs);
    session = incoming;
    lastStored = raw;
    lastClock = performance.now();
    if (changed) {
        endDrag();
        clearSelection();
        if (winDialog.open)
            winDialog.close();
        if (confirmDialog.open)
            confirmDialog.close();
        render();
        announce("Your game changed in another window. The latest saved game is now shown.");
    }
    time.textContent = formatTime(session.elapsedMs);
}
window.addEventListener("storage", event => {
    if (event.key !== SAVE_KEY)
        return;
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw !== null && raw !== lastStored)
            receiveSave(raw);
    }
    catch (error) {
        showWarning("sync", "Changes from another window could not be read. Your game is still open here.", error);
    }
});
function sourceKey(source) {
    return source.pile === "waste" ? "w"
        : source.pile === "foundation" ? `f${source.index}` : `t${source.index}:${source.cardIndex}`;
}
function targetKey(target) {
    return `${target.pile === "foundation" ? "f" : "t"}${target.index}`;
}
function sourceAt(node) {
    const key = node.closest("[data-source]")?.dataset.source;
    if (!key)
        return null;
    if (key === "w")
        return { pile: "waste" };
    if (/^f[0-3]$/.test(key))
        return { pile: "foundation", index: Number(key[1]) };
    const match = /^t([0-6]):(\d+)$/.exec(key);
    if (match)
        return { pile: "tableau", index: Number(match[1]), cardIndex: Number(match[2]) };
    throw new Error("Invalid card position on the table.");
}
function targetAt(node) {
    const key = node?.closest("[data-target]")?.dataset.target;
    if (!key)
        return null;
    return { pile: key[0] === "f" ? "foundation" : "tableau", index: Number(key[1]) };
}
function cardHTML(card, source, style = "") {
    const symbol = SUITS[suit(card.id)].symbol;
    const location = source.pile === "tableau" ? `column ${source.index + 1}`
        : source.pile === "foundation" ? `${SUITS[source.index].name} home` : "discard";
    const count = movingCards(session.state, source).length;
    const label = `${cardName(card.id)}, ${location}${count > 1 ? `, ${count} cards in this run` : ""}`;
    const corner = `<span>${rankLabel(card.id)}</span><span class="corner-suit">${symbol}</span>`;
    return `<button id="card-${card.id}" class="card${isRed(card.id) ? " red" : ""}" data-source="${sourceKey(source)}" aria-label="${label}" aria-pressed="false" ${style}>
    <span class="card-corner" aria-hidden="true">${corner}</span>
    <span class="card-center" aria-hidden="true">${symbol}</span>
    <span class="card-corner bottom" aria-hidden="true">${corner}</span>
  </button>`;
}
function render() {
    const focused = board.contains(document.activeElement) ? document.activeElement?.id : undefined;
    const { stock, waste, foundations, tableau, moves } = session.state;
    const stockButton = stock.length
        ? `<button id="stock" class="card card-back stock" data-draw aria-label="Draw one card, ${stock.length} remaining"><span class="stock-emblem" aria-hidden="true">&#9824;</span><span class="stock-count" aria-hidden="true">${stock.length}</span></button>`
        : `<button id="stock" class="empty-slot stock" data-draw aria-label="${waste.length ? `Recycle ${waste.length} discards` : "No cards left to draw"}" ${waste.length ? "" : "disabled"}><span class="recycle-symbol" aria-hidden="true">&#8635;</span></button>`;
    const homes = foundations.map((pile, index) => {
        const top = pile.at(-1);
        return `<div class="pile home-pile" data-target="f${index}">
      ${top ? cardHTML(top, { pile: "foundation", index }) : `<button class="empty-slot${SUITS[index].red ? " red-slot" : ""}" aria-label="${SUITS[index].name} home, empty. Ace required."><span class="slot-symbol" aria-hidden="true">${SUITS[index].symbol}</span><span class="slot-caption" aria-hidden="true">A</span></button>`}
    </div>`;
    }).join("");
    const columns = tableau.map((pile, index) => {
        let up = 0;
        let down = 0;
        const cards = pile.map((card, cardIndex) => {
            const style = `style="--up:${up};--down:${down}"`;
            if (card.faceUp) {
                up++;
                return cardHTML(card, { pile: "tableau", index, cardIndex }, style);
            }
            down++;
            return `<div class="card card-back" aria-hidden="true" ${style}></div>`;
        }).join("");
        return `<div class="pile tableau-column" data-target="t${index}" style="--stack-up:${Math.max(0, up - 1)};--stack-down:${down}" role="group" aria-label="Column ${index + 1}">
      ${cards || `<button class="empty-slot" aria-label="Empty column ${index + 1}, kings only"><span class="slot-symbol" aria-hidden="true">K</span></button>`}
    </div>`;
    }).join("");
    board.innerHTML = `<div class="pile-headings" aria-hidden="true"><span class="draw-label">Draw &amp; discard</span><span class="home-label">Build each suit</span></div>
    <div class="top-row">
      <div class="pile">${stockButton}</div>
      <div class="pile discard-pile">${waste.length ? cardHTML(waste.at(-1), { pile: "waste" }) : '<div class="empty-slot" role="img" aria-label="Discard pile, empty"></div>'}</div>
      <div aria-hidden="true"></div>${homes}
    </div><div class="tableau">${columns}</div>`;
    moveCount.textContent = String(moves);
    progress.textContent = String(foundations.reduce((total, pile) => total + pile.length, 0));
    time.textContent = formatTime(session.elapsedMs);
    undoButton.disabled = !session.history.length;
    hintButton.disabled = isWon(session.state);
    restartButton.disabled = moves === 0 && session.elapsedMs === 0;
    finishButton.hidden = !canFinish(session.state);
    updateSelection();
    if (focused)
        document.getElementById(focused)?.focus({ preventScroll: true });
}
function isSelected(source) {
    if (!selected)
        return false;
    if (source.pile === "tableau" && selected.pile === "tableau") {
        return source.index === selected.index && source.cardIndex >= selected.cardIndex;
    }
    return sourceKey(source) === sourceKey(selected);
}
function updateSelection() {
    board.querySelectorAll("[data-source]").forEach(button => {
        const source = sourceAt(button);
        const active = source !== null && isSelected(source);
        button.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", String(active));
    });
    board.querySelectorAll("[data-target]").forEach(pile => {
        const target = targetAt(pile);
        pile.classList.toggle("is-legal", selected !== null && canMove(session.state, selected, target));
        pile.classList.toggle("is-hinted", hintedTarget !== null && targetKey(target) === targetKey(hintedTarget));
    });
    document.getElementById("stock")?.classList.toggle("is-hinted", drawHint);
}
function clearSelection() {
    selected = null;
    hintedTarget = null;
    drawHint = false;
}
function commit(next, text) {
    session = next;
    clearSelection();
    showWarning("load", null);
    render();
    announce(text);
    save();
    if (isWon(session.state)) {
        announce("You won! All 52 cards are home.");
        element("win-detail", HTMLElement).textContent = `${formatTime(session.elapsedMs)} played. ${session.state.moves} moves. Nicely done.`;
        winDialog.showModal();
    }
}
function perform(action) {
    clock();
    const next = advance(session, action);
    if (!next) {
        announce(action.type === "draw" ? "No cards left to draw."
            : action.to.pile === "foundation" ? "Build each suit from ace to king, one card at a time."
                : "Build down in alternating colors. Only a king can fill an empty column.", true);
        return false;
    }
    const text = action.type === "draw"
        ? next.state.waste.length ? `${cardName(next.state.waste.at(-1).id)} drawn.` : "The deck is ready to draw again."
        : `${cardName(movingCards(session.state, action.from)[0].id)} moved.`;
    commit(next, text);
    return true;
}
function select(source) {
    selected = source;
    hintedTarget = null;
    drawHint = false;
    updateSelection();
    const card = movingCards(session.state, source)[0];
    if (card)
        announce(`${cardName(card.id)} selected. Tap a highlighted pile, or tap the card again to cancel.`);
}
board.addEventListener("click", event => {
    if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        return;
    }
    if (!(event.target instanceof Element))
        return;
    if (isWon(session.state)) {
        announce("You won! Start a new game, or undo a move.");
        return;
    }
    if (event.target.closest("[data-draw]")) {
        perform({ type: "draw" });
        return;
    }
    const source = sourceAt(event.target);
    const target = targetAt(event.target);
    if (source && selected && sourceKey(source) === sourceKey(selected)) {
        clearSelection();
        updateSelection();
        announce("Selection cleared.");
    }
    else if (selected && target) {
        if (source?.pile === "tableau" && selected.pile === "tableau" && source.index === selected.index)
            select(source);
        else
            perform({ type: "move", from: selected, to: target });
    }
    else if (source)
        select(source);
    else if (target)
        announce(target.pile === "foundation"
            ? `Start this pile with the ace of ${SUITS[target.index].name}.` : "Only a king can start an empty column.");
});
let drag = null;
function endDrag() {
    const previous = drag;
    drag = null;
    previous?.ghost?.remove();
    if (previous?.button.hasPointerCapture(previous.pointer))
        previous.button.releasePointerCapture(previous.pointer);
    board.querySelectorAll(".is-drag-source, .is-drop-target").forEach(node => node.classList.remove("is-drag-source", "is-drop-target"));
}
board.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary || !(event.target instanceof Element) || isWon(session.state))
        return;
    const button = event.target.closest("[data-source]");
    const source = button ? sourceAt(button) : null;
    if (!button || !source)
        return;
    endDrag();
    const rect = button.getBoundingClientRect();
    drag = { source, pointer: event.pointerId, button, x: event.clientX, y: event.clientY,
        offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, ghost: null };
    button.setPointerCapture(event.pointerId);
});
board.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointer)
        return;
    if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8)
        return;
    event.preventDefault();
    if (!drag.ghost) {
        selected = drag.source;
        hintedTarget = null;
        drawHint = false;
        updateSelection();
        const ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        const origin = drag.button.getBoundingClientRect();
        for (const card of movingCards(session.state, drag.source)) {
            const original = document.getElementById(`card-${card.id}`);
            if (!original)
                throw new Error("A dragged card is missing from the table.");
            const clone = original.cloneNode(true);
            if (!(clone instanceof HTMLButtonElement))
                throw new Error("A dragged card must be a button.");
            clone.removeAttribute("id");
            clone.removeAttribute("data-source");
            clone.classList.remove("is-selected");
            clone.disabled = true;
            clone.style.top = `${original.getBoundingClientRect().top - origin.top}px`;
            clone.style.width = `${origin.width}px`;
            clone.style.height = `${origin.height}px`;
            ghost.append(clone);
            original.classList.add("is-drag-source");
        }
        document.body.append(ghost);
        drag.ghost = ghost;
    }
    drag.ghost.style.transform = `translate(${event.clientX - drag.offsetX}px, ${event.clientY - drag.offsetY}px)`;
    const target = targetAt(document.elementFromPoint(event.clientX, event.clientY));
    board.querySelectorAll("[data-target]").forEach(pile => {
        pile.classList.toggle("is-drop-target", target !== null && pile.dataset.target === targetKey(target) &&
            drag !== null && canMove(session.state, drag.source, target));
    });
});
board.addEventListener("pointerup", event => {
    if (!drag || event.pointerId !== drag.pointer)
        return;
    const { source, ghost } = drag;
    const target = targetAt(document.elementFromPoint(event.clientX, event.clientY));
    endDrag();
    if (!ghost)
        return;
    suppressClickUntil = performance.now() + 350;
    if (target)
        perform({ type: "move", from: source, to: target });
    else
        announce("Drop the card onto a highlighted pile.", true);
    updateSelection();
});
board.addEventListener("pointercancel", endDrag);
board.addEventListener("lostpointercapture", endDrag);
window.addEventListener("blur", () => { clock(); endDrag(); save(); });
window.addEventListener("focus", () => { clock(); save(); });
function doUndo() {
    clock();
    const previous = undo(session);
    if (previous) {
        if (winDialog.open)
            winDialog.close();
        endDrag();
        commit(previous, "Move undone.");
    }
    else
        announce("No moves to undo.");
}
undoButton.addEventListener("click", doUndo);
hintButton.addEventListener("click", () => {
    const suggested = hint(session.state);
    clearSelection();
    if (suggested?.type === "move") {
        selected = suggested.from;
        hintedTarget = suggested.to;
        const card = movingCards(session.state, suggested.from)[0];
        announce(`Try ${cardName(card.id)} ${suggested.to.pile === "foundation" ? "to its suit pile" : `to column ${suggested.to.index + 1}`}.`);
    }
    else if (suggested) {
        drawHint = true;
        announce(session.state.stock.length ? "Try drawing a card from the deck." : "Tap the circular arrow to reuse the discards.");
    }
    else
        announce("No legal moves remain. Undo a move or start a new game.");
    updateSelection();
});
finishButton.addEventListener("click", () => {
    clock();
    const completed = finish(session);
    if (completed)
        commit(completed, "All cards are home.");
    else
        announce("Finish is available once the deck and discard are empty and every card is face up.", true);
});
function reset(kind) {
    endDrag();
    if (winDialog.open)
        winDialog.close();
    lastClock = performance.now();
    commit(kind === "new" ? createSession() : restart(session), kind === "new" ? "New deal. Good luck!" : "Same deal, fresh start.");
}
function requestReset(kind) {
    if (!session.state.moves || isWon(session.state)) {
        reset(kind);
        return;
    }
    endDrag();
    pendingReset = kind;
    element("confirm-title", HTMLElement).textContent = kind === "new" ? "Start a new game?" : "Try this deal again?";
    element("confirm-description", HTMLElement).textContent = kind === "new"
        ? "Your current game will be replaced by a new shuffle." : "The same cards will return to their starting positions. Your time and moves will reset.";
    element("confirm-action", HTMLButtonElement).textContent = kind === "new" ? "New game" : "Restart deal";
    confirmDialog.showModal();
}
element("new-game", HTMLButtonElement).addEventListener("click", () => requestReset("new"));
restartButton.addEventListener("click", () => requestReset("restart"));
element("win-new", HTMLButtonElement).addEventListener("click", () => reset("new"));
element("confirm-action", HTMLButtonElement).addEventListener("click", () => {
    const kind = pendingReset;
    confirmDialog.close();
    if (kind)
        reset(kind);
});
confirmDialog.addEventListener("close", () => { pendingReset = null; });
element("help", HTMLButtonElement).addEventListener("click", () => helpDialog.showModal());
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
document.addEventListener("keydown", event => {
    if (document.querySelector("dialog[open]"))
        return;
    if (event.key === "Escape") {
        endDrag();
        clearSelection();
        updateSelection();
        announce("Selection cleared.");
    }
    else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        doUndo();
    }
});
window.setInterval(() => {
    clock();
    if (wasActive && session.state.moves && !isWon(session.state) && performance.now() - lastSave >= 5000)
        save();
}, 1000);
document.addEventListener("visibilitychange", () => {
    clock();
    if (document.hidden)
        endDrag();
    save();
});
window.addEventListener("pagehide", () => { clock(); save(); });
window.addEventListener("pageshow", () => { lastClock = performance.now(); wasActive = !document.hidden && document.hasFocus(); });
let installPrompt = null;
const standalone = window.matchMedia("(display-mode: standalone)");
function updateInstallButton() {
    installButton.hidden = standalone.matches || ("standalone" in navigator && navigator.standalone === true);
}
window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
});
window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButton.hidden = true;
    announce("Solitaire is installed. Look for it on your home screen.");
});
standalone.addEventListener("change", updateInstallButton);
installButton.addEventListener("click", async () => {
    if (!installPrompt) {
        installDialog.showModal();
        return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "dismissed")
            announce("You can install later from your browser menu.");
    }
    catch (error) {
        showWarning("install", "The install prompt could not open. Use your browser's Add to Home Screen menu instead.", error);
        installDialog.showModal();
    }
});
let offlineReady = false;
let waitingWorker = null;
let reloadForUpdate = false;
function updateConnection() {
    element("connection", HTMLElement).textContent = !navigator.onLine ? "Offline"
        : offlineReady ? "Offline ready" : "On this device";
}
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
async function registerOffline() {
    if (!("serviceWorker" in navigator)) {
        showWarning("offline", "Offline play is unavailable here. Open this app at an HTTPS address or on localhost.");
        return;
    }
    try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        const offerUpdate = () => {
            waitingWorker = registration.active ? registration.waiting : null;
            updateButton.hidden = waitingWorker === null;
        };
        offerUpdate();
        registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
                if (worker.state === "installed" || worker.state === "activated")
                    offerUpdate();
                if (worker.state === "redundant" && !registration.active) {
                    showWarning("offline", "Offline files could not be downloaded. Stay online and reload to try again.");
                }
            });
        });
        await navigator.serviceWorker.ready;
        offerUpdate();
        offlineReady = true;
        updateConnection();
    }
    catch (error) {
        showWarning("offline", "Offline mode could not start. The game still works in this page; reload while online to try again.", error);
    }
}
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadForUpdate)
            window.location.reload();
    });
}
updateButton.addEventListener("click", () => {
    clock();
    if (!waitingWorker || !save())
        return;
    reloadForUpdate = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
});
render();
save();
if (isWon(session.state))
    announce("You won this deal. Start a new game, or undo a move.");
else if (session.state.moves)
    announce("Welcome back. Your game is right where you left it.");
updateInstallButton();
updateConnection();
void registerOffline();
