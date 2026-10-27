export const TILE = 16;
export const COLS = 20;
export const ROWS = 12;

export const START_GOLD = 120;
export const START_LIVES = 20;
export const SELL_RATIO = 0.7;

// Опыт игрока (общий для всех партий) = урон, нанесённый башнями, × этот коэффициент.
export const PLAYER_XP_RATE = 0.1;

// range — в клетках, rate — секунд между выстрелами, speed снаряда — клеток/с.
// dmgType: phys — режется бронёй и сопротивлением призраков; magic — игнорирует броню.
// unlock — цена открытия в опыте игрока; без неё башня доступна сразу.
export const TOWERS = {
  archer: {
    name: 'Лучники',
    desc: 'Быстрая стрельба по одной цели. Бьёт летающих.',
    cost: 50,
    projectile: 'arrow',
    speed: 14,
    hitsAir: true,
    dmgType: 'phys',
    levels: [
      { damage: 6, rate: 0.55, range: 3.2 },
      { damage: 11, rate: 0.45, range: 3.6, cost: 60 },
      { damage: 18, rate: 0.35, range: 4.0, cost: 100 },
    ],
  },
  cannon: {
    name: 'Пушка',
    desc: 'Урон по площади. Не достаёт летающих.',
    cost: 80,
    projectile: 'ball',
    speed: 6,
    hitsAir: false,
    dmgType: 'phys',
    xpMul: 0.6, // бьёт по площади, поэтому опыт за урон меньше
    levels: [
      { damage: 16, rate: 1.5, range: 2.8, splash: 1.0 },
      { damage: 28, rate: 1.35, range: 3.0, splash: 1.2, cost: 90 },
      { damage: 45, rate: 1.2, range: 3.3, splash: 1.4, cost: 140 },
    ],
  },
  frost: {
    name: 'Лёд',
    desc: 'Слабый магический урон, но замедляет врагов.',
    cost: 60,
    projectile: 'ice',
    speed: 9,
    hitsAir: true,
    dmgType: 'magic',
    xpMul: 2.5, // урона мало, поэтому опыт за него больше
    levels: [
      { damage: 2, rate: 0.9, range: 2.6, slow: 0.4, slowTime: 1.5 },
      { damage: 4, rate: 0.8, range: 2.9, slow: 0.5, slowTime: 1.8, cost: 70 },
      { damage: 7, rate: 0.7, range: 3.2, slow: 0.6, slowTime: 2.2, cost: 110 },
    ],
  },
  mage: {
    name: 'Маг',
    desc: 'Молния бьёт цель и перескакивает на соседних (75% урона за прыжок). Магия игнорирует броню.',
    cost: 90,
    unlock: 5000,
    projectile: 'zap',
    hitsAir: true,
    dmgType: 'magic',
    xpMul: 0.7,
    levels: [
      { damage: 10, rate: 1.1, range: 3.0, chain: 2 },
      { damage: 18, rate: 1.0, range: 3.2, chain: 3, cost: 110 },
      { damage: 30, rate: 0.9, range: 3.5, chain: 4, cost: 170 },
    ],
  },
  ballista: {
    name: 'Баллиста',
    desc: 'Очень дальнобойная. Бьёт самого живучего врага и пробивает броню.',
    cost: 110,
    unlock: 15000,
    projectile: 'spear',
    speed: 20,
    hitsAir: true,
    dmgType: 'phys',
    target: 'strong',
    levels: [
      { damage: 45, rate: 2.2, range: 5.0, pierce: 3 },
      { damage: 80, rate: 2.0, range: 5.5, pierce: 5, cost: 130 },
      { damage: 130, rate: 1.8, range: 6.0, pierce: 8, cost: 200 },
    ],
  },
  fire: {
    name: 'Жаровня',
    desc: 'Огненные шары поджигают всех рядом с целью: урон огнём каждую секунду.',
    cost: 100,
    unlock: 40000,
    projectile: 'fireball',
    speed: 7,
    hitsAir: true,
    dmgType: 'magic',
    xpMul: 0.7,
    levels: [
      { damage: 4, rate: 0.8, range: 2.4, splash: 0.6, burn: 6, burnTime: 3 },
      { damage: 7, rate: 0.7, range: 2.6, splash: 0.7, burn: 11, burnTime: 3, cost: 120 },
      { damage: 12, rate: 0.6, range: 2.8, splash: 0.8, burn: 18, burnTime: 3.5, cost: 180 },
    ],
  },
  // Новые башни добавлять только в конец: их порядковый номер хранится в сохранениях.
  water: {
    name: 'Водомёт',
    desc: 'Слабый урон, отталкивает врагов назад по дороге и делает их мокрыми: молния по мокрым +50%, лёд замораживает сразу.',
    cost: 70,
    unlock: 25000,
    projectile: 'water',
    speed: 10,
    hitsAir: false,
    dmgType: 'phys',
    xpMul: 1.5,
    levels: [
      { damage: 3, rate: 1.0, range: 2.6, push: 0.35, wetTime: 4 },
      { damage: 6, rate: 0.9, range: 2.8, push: 0.45, wetTime: 5, cost: 80 },
      { damage: 10, rate: 0.8, range: 3.0, push: 0.55, wetTime: 6, cost: 130 },
    ],
  },
};

