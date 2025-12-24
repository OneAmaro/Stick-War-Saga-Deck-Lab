export function validateDeck(deck, rules, unitsData) {
  const units = Object.keys(deck);

  if (units.length === 0) {
    return { ok: false, error: "Deck must contain at least one miner type" };
  }

  if (units.length > rules.deckSize) {
    return { ok: false, error: "Deck cannot exceed 8 unique units" };
  }

  // Miner OR Enslaved Miner is the ONLY minimum requirement
  if (!units.some(unit => rules.miners.includes(unit))) {
    return { ok: false, error: "Deck requires a Miner" };
  }

// mythic limit enforcement (with boosters)
if (rules.maxMythics && rules.mythics) {
  let allowed = rules.maxMythics;

  if (rules.mythicLimitBoosters) {
    for (const card of units) {
      if (rules.mythicLimitBoosters[card]) {
        allowed += rules.mythicLimitBoosters[card];
      }
    }
  }

  const mythicCount = units.filter(u => rules.mythics.includes(u)).length;

  if (mythicCount > allowed) {
    return {
      ok: false,
      error: `Only ${allowed} Mythic${allowed === 1 ? "" : "s"} allowed`
    };
  }
}

  return { ok: true };
}