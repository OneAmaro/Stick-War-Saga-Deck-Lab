import { simulate } from "./simulator.js";
import { validateDeck } from "./validator.js";
import {   loadDecks,   saveDeck,   exportDeck,   importDeck,   saveActiveDeck,   loadActiveDeck } from "./storage.js";

const modeSelect = document.getElementById("modeSelect");
const deckSlots = document.getElementById("deckSlots");
const statsDiv = document.getElementById("stats");
const timeSlider = document.getElementById("timeSlider");
const presetList = document.getElementById("presetList");
const teamSelect = document.getElementById("teamSelect");
const APP_MODE = "deck"; // "deck" | "simulate"
const TEAM_KEY = "sws_team_size";
const USER_DECKS_KEY = "sws_user_decks";
const deckNameInput = document.getElementById("deckNameInput");
const ACTIVE_DECK_NAME_KEY = "sws_active_deck_name";
const UNIT_OVERRIDES_KEY = "sws_unit_overrides";

let DATA = {};
let activeDeck = {};
let activeUserDeckIndex = null;
let editorCard = null;
let editorType = null; // "unit" | "spell" | "enchant"
let BASE_DATA = {};

async function loadData() {
  const files = ["units", "spells", "enchantments", "modes", "rules", "presets", "teams"];
  for (const f of files) {
    DATA[f] = await fetch(`data/${f}.json`).then(r => r.json());
if (!BASE_DATA[f]) {
  BASE_DATA[f] = JSON.parse(JSON.stringify(DATA[f]));
}

const overrides = loadUnitOverrides();

if (f === "units") {
  Object.entries(overrides).forEach(([name, patch]) => {
    if (DATA.units[name]) {
      DATA.units[name] = { ...DATA.units[name], ...patch };
    }
  });
}

if (f === "spells") {
  DATA.spells = DATA.spells.map(spell =>
    overrides[spell.name]
      ? { ...spell, ...overrides[spell.name] }
      : spell
  );
}

if (f === "enchantments") {
  DATA.enchantments = DATA.enchantments.map(enchant =>
    overrides[enchant.name]
      ? { ...enchant, ...overrides[enchant.name] }
      : enchant
  );
}
  }
}

function renderModes() {
  for (const m of DATA.modes) {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.name;
    modeSelect.appendChild(o);
  }
}

function renderPresets() {
  const activeName = localStorage.getItem(ACTIVE_DECK_NAME_KEY);
  presetList.innerHTML = "";

  // ---- Presets (read-only) ----
  DATA.presets.forEach((p, index) => {
  const row = document.createElement("div");
  row.textContent = `${p.name} (${p.mode})`;
  if (activeUserDeckIndex === null && activeName === p.name) {
  row.classList.add("deck-active");
}

  const remove = document.createElement("button");
  remove.textContent = "✕";
  remove.onclick = e => {
    e.stopPropagation();
    DATA.presets.splice(index, 1);
    renderPresets();
  };

  row.onclick = () => {
  activeUserDeckIndex = null;   // ← THIS LINE, FIRST

  activeDeck = {};
  p.deck.forEach(unit => {
    activeDeck[unit] = 1;
  });

  deckNameInput.value = p.name;
  localStorage.setItem(ACTIVE_DECK_NAME_KEY, p.name);

  saveActiveDeck(activeDeck);
  renderDeck();
  renderUnitPool();
  renderDeckStats();
  renderPresets();
};

  row.appendChild(remove);
  presetList.appendChild(row);
});

  // ---- User decks ----
  const userDecks = loadUserDecks();

  userDecks.forEach((d, index) => {
    const row = document.createElement("div");
    row.textContent = d.name;
if (activeUserDeckIndex === index) {
  row.classList.add("deck-active");
}
    const remove = document.createElement("button");
    remove.textContent = "✕";
    remove.onclick = e => {
      e.stopPropagation();
      userDecks.splice(index, 1);
      saveUserDecks(userDecks);
      renderPresets();
    };

    row.onclick = () => {
  activeUserDeckIndex = index;   // ← THIS IS KEY

  localStorage.setItem(ACTIVE_DECK_NAME_KEY, d.name);
  deckNameInput.value = d.name;

  activeDeck = JSON.parse(JSON.stringify(d.deck));
  saveActiveDeck(activeDeck);

  renderDeck();
  renderUnitPool();
  renderDeckStats();
  renderPresets();
};

    row.appendChild(remove);
    presetList.appendChild(row);
  });
}
function renderUnitPool() {
  const unitList = document.getElementById("unitList");
  unitList.innerHTML = "";

  Object.keys(DATA.units).forEach(unit => {
    if (activeDeck[unit]) return;

    const d = document.createElement("div");
d.textContent = unit;
d.oncontextmenu = e => {
  e.preventDefault();
  openEditor(unit, "unit");
};

const q = DATA.units[unit]?.queue;
if (q) d.classList.add(`queue-${q}`);

    d.onclick = () => {
      if (Object.keys(activeDeck).length >= DATA.rules.deckSize) return;

      activeDeck[unit] = 1;
      saveActiveDeck(activeDeck);
      renderDeck();
      renderUnitPool();
      APP_MODE === "simulate" ? updateSim() : renderDeckStats();
    };

    unitList.appendChild(d);
  });
}