export const TOWER_KEYS = Object.keys(TOWERS);

// Приоритет цели башни. Смена режима записывается в реплей.
export const TARGET_MODES = {
  first: 'Первый',
  last: 'Последний',
  strong: 'Сильный',
  close: 'Ближний',
  air: 'Воздух',
};
export const TARGET_KEYS = Object.keys(TARGET_MODES);

// Версия игровых правил. Реплей воспроизводится только той версией правил, в которой записан:
// при изменении баланса или механик, влияющих на симуляцию, число нужно увеличить.
export const RULES_VERSION = 5;

// Ранги бесконечны: первые три заданы в levels, каждый следующий даёт +20% урона (и горения)
// к последнему заданному и стоит на 35% дороже предыдущего.
const RANK_DMG_GROWTH = 1.2;
const RANK_COST_GROWTH = 1.35;

export function towerLevel(def, level) {
  const last = def.levels.length - 1;
  if (level <= last) return def.levels[level];
  const top = def.levels[last];
  const k = level - last;
  const mul = RANK_DMG_GROWTH ** k;
  return {
    ...top,
    damage: top.damage * mul,
    ...(top.burn && { burn: top.burn * mul }),
    cost: Math.round(top.cost * RANK_COST_GROWTH ** k),
  };
}

// speed — клеток/с, armor вычитается из физического урона (минимум 1 за попадание).
// Способности: regen — доля макс. здоровья в секунду; dodge — шанс увернуться от снаряда;
// slowResist — ослабляет замедление и заморозку; physResist — режет физический урон;
// heal — лечит соседей; split — при смерти распадается на N малых слизней.
// evolve — эволюции по номеру волны: hp/speed умножаются, armor прибавляется, остальное заменяется,
// palette перекрашивает спрайт.
export const ENEMIES = {
  slime: {
    name: 'Слизень', hp: 30, speed: 0.9, gold: 4, armor: 0,
    evolve: [
      { wave: 12, name: 'Синий слизень', hp: 1.25, armor: 1,
        palette: { g: '#3b5dc9', l: '#41a6f6', G: '#29366f' } },
      { wave: 25, name: 'Королевский слизень', hp: 1.4, armor: 1, split: 2,
        palette: { g: '#7b3f9e', l: '#c165e0', G: '#3d1f4f', r: '#ffcd75' } },
    ],
  },
  goblin: {
    name: 'Гоблин', hp: 22, speed: 1.7, gold: 4, armor: 0,
    evolve: [
      { wave: 10, name: 'Гоблин-ловкач', dodge: 0.15, palette: { n: '#3b5dc9', N: '#29366f' } },
      { wave: 22, name: 'Гоблин-ассасин', dodge: 0.25, speed: 1.15,
        palette: { n: '#333c57', N: '#1a1c2c', g: '#257179' } },
    ],
  },
  knight: {
    name: 'Рыцарь', hp: 90, speed: 0.6, gold: 8, armor: 3,
    evolve: [
      { wave: 14, name: 'Паладин', armor: 2, slowResist: 0.5, palette: { b: '#ffcd75', y: '#f4f4f4' } },
      { wave: 28, name: 'Чемпион', armor: 4, slowResist: 0.5, regen: 0.01,
        palette: { b: '#b13e53', y: '#ffcd75', s: '#ffcd75', S: '#c28a4a' } },
    ],
  },
  bat: {
    name: 'Летучая мышь', hp: 24, speed: 1.4, gold: 5, armor: 0, flying: true,
    evolve: [
      { wave: 12, name: 'Вампир', regen: 0.02, palette: { p: '#b13e53' } },
      { wave: 24, name: 'Лорд-вампир', hp: 1.3, regen: 0.03, palette: { p: '#333c57', r: '#ef7d57' } },
    ],
  },
  shaman: {
    name: 'Шаман', hp: 55, speed: 0.8, gold: 7, armor: 0,
    heal: { radius: 1.6, pct: 0.06, every: 2 },
    evolve: [
      { wave: 20, name: 'Верховный шаман', heal: { radius: 2, pct: 0.1, every: 2 },
        palette: { R: '#73eff7', p: '#257179' } },
    ],
  },
  golem: {
    name: 'Голем', hp: 260, speed: 0.42, gold: 14, armor: 6, slowResist: 0.5,
    evolve: [
      { wave: 24, name: 'Обсидиановый голем', armor: 4,
        palette: { s: '#566c86', S: '#333c57', R: '#73eff7' } },
    ],
  },
  ghost: {
    name: 'Призрак', hp: 70, speed: 1.0, gold: 9, armor: 0, flying: true, physResist: 0.5,
    evolve: [
      { wave: 30, name: 'Банши', speed: 1.3, palette: { c: '#c165e0', w: '#f4d6ff' } },
    ],
  },
  // Фазы боссов: summon — на доле здоровья зовёт подмогу; dash — периодический рывок;
  // shieldAt — на этих долях здоровья на 2 с становится неуязвимым.
  ogre: {
    name: 'Огр', hp: 650, speed: 0.45, gold: 50, armor: 2, lives: 5, scale: 2, boss: true,
    summon: { at: 0.5, type: 'goblin', count: 4 },
    evolve: [
      { wave: 20, name: 'Тролль', regen: 0.01, dash: { every: 8, time: 1, mul: 3 },
        palette: { g: '#38b764', l: '#a7f070' } },
      { wave: 35, name: 'Король троллей', hp: 1.4, regen: 0.015, shieldAt: [0.66, 0.33],
        palette: { g: '#257179', l: '#73eff7', n: '#ffcd75' } },
    ],
  },
  // Новые виды врагов добавлять в конец.
  saboteur: {
    name: 'Диверсант', hp: 45, speed: 1.2, gold: 8, armor: 1,
    disable: { radius: 1.4, time: 3, every: 6 },
    evolve: [
      { wave: 28, name: 'Мастер-диверсант', disable: { radius: 1.8, time: 4, every: 5 },
        palette: { n: '#b13e53', N: '#5d275d' } },
    ],
  },
};

