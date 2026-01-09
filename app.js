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
const DECK_SIZE_KEY = "sws_deck_size";
const UPGRADES_KEY = "sws_upgrades";
const TOWER_CONTROL_KEY = "sws_tower_control";

let DATA = {};
let activeDeck = {};
let activeCardEffects = {};
// ===== Tower / Upgrade State =====
let towerControl = {
  controlled: true // default ON for theorycrafting
};

let upgrades = {
  barracks: 0,
  forge: 0,
  armory: 0,
  temple: 0,
  bastion: 0
};

const UPGRADE_CONFIG_KEY = "sws_upgrade_config";

let UPGRADE_CONFIG = {
  barracks: { trainTime: 0.20 },
  forge: { dps: 0.10 },
  armory: { health: 0.10 },
  temple: { cooldown: 0.20 },
  bastion: { lvl1: 0.30, lvl2: 0.45 }
};

function loadUpgradeConfig() {
  return JSON.parse(localStorage.getItem(UPGRADE_CONFIG_KEY) || "null");
}

function saveUpgradeConfig() {
  localStorage.setItem(UPGRADE_CONFIG_KEY, JSON.stringify(UPGRADE_CONFIG));
}

function totalUpgrades(u) {
  return Object.values(u).reduce((a, b) => a + b, 0);
}
function getUpgradeMultipliers() {
  return {
    dps: 1 + UPGRADE_CONFIG.forge.dps * upgrades.forge,
    health: 1 + UPGRADE_CONFIG.armory.health * upgrades.armory,
    trainTime: 1 - UPGRADE_CONFIG.barracks.trainTime * upgrades.barracks,
    cooldown: 1 - UPGRADE_CONFIG.temple.cooldown * upgrades.temple,
    mining:
      upgrades.bastion === 1 ? 1 + UPGRADE_CONFIG.bastion.lvl1 :
      upgrades.bastion === 2 ? 1 + UPGRADE_CONFIG.bastion.lvl2 : 1
  };
}
function loadUpgrades() {
  return JSON.parse(localStorage.getItem(UPGRADES_KEY) || "null");
}

function saveUpgrades() {
  localStorage.setItem(UPGRADES_KEY, JSON.stringify(upgrades));
}

function loadTowerControl() {
  return JSON.parse(localStorage.getItem(TOWER_CONTROL_KEY) || "null");
}