function renderSpells() {
  const spellList = document.getElementById("spellList");
  spellList.innerHTML = "";

  DATA.spells.forEach(spell => {
    if (activeDeck[spell.name]) return;

    const d = document.createElement("div");
d.textContent = spell.name;
d.classList.add("type-spell");
d.oncontextmenu = e => {
  e.preventDefault();
  openEditor(spell.name, "spell");
};

    d.onclick = () => {
      if (Object.keys(activeDeck).length >= DATA.rules.deckSize) return;

      activeDeck[spell.name] = 1;
      saveActiveDeck(activeDeck);
      renderDeck();
      renderSpells();
      renderDeckStats();
    };

    spellList.appendChild(d);
  });
}

function renderEnchantments() {
  const enchantmentList = document.getElementById("enchantmentList");
  enchantmentList.innerHTML = "";

  DATA.enchantments.forEach(enchant => {
    if (activeDeck[enchant.name]) return;

    const d = document.createElement("div");
d.textContent = enchant.name;
d.oncontextmenu = e => {
  e.preventDefault();
  openEditor(enchant.name, "enchant");
};

if (enchant.type === "mythic") {
  d.classList.add("type-mythic");
} else {
  d.classList.add("type-enchantment");
}

    d.onclick = () => {
      if (Object.keys(activeDeck).length >= DATA.rules.deckSize) return;

      activeDeck[enchant.name] = 1;
      saveActiveDeck(activeDeck);
      renderDeck();
      renderEnchantments();
      renderDeckStats();
    };

    enchantmentList.appendChild(d);
  });
}

function renderDeck() {
  deckSlots.innerHTML = "";

  Object.entries(activeDeck).forEach(([unit, count]) => {
    const row = document.createElement("div");
row.textContent = `${unit} x${count}`;
row.oncontextmenu = e => {
  e.preventDefault();
  openEditor(unit, "unit");
};
const u = DATA.units[unit];
if (u?.queue) row.classList.add(`queue-${u.queue}`);

const ench = DATA.enchantments.find(e => e.name === unit);
if (ench) {
  row.classList.add(
    ench.type === "mythic" ? "type-mythic" : "type-enchantment"
  );
}

const spell = DATA.spells.find(s => s.name === unit);
if (spell) row.classList.add("type-spell");
    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = e => {
      e.stopPropagation();
      activeDeck[unit]++;
      saveActiveDeck(activeDeck);
      renderDeck();
      renderDeckStats();
    };

    const minus = document.createElement("button");
    minus.textContent = "-";
    minus.onclick = e => {
      e.stopPropagation();
      activeDeck[unit]--;
      if (activeDeck[unit] <= 0) delete activeDeck[unit];
      saveActiveDeck(activeDeck);
      renderDeck();
renderUnitPool();
renderSpells();
renderEnchantments();
renderDeckStats();
    };

    row.appendChild(plus);
    row.appendChild(minus);
    deckSlots.appendChild(row);
  });
}