// Номер формы врага на данной волне: 0 — базовая, дальше — эволюции.
export const formIndex = (type, wave) => (ENEMIES[type].evolve ?? []).filter((f) => wave >= f.wave).length;

// Итоговые свойства формы. Результат кэшируется — вызывается на каждом кадре.
const formCache = new Map();
export function enemyForm(type, form) {
  const key = `${type}:${form}`;
  if (formCache.has(key)) return formCache.get(key);
  const base = ENEMIES[type];
  const f = { ...base, form };
  for (const evo of (base.evolve ?? []).slice(0, form)) {
    const { wave, palette, hp, speed, armor, ...rest } = evo;
    f.hp = f.hp * (hp ?? 1);
    f.speed = f.speed * (speed ?? 1);
    f.armor = f.armor + (armor ?? 0);
    Object.assign(f, rest);
  }
  formCache.set(key, f);
  return f;
}

// Группы врагов волны: каждая стартует в `at` секунд и выпускает count врагов через interval.
// Волны бесконечны: численность упирается в потолок, дальше растёт только здоровье.
export function makeWave(n) {
  const groups = [];
  const add = (type, count, interval, at) => groups.push({ type, count, interval, at });
  add('slime', Math.min(30, 5 + n), Math.max(0.45, 1.1 - n * 0.03), 0);
  if (n >= 2) add('goblin', Math.min(30, 2 + Math.floor(n * 1.2)), Math.max(0.35, 0.7 - n * 0.015), 3);
  if (n >= 4 && n % 2 === 0) add('bat', Math.min(25, 2 + n), 0.55, 5);
  if (n >= 6) add('knight', Math.min(20, Math.floor((n - 3) / 2)), 1.6, 6);
  if (n >= 8) add('shaman', Math.min(6, Math.floor((n - 4) / 4)), 2.5, 4);
  if (n >= 12 && n % 3 === 0) add('golem', Math.min(8, Math.floor((n - 9) / 3)), 3, 7);
  if (n >= 16 && n % 2 === 1) add('ghost', Math.min(15, n - 12), 0.8, 6);
  if (n >= 14) add('saboteur', Math.min(10, Math.floor((n - 10) / 2)), 2.2, 8);
  if (n % 5 === 0) add('ogre', Math.min(6, n / 5), 4, 10);
  return groups;
}

// ---------- модификаторы волн ----------