function saveTowerControl() {
  localStorage.setItem(TOWER_CONTROL_KEY, JSON.stringify(towerControl));
}
function initCardEffectsFromDeck() {
  // Preserve existing toggle states
  const prev = { ...activeCardEffects };
  activeCardEffects = {};


  Object.keys(activeDeck).forEach(card => {
    const spell = DATA.spells.find(s => s.name === card);
    const enchant = DATA.enchantments.find(e => e.name === card);

    // Only cards with effects get toggles
    if (spell?.effects || enchant?.effects || card === "Rage") {
      activeCardEffects[card] = prev[card] ?? false;
    }
  });
}
let activeUserDeckIndex = null;
let editorCard = null;
let editorType = null; // "unit" | "spell" | "enchant"
let BASE_DATA = {};
function renderUpgrades() {
  const container = document.getElementById("upgradePanel");
  if (!container) return;

  const used = totalUpgrades(upgrades);

  container.innerHTML = `
    <h2>Upgrades</h2>

    <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      <input type="checkbox" id="towerControlledToggle" ${towerControl.controlled ? "checked" : ""}>
      Tower Controlled
    </label>

    ${Object.entries(upgrades).map(([key, level]) => `
  <div
    data-upgrade="${key}"
    style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
  >
        <span style="text-transform:capitalize;">${key}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <button data-upgrade="${key}" data-dir="-">−</button>
          <span>${level}</span>
          <button data-upgrade="${key}" data-dir="+">+</button>
        </div>
      </div>
    `).join("")}

    <div style="margin-top:8px;font-size:12px;opacity:0.8;">
      Upgrades used: ${used} / 5
    </div>
  `;

// enable editing upgrade config via right-click / long-press
container.querySelectorAll("[data-upgrade]").forEach(row => {
  row.oncontextmenu = e => {
    e.preventDefault();
    openEditor(row.dataset.upgrade, "upgrade");
  };
});

  // tower control toggle
  document.getElementById("towerControlledToggle").onchange = e => {
    towerControl.controlled = e.target.checked;
    saveTowerControl();
    renderUpgrades();
  };

  // upgrade buttons
  container.querySelectorAll("button[data-upgrade]").forEach(btn => {
    const key = btn.dataset.upgrade;
    const dir = btn.dataset.dir;

    btn.onclick = () => {
      if (dir === "+") {
        if (!towerControl.controlled) return;
        if (upgrades[key] >= 2) return;
        if (totalUpgrades(upgrades) >= 5) return;
        upgrades[key]++;
      } else {
        if (upgrades[key] <= 0) return;
        upgrades[key]--;
      }

      saveUpgrades();
      renderUpgrades();
     renderDeckStats(); 
    };

    // disable illegal +
    if (
      dir === "+" &&
      (!towerControl.controlled ||
       upgrades[key] >= 2 ||
       totalUpgrades(upgrades) >= 5)
    ) {
      btn.disabled = true;
    }
  });
}
function renderSkillWeb() {
  const container = document.getElementById("skillWeb");
  if (!container) return;

  const skills = computeDeckSkills(activeDeck, DATA.units);

  const values = [
    skills.damage,
    skills.durability,
    skills.control,
    skills.mobility,
    skills.range,
    skills.economy
  ];

  const labels = [
    "Damage",
    "Durability",
    "Control",
    "Mobility",
    "Range",
    "Economy"
  ];

  
  const size = 200;
  const center = size / 2;
  const radius = center - 20;
  const caps = {
  damage: 200,      // expected high DPS deck
  durability: 4000, // expected high HP deck
  control: 10,
  mobility: 10,
  range: 10,
  economy: 10
};

const normalized = [
  Math.min(skills.damage / caps.damage, 1),
  Math.min(skills.durability / caps.durability, 1),
  Math.min(skills.control / caps.control, 1),
  Math.min(skills.mobility / caps.mobility, 1),
  Math.min(skills.range / caps.range, 1),
  Math.min(skills.economy / caps.economy, 1)
];
  const points = normalized.map((v, i) => {
    const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    const r = v * radius;
    return [
      center + Math.cos(angle) * r,
      center + Math.sin(angle) * r
    ];
  });

  const polygon = points.map(p => p.join(",")).join(" ");

  container.innerHTML = `
    <svg width="${size}" height="${size}">
      ${labels.map((l, i) => {
        const angle = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
        const x = center + Math.cos(angle) * (radius + 12);
        const y = center + Math.sin(angle) * (radius + 12);
        return `<text x="${x}" y="${y}" font-size="10" text-anchor="middle" fill="#e6faff">${l}</text>`;
      }).join("")}

      <polygon
        points="${polygon}"
        fill="rgba(0,200,255,0.4)"
        stroke="#00c8ff"
        stroke-width="2"
      />
    </svg>
  `;
}
function computeDeckSkills(deck, units) {
  let damage = 0;
  let durability = 0;
  let control = 0;
  let mobility = 0;
  let range = 0;
  let economy = 0;

  const mult = getUpgradeMultipliers();

  Object.entries(deck).forEach(([name, count]) => {
    const u = units[name];
    if (!u) return;

    const unitDps = (u.dps || 0) * mult.dps;
    const unitHp = (u.health || 0) * mult.health;

    damage += unitDps * count;

    if (activeCardEffects["Rage"] && u.queue === "Light") {
      damage += unitDps * count * 0.25;
    }

    durability += unitHp * count;

    (u.traits || []).forEach(t => {
      if (t === "control") control += count;
      if (t === "mobility") mobility += count;
      if (t === "ranged") range += count;
      if (t === "economy") economy += count * mult.mining;
    });
  });

  return {
    damage,
    durability,
    control,
    mobility,
    range,
    economy
  };
}
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
  initCardEffectsFromDeck();
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
  initCardEffectsFromDeck();

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
      initCardEffectsFromDeck();
      renderDeck();
      renderUnitPool();
      APP_MODE === "simulate" ? updateSim() : renderDeckStats();
    };

    unitList.appendChild(d);
  });
  updateDeckCount();
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
  activeCardEffects[spell.name] = false;
  saveActiveDeck(activeDeck);
  initCardEffectsFromDeck();
  renderDeck();
  renderSpells();
  renderDeckStats();
};

    spellList.appendChild(d);
  });
  updateDeckCount();
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
      initCardEffectsFromDeck();
      renderDeck();
      renderEnchantments();
      renderDeckStats();
    };

    enchantmentList.appendChild(d);
  });
  updateDeckCount();
}

