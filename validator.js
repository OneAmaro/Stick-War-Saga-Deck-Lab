export function validateDeck(deck, rules, unitsData) {
  const units = Object.keys(deck);

  if (units.length === 0) {
    return { ok: false, error: "Deck must contain at least one miner type" };
  }

  if (units.length > rules.deckSize) {
  return {
    ok: false,
    error: `Deck cannot exceed ${rules.deckSize} cards`
  };
}

  // Miner requirement
  if (!units.some(u => rules.miners.includes(u))) {
    return { ok: false, error: "Deck requires a Miner" };
  }

// Enforce unique non-unit cards (Generals, Spells, Enchantments, Mythics)
for (const [card, count] of Object.entries(deck)) {
  if (count <= 1) continue;

  const unit = unitsData[card];
  const isGeneral = unit?.queue === "General";

  const isMythic = rules.mythics?.includes(card);

  // spells & enchantments are NOT in unitsData
  const isSpell = !unit && rules.spellsData?.includes?.(card);
  const isEnchantment = !unit && rules.enchantmentsData?.includes?.(card);

  if (isGeneral || isSpell || isEnchantment || isMythic) {
    return {
      ok: false,
      error: `${card} cannot be duplicated`
    };
  }
}

  // Mythic limit (with boosters)
  if (rules.maxMythics && rules.mythics) {
    let allowed = rules.maxMythics;

    if (rules.mythicLimitBoosters) {
      for (const u of units) {
        if (rules.mythicLimitBoosters[u]) {
          allowed += rules.mythicLimitBoosters[u];
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