export const AFFIXES = {
  shield: { name: 'Щиты', desc: 'у врагов щит на 25% здоровья' },
  volatile: { name: 'Взрывные', desc: 'при смерти оглушают башни рядом на 1.5 с' },
  fog: { name: 'Туман', desc: 'башни видят врагов не дальше 2 клеток' },
  haste: { name: 'Спешка', desc: 'после половины пути враги ускоряются на 40%' },
  regen: { name: 'Живучесть', desc: 'регенерация 1% здоровья в секунду' },
  armor: { name: 'Латы', desc: '+3 брони' },
};
const AFFIX_KEYS = Object.keys(AFFIXES);

// Модификаторы волны определяются сидом карты и номером волны — их видно заранее, и они те же при повторе.
export function waveAffixes(seed, n, extra = false) {
  const from = extra ? 1 : 10;
  if (n < from) return [];
  let count = n >= 25 ? 2 : 1;
  if (extra) count++;
  let s = (Math.imul(seed, 31) + Math.imul(n, 977)) | 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...AFFIX_KEYS];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
  return out;
}

// ---------- способности игрока ----------

export const ABILITIES = {
  meteor: { name: 'Метеор', key: 'Z', cd: 30, cost: (w) => 40 + 12 * w, radius: 1.2, damage: 120,
    desc: 'удар по выбранной точке' },
  freeze: { name: 'Стужа', key: 'X', cd: 60, cost: (w) => 60 + 15 * w, time: 3, bossTime: 1,
    desc: 'замораживает всех врагов на 3 с (боссов — на 1 с)' },
  repair: { name: 'Починка', key: 'C', cd: 120, cost: (w) => 100 + 25 * w, lives: 3,
    desc: '+3 жизни, не больше стартового запаса' },
};
export const ABILITY_KEYS = Object.keys(ABILITIES);

// ---------- таланты (постоянные, за опыт игрока) ----------

const TALENT_COSTS = [3000, 10000, 30000, 80000, 200000];
export const TALENTS = {
  treasury: { name: 'Казна', max: 5, text: (l) => `+${25 * l} стартового золота` },
  fortress: { name: 'Крепость', max: 5, text: (l) => `+${2 * l} жизней` },
  merchant: { name: 'Торговец', max: 3, text: (l) => `реролл дешевле на ${10 * l}%` },
  science: { name: 'Наука', max: 5, text: (l) => `+${10 * l}% опыта башен` },
  strategist: { name: 'Стратег', max: 3, text: (l) => `способности перезаряжаются на ${10 * l}% быстрее` },
  choice: { name: 'Широкий выбор', max: 1, costs: [150000], text: () => '4-я карта в каждом выборе' },
};
export const talentCost = (id, level) => (TALENTS[id].costs ?? TALENT_COSTS)[level] ?? null;

// ---------- усложнения партии («жар») ----------

export const MUTATORS = {
  tough: { name: 'Толстокожие', heat: 2, desc: 'враги +30% здоровья' },
  swift: { name: 'Быстрые ноги', heat: 2, desc: 'враги на 20% быстрее' },
  fragile: { name: 'Хрупкий замок', heat: 1, desc: 'всего 10 жизней' },
  poor: { name: 'Бедность', heat: 2, desc: 'вдвое меньше стартового золота, бонусы волн −30%' },
  noreroll: { name: 'Без рероллов', heat: 1, desc: 'карты нельзя перебрасывать' },
  evil: { name: 'Злые волны', heat: 3, desc: 'модификаторы волн с 1-й волны и на один больше' },
  noability: { name: 'Без способностей', heat: 1, desc: 'способности игрока отключены' },
};
export const MUTATOR_KEYS = Object.keys(MUTATORS);
export const runHeat = (run) => (run.mutators ?? []).reduce((s, m) => s + (MUTATORS[m]?.heat ?? 0), 0);
export const heatXpMul = (heat) => 1 + 0.15 * heat;

// Условия партии: таланты, усложнения, ежедневный вызов. Фиксируются на старте партии.
export const DEFAULT_RUN = { talents: {}, mutators: [], daily: null };

// Ежедневный вызов: сид и усложнения выводятся из даты (UTC); все башни открыты, таланты не действуют.
export function dailyRun(day) {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const seed = (h >>> 1) % 2147483647;
  const pool = MUTATOR_KEYS.filter((m) => m !== 'noability');
  const mutators = [];
  let s = seed;
  while (mutators.length < 2) {
    s = (Math.imul(s, 48271) + 11) % 2147483647;
    const m = pool[Math.abs(s) % pool.length];
    if (!mutators.includes(m)) mutators.push(m);
  }
  return { seed, run: { talents: {}, mutators, daily: day } };
}
export const todayUtc = () => new Date().toISOString().slice(0, 10);

export const waveHpMul = (n) => Math.pow(1.16, n - 1);
export const waveBonus = (n) => 12 + n * 3;
export const killGold = (type, wave) => ENEMIES[type].gold + Math.floor(wave / 6);