function renderDeckStats() {
  if (!DATA.rules || !DATA.units) return;

  let dps = 0;
let goldCost = 0;
let crystalCost = 0;
let population = 0;
const status = new Set();
const counts = {};
const breakdown = {};

  Object.entries(activeDeck).forEach(([card, count]) => {
  const u = DATA.units[card];
  if (!u) return;

  dps += (u.dps || 0) * count;
  goldCost += (u.gold || 0) * count;
  crystalCost += (u.crystal || 0) * count;
  population += (u.population || 0) * count;
  (u.status || []).forEach(s => status.add(s));
  counts[u.queue] = (counts[u.queue] || 0) + count;

if (!breakdown[u.queue]) breakdown[u.queue] = {};
breakdown[u.queue][card] = count;
});

const modeId = modeSelect.value || DATA.modes[0]?.id;
const mode = DATA.modes.find(m => m.id === modeId);
const teamId = teamSelect?.value || "1v1";
const team = DATA.teams?.find(t => t.id === teamId);
const popCap = team?.populationCap || 100;
const validity = validateDeck(activeDeck, DATA.rules, DATA.units);
const unitStatusCounts = {};
const deckTraitCounts = {};

Object.entries(activeDeck).forEach(([card, count]) => {
  // unit-only statuses → Status Coverage
  const unit = DATA.units[card];
  if (unit?.status) {
    unit.status.forEach(s => {
      unitStatusCounts[s] = (unitStatusCounts[s] || 0) + count;
    });
  }

  // all sources → Deck Traits
  const sources = [
    DATA.units[card],
    DATA.spells?.find(s => s.name === card),
    DATA.enchantments?.find(e => e.name === card)
  ].filter(Boolean);

  sources.forEach(src => {
    (src.status || []).forEach(s => {
      deckTraitCounts[s] = (deckTraitCounts[s] || 0) + count;
    });
  });
});

const STATUS_LABELS = {
  poison: "Poison",
  burn: "Burn",
  volt: "Volt",
  heal: "Healing",
  lifesteal: "Lifesteal",
  summon: "Summons",
  economy: "Economy scaling",
  slow: "Slow",
  shield: "Projectile defense",
  aoe: "AoE damage",
  ranged: "Ranged pressure",
  mobility: "Mobility",
  buff: "Buff",
control: "Control"
};

const statusCoverageHtml = Object.keys(unitStatusCounts).sort()
  .map(k => {
    const label = STATUS_LABELS[k];
    if (!label) return null;
    return `<span class="status-item status-${k}">${label}</span>`;
  })
  .filter(Boolean)
  .join(", ");

const deckTraitsHtml = Object.keys(deckTraitCounts).sort()
  .map(k => {
    const label = STATUS_LABELS[k];
    if (!label) return null;
    return `<span class="status-item status-${k}">${label}</span>`;
  })
  .filter(Boolean)
  .join(", ");
  
  statsDiv.innerHTML = `
  <details class="stat-dps">
  <summary>Base DPS (attack only): ${dps}</summary>

  ${Object.entries(breakdown).map(([queue, units]) => {
    const qdps = Object.entries(units)
      .reduce((sum, [u, c]) => sum + DATA.units[u].dps * c, 0);

    return `
      <details>
        <summary>${queue}: ${qdps}</summary>

        ${Object.entries(units).map(([unit, c]) => `
          <div class="queue-${DATA.units[unit].queue}">
            ${unit} ×${c} · ${(DATA.units[unit].dps * c).toFixed(2)}
          </div>
        `).join("")}

      </details>
    `;
  }).join("")}

</details>
<div style="font-size:12px; opacity:0.7; margin-bottom:8px;">
  Status damage (poison, burn, etc.) is not included in base DPS.
</div>

  ${goldCost > 0 ? `
<details class="stat-gold">
  <summary>Gold Cost: ${goldCost}</summary>

  ${Object.entries(breakdown)
    .map(([queue, units]) => {
      const qgold = Object.entries(units)
        .reduce((sum, [u, c]) => sum + DATA.units[u].gold * c, 0);

      if (qgold === 0) return null;

      return `
        <details>
          <summary>${queue}: ${qgold}</summary>
          ${Object.entries(units)
            .map(([unit, c]) => {
              const val = DATA.units[unit].gold * c;
              if (val === 0) return null;
              return `
                <div class="queue-${DATA.units[unit].queue}">
                  ${unit} ×${c} · ${val}
                </div>
              `;
            })
            .filter(Boolean)
            .join("")}
        </details>
      `;
    })
    .filter(Boolean)
    .join("")}

</details>
` : ""}

  ${crystalCost > 0 ? `
<details class="stat-crystal">
  <summary>Crystal Cost: ${crystalCost}</summary>

  ${Object.entries(breakdown)
    .map(([queue, units]) => {
      const qcrystal = Object.entries(units)
        .reduce((sum, [u, c]) => sum + DATA.units[u].crystal * c, 0);

      if (qcrystal === 0) return null;

      return `
        <details>
          <summary>${queue}: ${qcrystal}</summary>
          ${Object.entries(units)
            .map(([unit, c]) => {
              const val = DATA.units[unit].crystal * c;
              if (val === 0) return null;
              return `
                <div class="queue-${DATA.units[unit].queue}">
                  ${unit} ×${c} · ${val}
                </div>
              `;
            })
            .filter(Boolean)
            .join("")}
        </details>
      `;
    })
    .filter(Boolean)
    .join("")}

</details>
` : ""}

  <details class="stat-population ${population > popCap ? "stat-illegal" : ""}">
  <summary>Population: ${population} / ${popCap}</summary>

  ${Object.entries(breakdown).map(([queue, units]) => {
    const qpop = Object.entries(units)
      .reduce((sum, [u, c]) => sum + DATA.units[u].population * c, 0);

    return `
      <details>
        <summary>${queue}: ${qpop}</summary>
        ${Object.entries(units).map(([unit, c]) => `
          <div class="queue-${DATA.units[unit].queue}">
            ${unit} ×${c} · ${DATA.units[unit].population * c}
          </div>
        `).join("")}
      </details>
    `;
  }).join("")}

</details>

 <details class="stat-status">
  <summary>Status Coverage: ${statusCoverageHtml || "None"}</summary>

  ${Object.keys(unitStatusCounts).map(statusKey => {
    const label = STATUS_LABELS[statusKey] || statusKey;

    const rows = Object.entries(breakdown)
      .flatMap(([queue, units]) =>
        Object.entries(units)
          .filter(([unit]) =>
            (DATA.units[unit].status || []).includes(statusKey)
          )
          .map(([unit, count]) => `
            <div class="queue-${DATA.units[unit].queue}">
              ${unit} ×${count}
            </div>
          `)
      );

    if (rows.length === 0) return null;

    return `
      <details>
        <summary>${label}</summary>
        ${rows.join("")}
      </details>
    `;
  }).filter(Boolean).join("")}

</details>

<details class="stat-traits">
  <summary>Deck Traits: ${deckTraitsHtml || "None"}</summary>

  ${Object.keys(deckTraitCounts).map(statusKey => {
    const label = STATUS_LABELS[statusKey] || statusKey;

    const rows = Object.entries(activeDeck)
      .filter(([card]) =>
        (DATA.units[card]?.status || [])
          .concat(DATA.spells.find(s => s.name === card)?.status || [])
          .concat(DATA.enchantments.find(e => e.name === card)?.status || [])
          .includes(statusKey)
      )
      .map(([card, count]) => {
        const q = DATA.units[card]?.queue;
        const cls = q ? `queue-${q}` : "";
        return `<div class="${cls}">${card} ×${count}</div>`;
      });

    if (rows.length === 0) return null;

    return `
      <details>
        <summary>${label}</summary>
        ${rows.join("")}
      </details>
    `;
  }).filter(Boolean).join("")}

</details>

  <div class="${validity.ok ? "stat-legal" : "stat-illegal"}">
  ${validity.ok ? "Deck legal" : validity.error}
</div>
`;
}

