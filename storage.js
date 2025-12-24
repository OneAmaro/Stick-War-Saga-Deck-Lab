const KEY = "sws_decks";

export function loadDecks() {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}

export function saveDeck(deck) {
  const decks = loadDecks();
  decks.push(deck);
  localStorage.setItem(KEY, JSON.stringify(decks));
}

export function exportDeck(deck) {
  const str = btoa(JSON.stringify(deck));
  navigator.clipboard.writeText(str);
  alert("Deck copied to clipboard");
}

export async function importDeck() {
  const str = prompt("Paste deck code");
  return JSON.parse(atob(str));
}
const ACTIVE_KEY = "sws_active_deck";

export function saveActiveDeck(deck) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(deck));
}

export function loadActiveDeck() {
  return JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
}