function renderDeck() {
  deckSlots.innerHTML = "";

  // 🔒 Normalize & sanitize deck shape
  if (Array.isArray(activeDeck)) {
    const normalized = {};
    activeDeck.forEach(card => {
      if (typeof card === "string" && card) {
        normalized[card] = (normalized[card] || 0) + 1;
      }
    });
    activeDeck = normalized;
  }

  // 🧹 Remove invalid keys that may already be stored
  Object.keys(activeDeck).forEach(key => {
    if (!key || key === "null" || key === "undefined") {
      delete activeDeck[key];
    }
  });

  saveActiveDeck(activeDeck);
  

  Object.entries(activeDeck).forEach(([unit, count]) => {
    

  const row = document.createElement("div");
  row.oncontextmenu = e => {
  e.preventDefault();

  if (DATA.units[unit]) {
    openEditor(unit, "unit");
  } else if (DATA.spells.find(s => s.name === unit)) {
    openEditor(unit, "spell");
  } else if (DATA.enchantments.find(e => e.name === unit)) {
    openEditor(unit, "enchant");
  }
};
row.style.display = "flex";
row.style.alignItems = "center";
row.style.justifyContent = "space-between";
row.style.gap = "6px";

// LEFT SIDE (remove + name)
const left = document.createElement("div");
left.style.display = "flex";
left.style.alignItems = "center";
left.style.gap = "6px";

const remove = document.createElement("button");
remove.textContent = "✕";
remove.onclick = e => {
  e.stopPropagation();
  delete activeDeck[unit];
  delete activeCardEffects[unit];
  saveActiveDeck(activeDeck);
  renderDeck();
  renderUnitPool();
  renderSpells();
  renderEnchantments();
  renderDeckStats();
};

const label = document.createElement("span");
label.textContent = unit;

left.appendChild(remove);
left.appendChild(label);

  // 🚫 NON-UNITS (spells, enchantments, mythics)
if (!DATA.units[unit]) {
  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.alignItems = "center";
  controls.style.gap = "6px";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = !!activeCardEffects[unit];

  toggle.onchange = e => {
    activeCardEffects[unit] = e.target.checked;
    renderDeckStats();
  };

  controls.appendChild(toggle);

  row.appendChild(left);
row.appendChild(controls);
deckSlots.appendChild(row);
return;
}

  // ✅ UNITS ONLY BELOW THIS POINT

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.alignItems = "center";
  controls.style.gap = "6px";

  const minus = document.createElement("button");
  minus.textContent = "-";
  minus.onclick = e => {
    e.stopPropagation();
    activeDeck[unit]--;
    if (activeDeck[unit] <= 0) delete activeDeck[unit];
    saveActiveDeck(activeDeck);
    initCardEffectsFromDeck();
    renderDeck();
    renderUnitPool();
    renderSpells();
    renderEnchantments();
    renderDeckStats();
  };

  const countSpan = document.createElement("span");
  countSpan.textContent = `× ${count}`;
  countSpan.style.minWidth = "48px";
  countSpan.style.textAlign = "center";

  const plus = document.createElement("button");
  plus.textContent = "+";
  plus.onclick = e => {
    e.stopPropagation();
    activeDeck[unit]++;
    saveActiveDeck(activeDeck);
    initCardEffectsFromDeck();
    renderDeck();
    renderDeckStats();
  };

  controls.appendChild(minus);
  controls.appendChild(countSpan);
  controls.appendChild(plus);

  row.appendChild(left);
row.appendChild(controls);
deckSlots.appendChild(row);
});
  updateDeckCount();
}

function getOpenDetails(container) {
  return Array.from(container.children)
    .filter(el => el.tagName === "DETAILS" && el.open)
    .map(el => el.dataset.key)
    .filter(Boolean);
}

function restoreOpenDetails(container, openKeys) {
  Array.from(container.children).forEach(el => {
    if (el.tagName === "DETAILS" && openKeys.includes(el.dataset.key)) {
      el.open = true;
    }
  });
}