function updateSim() {
  return;
  if (APP_MODE !== "simulate") return;

  if (!DATA.rules || !DATA.modes || !DATA.units) {
    return;
  }

  const mode = modeSelect.value || DATA.modes[0]?.id;
  const time = +timeSlider.value;

  const result = simulate(activeDeck, mode, time, DATA);
  const validity = validateDeck(activeDeck, DATA.rules, DATA.units);

  statsDiv.innerHTML = `
    <div>Time: ${time}s</div>
    <div>Gold: ${result.gold}</div>
    <div>Crystal: ${result.crystal}</div>
    <div>DPS (theoretical): ${result.dps}</div>
    <div>Status Coverage: ${result.status.join(", ")}</div>
    <div class="${validity.ok ? "stat-legal" : "stat-illegal"}">
  ${validity.ok ? "Deck legal" : validity.error}
</div>
  `;
}

function loadUserDecks() {
  return JSON.parse(localStorage.getItem(USER_DECKS_KEY) || "[]");
}

function saveUserDecks(decks) {
  localStorage.setItem(USER_DECKS_KEY, JSON.stringify(decks));
}

function loadUnitOverrides() {
  return JSON.parse(localStorage.getItem(UNIT_OVERRIDES_KEY) || "{}");
}

function saveUnitOverrides(overrides) {
  localStorage.setItem(UNIT_OVERRIDES_KEY, JSON.stringify(overrides));
}
/* 👇 PASTE HERE, AT TOP LEVEL */

