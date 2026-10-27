// Карточки улучшений, которые башня получает за уровни опыта.

import { TOWER_KEYS } from './config.js';

export const RARITIES = {
  common: { name: 'Обычная', color: '#94b0c2' },
  rare: { name: 'Редкая', color: '#41a6f6' },
  epic: { name: 'Эпическая', color: '#c165e0' },
  legendary: { name: 'Легендарная', color: '#ffcd75' },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

const ALL = TOWER_KEYS;
const pct = (v) => `${Math.round(v * 100)}%`;

// stat-карточки складываются в tower.mods[stat]; perk-карточки (легендарные) уникальны.
// max — сколько раз одну карточку можно взять на одну башню.
export const CARDS = [
  { id: 'dmg', name: 'Сила', towers: ALL, stat: 'dmg',
    values: { common: 0.06, rare: 0.12, epic: 0.2 }, text: (v) => `+${pct(v)} к урону` },
  { id: 'rate', name: 'Скорострельность', towers: ALL, stat: 'rate',
    values: { common: 0.05, rare: 0.1, epic: 0.16 }, text: (v) => `+${pct(v)} к скорости атаки` },
  { id: 'range', name: 'Зоркость', towers: ALL, stat: 'range',
    values: { common: 0.05, rare: 0.1, epic: 0.16 }, text: (v) => `+${pct(v)} к радиусу` },
  { id: 'crit', name: 'Меткость', towers: ['archer', 'cannon', 'ballista', 'mage'], stat: 'crit',
    values: { common: 0.04, rare: 0.08, epic: 0.12 }, text: (v) => `+${pct(v)} к шансу крита (x2 урона)` },
  { id: 'pierce', name: 'Бронебойность', towers: ['archer', 'cannon', 'ballista'], stat: 'pierce',
    values: { common: 1, rare: 2, epic: 4 }, text: (v) => `Игнорирует ${v} ед. брони` },
  { id: 'gold', name: 'Мародёр', towers: ALL, stat: 'gold', max: 1,
    values: { common: 1, rare: 2 }, text: (v) => `+${v} золота за каждое убийство` },
  { id: 'xp', name: 'Прилежание', towers: ALL, stat: 'xp', max: 2,
    values: { common: 0.25, rare: 0.5 }, text: (v) => `+${pct(v)} к получаемому опыту` },
  { id: 'splash', name: 'Ударная волна', towers: ['cannon', 'fire'], stat: 'splash',
    values: { common: 0.08, rare: 0.15, epic: 0.25 }, text: (v) => `+${pct(v)} к площади взрыва` },
  { id: 'slow', name: 'Стужа', towers: ['frost'], stat: 'slow',
    values: { common: 0.05, rare: 0.08, epic: 0.12 }, text: (v) => `+${pct(v)} к силе замедления` },
  { id: 'slowTime', name: 'Вечная мерзлота', towers: ['frost'], stat: 'slowTime',
    values: { common: 0.2, rare: 0.35, epic: 0.6 }, text: (v) => `+${pct(v)} к длительности замедления` },
  { id: 'multi', name: 'Двойной выстрел', towers: ['archer', 'frost'], stat: 'multishot',
    values: { rare: 0.12, epic: 0.22 }, text: (v) => `${pct(v)} шанс выстрелить ещё и по второй цели` },
  { id: 'brittle', name: 'Хрупкость', towers: ['frost'], stat: 'brittle',
    values: { rare: 0.08, epic: 0.15 }, text: (v) => `Замедленные враги получают +${pct(v)} урона от всех башен` },

  { id: 'volley', name: 'Залп', towers: ['archer'], perk: 'volley',
    values: { legendary: 1 }, text: () => 'Каждый выстрел бьёт ещё 2 цели (60% урона)' },
  { id: 'cluster', name: 'Кассетные бомбы', towers: ['cannon'], perk: 'cluster',
    values: { legendary: 1 }, text: () => 'Взрыв разбрасывает 3 малые бомбы (40% урона)' },
  { id: 'zero', name: 'Абсолютный ноль', towers: ['frost'], perk: 'zero',
    values: { legendary: 1 }, text: () => '15% шанс заморозить врага на 1.2с (босса — на 0.4с)' },
  { id: 'execute', name: 'Казнь', towers: ['archer', 'cannon', 'ballista'], perk: 'execute',
    values: { legendary: 1 }, text: () => 'Мгновенно добивает обычных врагов со здоровьем ниже 15%' },
  { id: 'aura', name: 'Командир', towers: ALL, perk: 'aura',
    values: { legendary: 1 }, text: () => 'Башни в радиусе 2 клеток: +15% урона и +10% скорости атаки' },

  // Карточки открываемых башен. Новые карточки добавлять только в конец: их индекс пишется в сохранения.
  { id: 'chain', name: 'Цепная реакция', towers: ['mage'], stat: 'chain', max: 3,
    values: { rare: 1, epic: 2 }, text: (v) => `Молния перескакивает ещё на ${v} ${v === 1 ? 'цель' : 'цели'}` },
  { id: 'storm', name: 'Буря', towers: ['mage'], perk: 'storm',
    values: { legendary: 1 }, text: () => 'Каждый 4-й удар бьёт молнией всех врагов в радиусе (60% урона)' },
  { id: 'giant', name: 'Охотник на великанов', towers: ['ballista', 'cannon'], stat: 'bigDmg',
    values: { common: 0.15, rare: 0.3, epic: 0.5 }, text: (v) => `+${pct(v)} урона по боссам и големам` },
  { id: 'deadeye', name: 'Смертельный выстрел', towers: ['ballista'], perk: 'deadeye',
    values: { legendary: 1 }, text: () => '15% шанс нанести пятикратный урон' },
  { id: 'heat', name: 'Жар', towers: ['fire'], stat: 'burn',
    values: { common: 0.1, rare: 0.2, epic: 0.35 }, text: (v) => `+${pct(v)} к урону от горения` },
  { id: 'smolder', name: 'Тление', towers: ['fire'], stat: 'burnTime',
    values: { common: 0.2, rare: 0.4 }, text: (v) => `+${pct(v)} к длительности горения` },
  { id: 'ash', name: 'Пепел', towers: ['fire'], perk: 'ash',
    values: { legendary: 1 }, text: () => 'Сгоревшие враги (не боссы) взрываются: 25% их здоровья по соседям' },
  { id: 'tide', name: 'Прилив', towers: ['water'], stat: 'push',
    values: { common: 0.15, rare: 0.3 }, text: (v) => `+${pct(v)} к силе отталкивания` },
  { id: 'soak', name: 'Промокание', towers: ['water'], stat: 'wetTime',
    values: { common: 0.25, rare: 0.5 }, text: (v) => `+${pct(v)} к длительности намокания` },
  { id: 'tsunami', name: 'Цунами', towers: ['water'], perk: 'tsunami',
    values: { legendary: 1 }, text: () => 'Каждый 5-й выстрел окатывает всех врагов в радиусе' },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const freshMods = () => ({
  dmg: 0, rate: 0, range: 0, crit: 0, pierce: 0, gold: 0, xp: 0,
  splash: 0, slow: 0, slowTime: 0, multishot: 0, brittle: 0,
  chain: 0, bigDmg: 0, burn: 0, burnTime: 0, push: 0, wetTime: 0,
});

// Опыт до следующего уровня; растёт на 45% за уровень.
export const xpToNext = (level) => Math.round(40 * Math.pow(1.45, level - 1));

// Реролл дорожает с уровнем башни и с каждым повтором в рамках одного выбора.
export const rerollCost = (t) => 10 + 4 * t.xpLevel + 10 * t.rerolls;

// С уровнем башни растёт шанс редких карт.
function rollRarity(level, rng) {
  const w = {
    common: Math.max(30, 62 - level * 2),
    rare: 26,
    epic: 10 + level * 0.8,
    legendary: 2 + level * 0.4,
  };
  let r = rng.next() * (w.common + w.rare + w.epic + w.legendary);
  for (const k of RARITY_ORDER) {
    if ((r -= w[k]) < 0) return k;
  }
  return 'common';
}

export function makeOffer(tower, rng, size = 3) {
  const offer = [];
  for (let i = 0; i < size; i++) {
    // Если для выпавшей редкости карт не осталось — понижаем редкость.
    for (let ri = RARITY_ORDER.indexOf(rollRarity(tower.xpLevel, rng)); ri >= 0; ri--) {
      const rarity = RARITY_ORDER[ri];
      const pool = CARDS.filter((c) =>
        c.towers.includes(tower.type) &&
        c.values[rarity] !== undefined &&
        !(c.perk && tower.perks[c.perk]) &&
        !(c.max && tower.cards.filter((t) => t.id === c.id).length >= c.max) &&
        !offer.some((o) => o.id === c.id));
      if (pool.length) {
        const c = pool[rng.int(pool.length)];
        offer.push({ id: c.id, rarity, value: c.values[rarity] });
        break;
      }
    }
  }
  return offer;
}

export function applyCard(tower, card) {
  const def = CARD_BY_ID[card.id];
  if (def.perk) tower.perks[def.perk] = true;
  else tower.mods[def.stat] += card.value;
  tower.cards.push(card);
}

// Карточка в сохранении — 2 символа: индекс в CARDS (base36) и индекс редкости.
export function encodeCards(cards) {
  return cards.map((c) => CARDS.findIndex((d) => d.id === c.id).toString(36) + RARITY_ORDER.indexOf(c.rarity)).join('');
}

export function decodeCards(str) {
  const out = [];
  for (let i = 0; i + 1 < str.length; i += 2) {
    const def = CARDS[parseInt(str[i], 36)];
    const rarity = RARITY_ORDER[Number(str[i + 1])];
    if (def && def.values[rarity] !== undefined) out.push({ id: def.id, rarity, value: def.values[rarity] });
  }
  return out;
}