function renderDeckStats() {
  if (!DATA.rules || !DATA.units) return;

  const openDetails = getOpenDetails(statsDiv);

  let dps = 0;
let dpsVsLight = 0;
let dpsVsHeavy = 0;
let goldCost = 0;
let crystalCost = 0;
let population = 0;
let totalHP = 0;

const status = new Set();
const counts = {};
const breakdown = {};

  Object.entries(activeDeck).forEach(([card, count]) => {
  const u = DATA.units[card];
if (!u) return;

const mult = getUpgradeMultipliers();

const hp = (u.health || 0) * mult.health;
totalHP += hp * count;

const base = (u.dps || 0) * mult.dps;
const trainTime = (u.trainTime || 0) * mult.trainTime;
const vsLight = getBonusDps(u, "light");
const vsHeavy = getBonusDps(u, "heavy");

dps += base * count;
dpsVsLight += vsLight * count;
dpsVsHeavy += vsHeavy * count;
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
const validity = validateDeck(
  activeDeck,
  {
    ...DATA.rules,
    spellsData: DATA.spells.map(s => s.name),
    enchantmentsData: DATA.enchantments.map(e => e.name)
  },
  DATA.units
);
const unitStatusCounts = {};
const deckTraitCounts = {};

const STATUS_EFFECTS = new Set([
  "poison",
  "burn",
  "volt",
  "heal",
  "summon",
  "slow",
  "shield",
  "lifesteal"
]);

const TRAITS = new Set([
  "aoe",
  "ranged",
  "mobility",
  "control",
  "economy",
  "buff",
  "training",
  "defense"
]);

Object.entries(activeDeck).forEach(([card, count]) => {
  // unit-only statuses → Status Coverage
  const unit = DATA.units[card];


  // all sources → Deck Traits
  const sources = [
    DATA.units[card],
    DATA.spells?.find(s => s.name === card),
    DATA.enchantments?.find(e => e.name === card)
  ].filter(Boolean);

  sources.forEach(src => {
  // Status Coverage (mechanics)
(src.status || []).forEach(s => {
  if (STATUS_EFFECTS.has(s)) {
    unitStatusCounts[s] = (unitStatusCounts[s] || 0) + count;
  }
});

// Deck Traits (properties)
(src.traits || []).forEach(t => {
  deckTraitCounts[t] = (deckTraitCounts[t] || 0) + count;
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
  
  <details class="stat-hp" data-key="hp">
  <summary>HP: ${totalHP}</summary>

  ${Object.entries(breakdown).map(([queue, units]) => {
    const qhp = Object.entries(units)
      .reduce((sum, [u, c]) => sum + (DATA.units[u].health || 0) * c, 0);

    if (qhp === 0) return "";

    return `
      <details>
        <summary>${queue} — HP ${qhp}</summary>
        ${Object.entries(units).map(([unit, c]) => `
          <div class="queue-${DATA.units[unit].queue}">
            ${unit} ×${c} · ${(DATA.units[unit].health || 0) * c}
          </div>
        `).join("")}
      </details>
    `;
  }).join("")}

</details>
  
  <details class="stat-dps" data-key="base-dps">
  <summary>
  Base DPS: ${dps} |
  vs Light: ${dpsVsLight} |
  vs Heavy: ${dpsVsHeavy}
</summary>

  ${Object.entries(breakdown).map(([queue, units]) => {
    const qBase = Object.entries(units)
  .reduce((sum, [u, c]) => sum + (DATA.units[u].dps || 0) * c, 0);

const qVsLight = Object.entries(units)
  .reduce((sum, [u, c]) => sum + getDpsVs(DATA.units[u], "light") * c, 0);

const qVsHeavy = Object.entries(units)
  .reduce((sum, [u, c]) => sum + getDpsVs(DATA.units[u], "heavy") * c, 0);

    return `
<details data-key="queue-${queue}">
        <summary>
  ${queue} — DPS ${qBase}
  · vs Light ${qVsLight}
  · vs Heavy ${qVsHeavy}
</summary>

        ${Object.entries(units).map(([unit, c]) => `
          <div class="queue-${DATA.units[unit].queue}">
            ${unit} ×${c} · ${(DATA.units[unit].dps * c)}
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
<details class="stat-gold" data-key="gold">
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
<details class="stat-crystal" data-key="crystal">
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

<details class="stat-cooldown" data-key="cooldown">
  <summary>
    Cooldowns: ${Math.round((1 - getUpgradeMultipliers().cooldown) * 100)}% faster
  </summary>

  ${Object.entries(activeDeck)
    .filter(([card]) => DATA.spells.find(s => s.name === card))
    .map(([card]) => {
      const spell = DATA.spells.find(s => s.name === card);
      if (!spell?.cooldown) return "";
      const effective = spell.cooldown * getUpgradeMultipliers().cooldown;
      return `
        <div class="type-spell">
          ${card} · ${effective.toFixed(1)}s
        </div>
      `;
    }).join("")}

</details>

<details class="stat-mining" data-key="mining">
  <summary>
    Mining Efficiency: +${Math.round((getUpgradeMultipliers().mining - 1) * 100)}%
  </summary>

  <div style="opacity:0.8;font-size:12px;">
    Applies to miners and tower-related effects.
  </div>
</details>

<details class="stat-training" data-key="training">
  <summary>
    Training Speed: ${Math.round((1 - getUpgradeMultipliers().trainTime) * 100)}% faster
  </summary>

  ${Object.entries(breakdown).map(([queue, units]) => {
    const qTime = Object.entries(units)
      .reduce((sum, [u, c]) => {
        const unit = DATA.units[u];
        if (!unit?.trainTime) return sum;
        return sum + unit.trainTime * getUpgradeMultipliers().trainTime * c;
      }, 0);

    if (qTime === 0) return "";

    return `
      <details>
        <summary>${queue}: ${qTime.toFixed(1)}s total</summary>
        ${Object.entries(units).map(([unitName, c]) => {
          const unit = DATA.units[unitName];
          if (!unit?.trainTime) return "";
          const t = unit.trainTime * getUpgradeMultipliers().trainTime;
          return `
            <div class="queue-${unit.queue}">
              ${unitName} ×${c} · ${t.toFixed(1)}s
            </div>
          `;
        }).join("")}
      </details>
    `;
  }).join("")}

</details>
  <details class="stat-population ${population > popCap ? "stat-illegal" : ""}" data-key="population">
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

 <details class="stat-status" data-key="status">
  <summary>Status Coverage: ${statusCoverageHtml || "None"}</summary>

  ${Object.keys(unitStatusCounts).map(statusKey => {
    const label = STATUS_LABELS[statusKey] || statusKey;

    const rows = [
  ...Object.entries(activeDeck)
    .filter(([card]) =>
      (DATA.units[card]?.status || []).includes(statusKey)
    )
    .map(([card, count]) => `
      <div class="queue-${DATA.units[card].queue}">
        ${card} ×${count}
      </div>
    `),

  ...Object.entries(activeDeck)
    .filter(([card]) =>
      (DATA.spells.find(s => s.name === card)?.status || []).includes(statusKey)
    )
    .map(([card]) => `
      <div class="type-spell">
        ${card}
      </div>
    `),

  ...Object.entries(activeDeck)
    .filter(([card]) =>
      (DATA.enchantments.find(e => e.name === card)?.status || []).includes(statusKey)
    )
    .map(([card]) => `
      <div class="type-enchantment">
        ${card}
      </div>
    `)
];

    if (rows.length === 0) return null;

    return `
      <details>
        <summary>${label}</summary>
        ${rows.join("")}
      </details>
    `;
  }).filter(Boolean).join("")}

</details>

<details class="stat-traits" data-key="traits">
  <summary>Deck Traits: ${deckTraitsHtml || "None"}</summary>

  ${Object.keys(deckTraitCounts).map(statusKey => {
    const label = STATUS_LABELS[statusKey] || statusKey;

    const rows = Object.entries(activeDeck)
      .filter(([card]) =>
        (DATA.units[card]?.traits || [])
  .concat(DATA.spells.find(s => s.name === card)?.traits || [])
  .concat(DATA.enchantments.find(e => e.name === card)?.traits || [])
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
restoreOpenDetails(statsDiv, openDetails);
renderSkillWeb();
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
  const validity = validateDeck(
  activeDeck,
  {
    ...DATA.rules,
    spellsData: DATA.spells.map(s => s.name),
    enchantmentsData: DATA.enchantments.map(e => e.name)
  },
  DATA.units
);

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
  if (type === "upgrade") data = UPGRADE_CONFIG[name];

  if (!data) return;

  if (type === "unit") {
    const base = BASE_DATA.units[name];

fieldsDiv.innerHTML += input("health", "Health", override.health ?? base.health);
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

if (type === "upgrade") {
  Object.entries(data).forEach(([key, val]) => {
    fieldsDiv.innerHTML += input(
      key,
      key.replace(/([A-Z])/g, " $1"),
      val
    );
  });
}

  if (editorType !== "upgrade") {
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
}

  editor.style.display = "block";
}

function input(key, label, value) {
  const wide = key === "status" ? 'data-wide="true"' : "";
  return `
    <label ${wide}>
      ${label}
      <input data-key="${key}" value="${value ?? ""}" />
    </label>
  `;
}

function updateDeckCount() {
  const el = document.getElementById("deckCount");
  if (!el) return;

  const count = Object.keys(activeDeck).length;
  const max = DATA.rules.deckSize;

  el.textContent =
    count >= max ? `(${count}/${max} — FULL)` : `(${count}/${max})`;
}

function getBonusDps(unit, target) {
  if (!unit.dps || !unit.bonus) return unit.dps || 0;

  const bonus = unit.bonus[target] || 0;
  return unit.dps + bonus;
}

function getDpsVs(unit, target) {
  if (!unit.dps) return 0;

  const bonus =
    unit.bonus?.[target] ||
    unit[`bonusVs${target[0].toUpperCase()}${target.slice(1)}`] ||
    0;

  return unit.dps + bonus;
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

if (editorType === "upgrade") {
  UPGRADE_CONFIG[editorCard] = patch;
  saveUpgradeConfig();
}

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
  initCardEffectsFromDeck();
  renderPresets();
};

document.getElementById("exportDeck").onclick = () => exportDeck(activeDeck);
document.getElementById("importDeck").onclick = async () => {
  activeDeck = await importDeck();
  saveActiveDeck(activeDeck);
  initCardEffectsFromDeck();
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

  const deckSizeInput = document.getElementById("deckSizeInput");

  const savedDeckSize = localStorage.getItem(DECK_SIZE_KEY);
  if (savedDeckSize) {
    DATA.rules.deckSize = Number(savedDeckSize);
  }

  deckSizeInput.value = DATA.rules.deckSize;

  deckSizeInput.onchange = () => {
    const val = Number(deckSizeInput.value);
    if (val > 0) {
      DATA.rules.deckSize = val;
      localStorage.setItem(DECK_SIZE_KEY, val);

      renderDeck();
      renderUnitPool();
      renderSpells();
      renderEnchantments();
      renderDeckStats();
    }
  };

  renderModes();
  const savedTeam = localStorage.getItem(TEAM_KEY);
if (savedTeam) {
  teamSelect.value = savedTeam;
}
  modeSelect.value = DATA.modes[0]?.id || "";

  renderPresets();

  let storedActive = loadActiveDeck();

// 🧹 sanitize stored deck
if (storedActive && typeof storedActive === "object") {
  Object.keys(storedActive).forEach(k => {
    if (!k || k === "null" || k === "undefined") {
      delete storedActive[k];
    }
  });
}

// ✅ use stored deck if valid
if (storedActive && Object.keys(storedActive).length) {
  activeDeck = storedActive;
} 
// 🔁 otherwise fall back to first preset
else if (DATA.presets.length) {
  activeDeck = {};
  DATA.presets[0].deck.forEach(unit => {
    activeDeck[unit] = 1;
  });
  saveActiveDeck(activeDeck);
} 
// 🧱 last resort
else {
  activeDeck = {};
}

initCardEffectsFromDeck();
const savedUpgrades = loadUpgrades();
if (savedUpgrades) upgrades = savedUpgrades;
const savedUpgradeConfig = loadUpgradeConfig();
if (savedUpgradeConfig) UPGRADE_CONFIG = savedUpgradeConfig;
const savedTower = loadTowerControl();
if (savedTower) towerControl = savedTower;

renderUpgrades();
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