function clearUnitOverrides() {
  localStorage.removeItem(UNIT_OVERRIDES_KEY);
  location.reload();
}

function openEditor(name, type) {
  editorCard = name;
  editorType = type;
  const overrides = loadUnitOverrides();
const override = overrides[name] || {};

  const editor = document.getElementById("editor");
  const nameDiv = document.getElementById("editorName");
  const fieldsDiv = document.getElementById("editorFields");

  nameDiv.textContent = name;
  fieldsDiv.innerHTML = "";

  let data;
  if (type === "unit") data = DATA.units[name];
  if (type === "spell") data = DATA.spells.find(s => s.name === name);
  if (type === "enchant") data = DATA.enchantments.find(e => e.name === name);

  if (!data) return;

  if (type === "unit") {
    const base = BASE_DATA.units[name];

fieldsDiv.innerHTML += input("dps", "DPS", override.dps ?? base.dps);
fieldsDiv.innerHTML += input("gold", "Gold", override.gold ?? base.gold);
fieldsDiv.innerHTML += input("crystal", "Crystal", override.crystal ?? base.crystal);
fieldsDiv.innerHTML += input("population", "Population", override.population ?? base.population);
fieldsDiv.innerHTML += input("trainTime", "Train Time", override.trainTime ?? base.trainTime);
  }

  if (type === "spell") {
    const base = BASE_DATA.spells.find(b => b.name === name);
fieldsDiv.innerHTML += input("cooldown", "Cooldown", override.cooldown ?? base.cooldown);
  }

  const baseStatus =
  editorType === "unit"
    ? BASE_DATA.units[name].status
    : editorType === "spell"
      ? BASE_DATA.spells.find(b => b.name === name).status
      : BASE_DATA.enchantments.find(b => b.name === name).status;

fieldsDiv.innerHTML += input(
  "status",
  "Status (comma separated)",
  (override.status ?? baseStatus ?? []).join(", ")
);

  editor.style.display = "block";
}

function input(key, label, value) {
  return `
    <label>
      ${label}
      <input data-key="${key}" value="${value ?? ""}" />
    </label>
  `;
}

