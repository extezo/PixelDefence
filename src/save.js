// Хранилище в браузере (localStorage): слоты сохранений, рекорд, профиль игрока, последний реплей.
//
// Почему не cookie: cookie отправляются на сервер с каждым запросом и ограничены ~4 КБ,
// а сохранение с десятками прокачанных башен или реплей в это не уместятся.

import { TOWER_KEYS, TOWERS, RULES_VERSION, TARGET_KEYS } from './config.js';
import { encodeCards } from './cards.js';

const KEY = {
  slot: (i) => `pixel-td:slot:${i}`,
  legacy: 'pixel-td:save',
  best: 'pixel-td:best',
  profile: 'pixel-td:profile',
  replay: 'pixel-td:replay',
};
export const SLOT_COUNT = 3;
const VERSION = 3;
const EXPORT_PREFIX = 'PXTD3:';
const OLD_PREFIXES = ['PXTD2:'];

const get = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};
const del = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
    // хранилище недоступно (приватный режим)
  }
};

// ---------- сохранения ----------

// Башня: [тип, x, y, ранг, опыт, уровень, ждущих выборов, рероллов, вложено золота, карточки,
//         предложение, режим цели]
export function serialize(game) {
  return {
    v: VERSION,
    seed: game.map.seed,
    rng: game.rng.state,
    run: game.run,
    wave: game.wave,
    cleared: game.cleared,
    gold: game.gold,
    lives: game.lives,
    ruins: game.clearedRuins,
    abilities: Object.fromEntries(Object.keys(game.abilityReady).map((k) => [k, +game.abilityLeft(k).toFixed(2)])),
    date: Date.now(),
    towers: game.towers.map((t) => [
      TOWER_KEYS.indexOf(t.type), t.tx, t.ty, t.level, Math.floor(t.xp), t.xpLevel,
      t.pending, t.rerolls, t.spent, encodeCards(t.cards), t.offer ? encodeCards(t.offer) : '',
      TARGET_KEYS.indexOf(t.mode),
    ]),
  };
}

// Сохранение содержит только ASCII, поэтому btoa/atob достаточно.
const encode = (data) => btoa(JSON.stringify(data));

function decode(str) {
  try {
    const data = JSON.parse(atob(str.trim()));
    return valid(data) ? data : null;
  } catch {
    return null;
  }
}

function valid(d) {
  return d && [1, 2, VERSION].includes(d.v) && Number.isInteger(d.seed) && Number.isInteger(d.wave) &&
    Number.isFinite(d.gold) && Number.isFinite(d.lives) && Array.isArray(d.towers) &&
    d.towers.every((t) => Array.isArray(t) && TOWER_KEYS[t[0]] !== undefined);
}

// Старое сохранение из единственного слота переезжает в слот 1.
function migrate() {
  const old = get(KEY.legacy);
  if (old && !get(KEY.slot(0))) set(KEY.slot(0), old);
  if (old) del(KEY.legacy);
}
migrate();

export const readSlot = (i) => {
  const s = get(KEY.slot(i));
  return s ? decode(s) : null;
};
export const writeSlot = (i, game) => set(KEY.slot(i), encode(serialize(game)));
export const deleteSlot = (i) => del(KEY.slot(i));
export const listSlots = () => Array.from({ length: SLOT_COUNT }, (_, i) => readSlot(i));

// Самое свежее сохранение — для кнопки «Продолжить».
export function latestSlot() {
  let best = null;
  listSlots().forEach((d, i) => {
    if (d && (!best || (d.date ?? 0) > (best.data.date ?? 0))) best = { i, data: d };
  });
  return best;
}

export const exportString = (game) => EXPORT_PREFIX + encode(serialize(game));
export const importString = (str) => decode([EXPORT_PREFIX, ...OLD_PREFIXES].reduce((s, p) => s.replace(p, ''), str.trim()));

// Сохранение ссылается на башни, которые игрок мог ещё не открыть.
export const missingTowers = (data, unlocked) =>
  [...new Set(data.towers.map((t) => TOWER_KEYS[t[0]]))].filter((k) => !unlocked.has(k)).map((k) => TOWERS[k].name);

// ---------- рекорд ----------

export const readBest = () => Number(get(KEY.best)) || 0;
export function writeBest(wave) {
  if (wave > readBest()) set(KEY.best, String(wave));
}

// ---------- профиль игрока: опыт, открытые башни, ник ----------

export function readProfile() {
  let p = {};
  try {
    p = JSON.parse(get(KEY.profile) || '{}');
  } catch {
    // повреждённый профиль — начинаем с нуля
  }
  return { xp: 0, totalXp: 0, unlocked: [], talents: {}, nick: null, token: null, autoPick: false, ...p };
}
export const writeProfile = (p) => set(KEY.profile, JSON.stringify(p));

// ---------- реплей последней партии ----------

export const readReplay = () => {
  try {
    return JSON.parse(get(KEY.replay) || 'null');
  } catch {
    return null;
  }
};
export const writeReplay = (rep) => set(KEY.replay, JSON.stringify(rep));
export const deleteReplay = () => del(KEY.replay);

// Реплей, записанный при других правилах, разойдётся с игрой — его не показываем.
export const replayRulesMatch = (r) => r.rules === RULES_VERSION;

export function validReplay(r) {
  return r && (r.v === 1 || r.v === 2) && r.start && (Number.isInteger(r.start.seed) || valid(r.start.save)) &&
    Array.isArray(r.actions) && Number.isInteger(r.endTick) && Array.isArray(r.unlocked);
}
