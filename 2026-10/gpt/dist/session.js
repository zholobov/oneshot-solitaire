import { applyAction, canFinish, deal, isGameState, isWon, legalMoves } from "./game.js";
export const SAVE_KEY = "pocket-solitaire.save.v1";
export const MAX_UNDO = 200;
export function createSession(initial = deal()) {
    return { version: 1, initial, state: initial, history: [], elapsedMs: 0 };
}
export function advance(session, action) {
    const state = applyAction(session.state, action);
    return state ? { ...session, state, history: [...session.history.slice(1 - MAX_UNDO), session.state] } : null;
}
export function undo(session) {
    const state = session.history.at(-1);
    return state ? { ...session, state, history: session.history.slice(0, -1) } : null;
}
export const restart = (session) => createSession(session.initial);
export function finish(session) {
    if (!canFinish(session.state))
        return null;
    let next = session;
    while (!isWon(next.state)) {
        const move = legalMoves(next.state).find(action => action.to.pile === "foundation");
        if (!move)
            throw new Error("An open board must have a legal move to a suit pile.");
        next = advance(next, move);
    }
    return next;
}
export function encodeSession(session) {
    return JSON.stringify({ ...session, elapsedMs: Math.floor(session.elapsedMs) });
}
export function decodeSession(raw) {
    if (raw.length > 1_000_000)
        throw new Error("The saved game is too large.");
    const value = JSON.parse(raw);
    if (typeof value !== "object" || value === null ||
        !("version" in value) || value.version !== 1 ||
        !("initial" in value) || !isGameState(value.initial) ||
        !("state" in value) || !isGameState(value.state) ||
        !("history" in value) || !Array.isArray(value.history) || value.history.length > MAX_UNDO || !value.history.every(isGameState) ||
        !("elapsedMs" in value) || typeof value.elapsedMs !== "number" || !Number.isSafeInteger(value.elapsedMs) || value.elapsedMs < 0) {
        throw new Error("The saved game is invalid or uses an unsupported version.");
    }
    const { initial, state, history, elapsedMs } = value;
    if (initial.moves !== 0 || initial.stock.length !== 24 || initial.waste.length ||
        initial.foundations.some(pile => pile.length) ||
        initial.tableau.some((pile, index) => pile.length !== index + 1 || pile.some((card, position) => card.faceUp !== (position === index))) ||
        history.some((entry, index) => entry.moves !== state.moves - history.length + index)) {
        throw new Error("The saved deal or undo history is inconsistent.");
    }
    return { version: 1, initial, state, history, elapsedMs };
}