document.getElementById("editorApply").onclick = () => {
  const overrides = loadUnitOverrides();
  const fields = document.querySelectorAll("#editorFields input");
  const patch = {};

  fields.forEach(f => {
  const key = f.dataset.key;
  const raw = f.value.trim();

  // empty field → revert to default (do not override)
  if (raw === "") return;

  let val;
  if (key === "status") {
    val = raw.split(",").map(s => s.trim()).filter(Boolean);
  } else {
    val = Number(raw);
    if (Number.isNaN(val)) return;
  }

  patch[key] = val;
});

if (Object.keys(patch).length === 0) {
  delete overrides[editorCard];
} else {
  overrides[editorCard] = patch;
}
  saveUnitOverrides(overrides);

  // apply patch live
  if (editorType === "unit" && BASE_DATA.units[editorCard]) {
  DATA.units[editorCard] = {
    ...BASE_DATA.units[editorCard],
    ...(overrides[editorCard] || {})
  };
}

if (editorType === "spell") {
  DATA.spells = DATA.spells.map(s =>
    s.name === editorCard
      ? { ...BASE_DATA.spells.find(b => b.name === editorCard), ...(overrides[editorCard] || {}) }
      : s
  );
}

if (editorType === "enchant") {
  DATA.enchantments = DATA.enchantments.map(e =>
    e.name === editorCard
      ? { ...BASE_DATA.enchantments.find(b => b.name === editorCard), ...(overrides[editorCard] || {}) }
      : e
  );
}

  // close editor
  document.getElementById("editor").style.display = "none";
  editorCard = null;
  editorType = null;

  // re-render everything
  renderDeck();
  renderUnitPool();
  renderSpells();
  renderEnchantments();
  renderDeckStats();
};

document.getElementById("editorCancel").onclick = () => {
  document.getElementById("editor").style.display = "none";
  editorCard = null;
  editorType = null;
};

document.getElementById("saveDeck").onclick = () => {
  const decks = loadUserDecks();

  const name = deckNameInput.value.trim() || `My Deck ${decks.length + 1}`;

  decks.push({
    name,
    deck: JSON.parse(JSON.stringify(activeDeck))
  });

  localStorage.setItem(ACTIVE_DECK_NAME_KEY, name);

  saveUserDecks(decks);
  saveActiveDeck(activeDeck);
  renderPresets();
};

document.getElementById("exportDeck").onclick = () => exportDeck(activeDeck);
document.getElementById("importDeck").onclick = async () => {
  activeDeck = await importDeck();
  saveActiveDeck(activeDeck);
  renderDeck();
  renderUnitPool()
  APP_MODE === "simulate" ? updateSim() : renderDeckStats();
};

document.getElementById("editorResetAll").onclick = () => {
  if (!confirm("Reset all custom stat changes and restore default values?")) {
    return;
  }

  localStorage.removeItem(UNIT_OVERRIDES_KEY);

  // reload base data fresh
  loadData().then(() => {
    renderDeck();
    renderUnitPool();
    renderSpells();
    renderEnchantments();
    renderDeckStats();
  });

  document.getElementById("editor").style.display = "none";
  editorCard = null;
  editorType = null;
};

timeSlider.oninput = updateSim;
modeSelect.onchange = updateSim;
teamSelect.onchange = () => {
  localStorage.setItem(TEAM_KEY, teamSelect.value);
  renderDeckStats();
};

deckNameInput.oninput = () => {
  localStorage.setItem(ACTIVE_DECK_NAME_KEY, deckNameInput.value);
};

loadData().then(() => {
  renderModes();
  const savedTeam = localStorage.getItem(TEAM_KEY);
if (savedTeam) {
  teamSelect.value = savedTeam;
}
  modeSelect.value = DATA.modes[0]?.id || "";

  renderPresets();

  const storedActive = loadActiveDeck();
  if (storedActive && Object.keys(storedActive).length) {
  activeDeck = storedActive;
} else if (DATA.presets.length) {
  activeDeck = {};
  DATA.presets[0].deck.forEach(unit => {
    activeDeck[unit] = 1;
  });
  saveActiveDeck(activeDeck);
} else {
  activeDeck = {};
}
const savedName = localStorage.getItem(ACTIVE_DECK_NAME_KEY);
if (savedName) {
  deckNameInput.value = savedName;
}
  renderDeck();
renderUnitPool();
renderSpells();
renderEnchantments();
APP_MODE === "simulate" ? updateSim() : renderDeckStats();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

const resetBtn = document.getElementById("resetApp");

if (resetBtn) {
  
  resetBtn.onclick = async () => {
  if (!confirm("This will clear cached data and reload the app. Continue?")) {
    return;
  }

  // unregister service workers
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      await reg.unregister();
    }
  }

  // clear all caches
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }

  // FULL reload from network (NOT reload())
  location.href = location.href;
};
}