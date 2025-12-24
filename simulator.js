export function simulate(deck, modeId, time, DATA) {
  const mode = DATA.modes.find(m => m.id === modeId);
  if (!mode) {
    return { gold: 0, crystal: 0, dps: 0, status: [] };
  }

  let gold = mode.startGold;
  let crystal = mode.startCrystal;
  // passive income: 10 gold every 10 seconds
gold += Math.floor(time / 10) * 10;

// miner income (per-miner assignment, simplified)
const miners = deck.filter(c => DATA.units[c]?.queue === "Miner").length;

// split miners between gold and crystal
const goldMiners = Math.ceil(miners / 2);
const crystalMiners = Math.floor(miners / 2);

// gold: 25 gold every 4s = 6.25 gold/s
gold += Math.floor(time * goldMiners * 6.25);

// crystal: 10 crystal every 5s = 2 crystal/s
crystal += Math.floor(time * crystalMiners * 2);

  // group by queue (excluding miners)
  const queues = {};
  deck.forEach(card => {
    const u = DATA.units[card];
    if (!u || u.queue === "Miner") return;
    queues[u.queue] = queues[u.queue] || [];
    queues[u.queue].push(u);
  });

  let dps = 0;
  const status = new Set();

  // simulate each queue independently
  Object.entries(queues).forEach(([queueName, queueUnits]) => {
  const limit = DATA.rules.queueLimits?.[queueName] || 1;

  let finished = 0;
  let t = 0;

  for (const u of queueUnits) {
    if (finished >= limit) break;

    const nextFinish = t + (u.trainTime || 0);
    if (nextFinish > time) break;
    if (gold < (u.gold || 0) || crystal < (u.crystal || 0)) break;

    t = nextFinish;
    finished++;

    gold -= u.gold || 0;
    crystal -= u.crystal || 0;
    dps += u.dps || 0;
    (u.status || []).forEach(s => status.add(s));
  }
});

  gold = Math.max(0, gold);
  crystal = Math.max(0, crystal);

  return {
    gold,
    crystal,
    dps,
    status: [...status]
  };
}