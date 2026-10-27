import {
  TILE, START_GOLD, START_LIVES, SELL_RATIO, PLAYER_XP_RATE,
  TOWERS, TOWER_KEYS, ENEMIES, RULES_VERSION, TARGET_KEYS, ABILITIES, DEFAULT_RUN,
  towerLevel, makeWave, waveHpMul, waveBonus, killGold, formIndex, enemyForm, waveAffixes, runHeat, heatXpMul,
} from './config.js';
import { buildMap, randomSeed, CELL } from './map.js';
import { freshMods, xpToNext, rerollCost, makeOffer, applyCard, decodeCards } from './cards.js';
import { Rng } from './rng.js';

const AURA_RADIUS = 2 * TILE;
const CHAIN_RADIUS = 1.6 * TILE;
const REGEN_DELAY = 2;
const FOG_RANGE = 2 * TILE;
const RUIN_COST = 80;
const SECOND_ROUTE_FROM = 20; // с этой волны часть врагов идёт через второй вход
const BASE_TOWERS = TOWER_KEYS.filter((k) => !TOWERS[k].unlock);

// Статистика партии — только для экрана итогов, на симуляцию не влияет.
function newTally() {
  return {
    towers: [], // запись на каждую построенную башню, включая проданные
    byType: {}, // урон и убийства по типам башен
    enemies: {}, // по видам врагов: появилось, убито, прорвалось, снято жизней
    abilities: {}, // применения, урон и убийства способностей
    gold: { kills: 0, waves: 0, ore: 0, early: 0, sells: 0 },
    spent: { build: 0, rank: 0, abilities: 0, rerolls: 0, ruins: 0 },
    reactions: { crit: 0, deadeye: 0, execute: 0, shock: 0, overload: 0, wetFreeze: 0, dodge: 0 },
    cards: { common: 0, rare: 0, epic: 0, legendary: 0 },
    totalDmg: 0,
    kills: 0,
    best: null, // самый сильный одиночный удар
  };
}
const bump = (obj, key, field, n = 1) => {
  const rec = (obj[key] ??= {});
  rec[field] = (rec[field] ?? 0) + n;
};

// Фиксированный шаг симуляции: одинаковый на любом компьютере, поэтому реплей совпадает с игрой.
export const STEP = 1 / 60;

export class Game {
  constructor(sfx) {
    this.sfx = sfx;
    this.onEvent = null;
    this.speed = 1;
    this.unlocked = new Set(BASE_TOWERS);
    this.reset();
  }

  // Новая партия: каждый раз новая процедурная карта (или заданная сидом — при загрузке).
  // run — условия партии (таланты, усложнения, ежедневный вызов), фиксируются на весь забег.
  reset(seed = randomSeed(), run = DEFAULT_RUN, { legacyMap = false } = {}) {
    this.map = buildMap(seed, { legacy: legacyMap });
    this.rng = new Rng(seed ^ 0x5bd1e995);
    this.run = { talents: { ...run.talents }, mutators: [...run.mutators], daily: run.daily ?? null };
    this.heat = runHeat(this.run);
    const tal = this.run.talents;
    const mut = new Set(this.run.mutators);
    this.mut = mut;
    this.gold = Math.round((START_GOLD + 25 * (tal.treasury ?? 0)) * (mut.has('poor') ? 0.5 : 1));
    this.maxLives = (mut.has('fragile') ? 10 : START_LIVES) + 2 * (tal.fortress ?? 0);
    this.lives = this.maxLives;
    this.wave = 0;
    this.cleared = 0; // полностью отбитые волны — для рекорда и таблицы лидеров
    this.waveActive = false;
    this.waveTime = 0;
    this.spawnQueue = [];
    this.spawnCount = 0;
    this.hpMul = 1;
    this.affixes = [];
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.particles = [];
    this.texts = [];
    this.zaps = [];
    this.effects = []; // отложенные удары (метеор)
    this.abilityReady = Object.fromEntries(Object.keys(ABILITIES).map((k) => [k, 0]));
    this.clearedRuins = [];
    this.state = 'playing'; // 'menu' | 'lost' | 'ended' (конец реплея)
    this.paused = false;
    this.selected = null;
    this.selectedRuin = null;
    this.buildType = null;
    this.targeting = null; // способность, ждущая выбора точки
    this.picking = null; // башня, для которой открыт выбор карточек
    this.time = 0;
    this.tick = 0;
    this.shake = 0;
    this.nextId = 1;
    this.playerXp = 0; // опыт игрока за партию, ещё не перенесённый в профиль
    this.tally = newTally();
    // Запись действий для реплея.
    this.start = { seed, run: this.run };
    this.log = [];
    this.startUnlocked = null; // открытые башни на момент первого действия партии
    this.replay = null;
    this.replaying = false;
    this.applying = false;
  }

  emit(name, data) {
    this.onEvent?.(name, data);
  }

  talent(id) {
    return this.run.talents[id] ?? 0;
  }

  // ---------- реплеи ----------

  record(code, ...args) {
    if (this.replaying) return;
    // Открытые башни запоминаются до первого действия: дальше набор меняется только записанным
    // действием 'x', поэтому реплей знает, какие башни были доступны в каждый момент.
    this.startUnlocked ??= [...this.unlocked];
    this.log.push([this.tick, code, ...args]);
  }

  // Во время просмотра реплея действия игрока заблокированы — работают только записанные.
  get locked() {
    return this.replaying && !this.applying;
  }

  replayData() {
    return {
      v: 2,
      rules: RULES_VERSION,
      start: this.start,
      unlocked: this.startUnlocked ?? [...this.unlocked],
      actions: this.log,
      endTick: this.tick,
      wave: this.wave,
      cleared: this.cleared,
      lost: this.state === 'lost',
      date: Date.now(),
    };
  }

  startReplay(rep) {
    if (rep.start.save) this.load(rep.start.save);
    else this.reset(rep.start.seed, rep.start.run ?? DEFAULT_RUN);
    this.unlocked = new Set(rep.unlocked);
    this.replaying = true;
    this.replay = { actions: rep.actions, idx: 0, endTick: rep.endTick };
  }

  applyAction([, code, ...args]) {
    const byId = (id) => this.towers.find((t) => t.id === id);
    this.applying = true;
    switch (code) {
      case 'w': this.startWave(); break;
      case 'b': this.build(args[0], args[1], args[2]); break;
      case 'u': this.upgrade(byId(args[0])); break;
      case 's': this.sell(byId(args[0])); break;
      case 'p': this.pickCard(args[1], byId(args[0])); break;
      case 'r': this.reroll(byId(args[0])); break;
      case 'x': this.unlockTower(args[0]); break;
      case 'm': this.setMode(byId(args[0]), args[1]); break;
      case 'a': this.castAbility(args[0], args[1], args[2]); break;
      case 'c': this.clearRuin(args[0], args[1]); break;
    }
    this.applying = false;
  }

  // Открытие башни посреди партии (за опыт игрока) — записывается в реплей.
  unlockTower(type) {
    if (this.locked || this.unlocked.has(type)) return;
    if (this.state === 'playing') this.record('x', type);
    this.unlocked.add(type);
  }

  // ---------- волны ----------

  // Следующую волну можно вызвать, когда текущая целиком вышла на дорогу.
  get canStartWave() {
    return this.state === 'playing' && !this.locked && (!this.waveActive || this.spawnQueue.length === 0);
  }

  get earlyCall() {
    return this.state === 'playing' && this.waveActive && this.spawnQueue.length === 0;
  }

  bonusFor(n) {
    return Math.round(waveBonus(n) * (this.mut.has('poor') ? 0.7 : 1));
  }

  earlyBonus() {
    return Math.round(this.bonusFor(this.wave + 1) * 0.5);
  }

  // Сохраняться можно между волнами, начиная с первой отбитой.
  get canSave() {
    return this.state === 'playing' && !this.waveActive && this.wave > 0 && !this.replaying;
  }

  startWave() {
    if (!this.canStartWave) return;
    this.record('w');
    if (this.waveActive) {
      const bonus = this.earlyBonus();
      this.gold += bonus;
      this.tally.gold.early += bonus;
      this.emit('early', bonus);
    }
    this.wave++;
    this.waveActive = true;
    this.waveTime = 0;
    this.hpMul = waveHpMul(this.wave);
    this.affixes = waveAffixes(this.map.seed, this.wave, this.mut.has('evil'));
    this.spawnQueue = [];
    const evolved = [];
    for (const g of makeWave(this.wave)) {
      for (let i = 0; i < g.count; i++) this.spawnQueue.push({ type: g.type, time: g.at + i * g.interval });
      const evo = ENEMIES[g.type].evolve?.find((f) => f.wave === this.wave);
      if (evo) evolved.push(evo.name);
    }
    this.spawnQueue.sort((a, b) => a.time - b.time);
    this.sfx.play('wave');
    this.emit('wave', { wave: this.wave, evolved, affixes: this.affixes });
  }

  // ---------- стройка и выбор ----------

  toggleBuild(type) {
    if (this.state !== 'playing' || this.replaying) return;
    this.selected = null;
    this.selectedRuin = null;
    this.targeting = null;
    this.buildType = this.buildType === type ? null : type;
  }

  cancel() {
    this.buildType = null;
    this.selected = null;
    this.selectedRuin = null;
    this.targeting = null;
  }

  cycleSpeed() {
    const speeds = this.replaying ? [1, 2, 4, 8] : [1, 2, 3];
    this.speed = speeds[(speeds.indexOf(this.speed) + 1) % speeds.length];
  }

  togglePause() {
    if (this.state === 'playing') this.paused = !this.paused;
  }

  clickTile(tx, ty, keepBuilding) {
    if (this.state !== 'playing') return;
    if (this.targeting) {
      const ability = this.targeting;
      this.targeting = null;
      this.castAbility(ability, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
      return;
    }
    const tower = this.towerAt(tx, ty);
    if (this.buildType && !tower) {
      if (this.build(this.buildType, tx, ty) && !keepBuilding) this.buildType = null;
      return;
    }
    this.buildType = null;
    this.selected = tower;
    this.selectedRuin = !tower && this.map.cell(tx, ty) === CELL.RUIN ? { tx, ty } : null;
  }

  towerAt(tx, ty) {
    return this.towers.find((t) => t.tx === tx && t.ty === ty) || null;
  }

  canBuild(tx, ty) {
    return this.map.cell(tx, ty) === CELL.GRASS && !this.towerAt(tx, ty);
  }

  build(type, tx, ty) {
    if (this.locked) return false;
    const def = TOWERS[type];
    if (!this.unlocked.has(type) || !this.canBuild(tx, ty) || this.gold < def.cost) {
      this.sfx.play('error');
      return false;
    }
    this.record('b', type, tx, ty);
    this.gold -= def.cost;
    this.tally.spent.build += def.cost;
    this.towers.push(this.makeTower(type, tx, ty));
    this.burst(tx * TILE + 8, ty * TILE + 14, '#c28a4a', 10, 30);
    this.sfx.play('place');
    return true;
  }

  makeTower(type, tx, ty) {
    return {
      id: this.nextId++, type, tx, ty,
      x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      level: 0, cooldown: 0, recoil: 0, spent: TOWERS[type].cost, shots: 0,
      mode: TOWERS[type].target ?? 'first', disabledUntil: 0,
      xp: 0, xpLevel: 1, pending: 0, offer: null, rerolls: 0,
      mods: freshMods(), perks: {}, cards: [],
      rec: this.trackTower(type, tx, ty),
    };
  }

  trackTower(type, tx, ty) {
    const rec = { id: this.nextId - 1, type, tx, ty, dmg: 0, kills: 0, sold: false };
    this.tally.towers.push(rec);
    bump(this.tally.byType, type, 'built');
    return rec;
  }

  setMode(t, mode) {
    if (!t || this.locked || !TARGET_KEYS.includes(mode) || t.mode === mode) return;
    this.record('m', t.id, mode);
    t.mode = mode;
  }

  cycleMode(t) {
    if (!t) return;
    this.setMode(t, TARGET_KEYS[(TARGET_KEYS.indexOf(t.mode) + 1) % TARGET_KEYS.length]);
  }

  ruinCost() {
    return RUIN_COST;
  }

  clearRuin(tx, ty) {
    if (this.locked || this.state !== 'playing' || this.map.cell(tx, ty) !== CELL.RUIN) return;
    if (this.gold < RUIN_COST) {
      this.sfx.play('error');
      return;
    }
    this.record('c', tx, ty);
    this.gold -= RUIN_COST;
    this.tally.spent.ruins += RUIN_COST;
    this.map.grid[ty][tx] = CELL.GRASS;
    this.clearedRuins.push([tx, ty]);
    if (this.selectedRuin?.tx === tx && this.selectedRuin?.ty === ty) this.selectedRuin = null;
    this.burst(tx * TILE + 8, ty * TILE + 10, '#94b0c2', 14, 35);
    this.sfx.play('sell');
  }

  // Восстановление партии из сохранения (формат — см. save.js).
  load(data) {
    // Сохранения до появления местности (v1, v2) грузятся на карту старого образца.
    this.reset(data.seed, data.run ?? DEFAULT_RUN, { legacyMap: (data.v ?? 1) < 3 });
    // Старые сохранения (v1) не хранили состояние генератора — выводим его из сида и волны.
    this.rng.state = data.rng ?? (data.seed * 31 + data.wave) | 0;
    this.wave = data.wave;
    this.cleared = data.cleared ?? data.wave;
    this.gold = data.gold;
    this.lives = data.lives;
    for (const [x, y] of data.ruins ?? []) {
      if (this.map.cell(x, y) === CELL.RUIN) this.map.grid[y][x] = CELL.GRASS;
      this.clearedRuins.push([x, y]);
    }
    for (const [k, left] of Object.entries(data.abilities ?? {})) if (k in this.abilityReady) this.abilityReady[k] = left;
    for (const [ti, tx, ty, level, xp, xpLevel, pending, rerolls, spent, cards, offer, mode] of data.towers) {
      const t = this.makeTower(TOWER_KEYS[ti], tx, ty);
      Object.assign(t, { level, xp, xpLevel, pending, rerolls, spent });
      if (TARGET_KEYS[mode]) t.mode = TARGET_KEYS[mode];
      for (const c of decodeCards(cards)) applyCard(t, c);
      t.offer = pending > 0 ? (offer ? decodeCards(offer) : makeOffer(t, this.rng, this.offerSize())) : null;
      this.towers.push(t);
    }
    this.start = { save: data };
  }

  upgradeCost(t) {
    return towerLevel(TOWERS[t.type], t.level + 1).cost;
  }

  upgrade(t) {
    if (!t || this.state !== 'playing' || this.locked) return;
    const cost = this.upgradeCost(t);
    if (this.gold < cost) {
      this.sfx.play('error');
      return;
    }
    this.record('u', t.id);
    this.gold -= cost;
    this.tally.spent.rank += cost;
    t.spent += cost;
    t.level++;
    this.burst(t.x, t.y, '#ffcd75', 14, 40);
    this.sfx.play('upgrade');
  }

  sellValue(t) {
    return Math.floor(t.spent * SELL_RATIO);
  }

  sell(t) {
    if (!t || this.state !== 'playing' || this.locked) return;
    this.record('s', t.id);
    const value = this.sellValue(t);
    this.gold += value;
    this.tally.gold.sells += value;
    Object.assign(t.rec, { sold: true, level: t.level, xpLevel: t.xpLevel, cards: t.cards.length });
    this.towers = this.towers.filter((o) => o !== t);
    if (this.selected === t) this.selected = null;
    if (this.picking === t) this.picking = null;
    this.floatText(t.x, t.y - 6, `+${value}`, '#ffcd75');
    this.burst(t.x, t.y + 6, '#94b0c2', 12, 35);
    this.sfx.play('sell');
  }

  // ---------- способности игрока ----------

  abilityCost(name) {
    return ABILITIES[name].cost(Math.max(1, this.wave));
  }

  abilityLeft(name) {
    return Math.max(0, this.abilityReady[name] - this.time);
  }

  canCast(name) {
    return this.state === 'playing' && !this.mut.has('noability') && this.abilityLeft(name) <= 0 &&
      this.gold >= this.abilityCost(name) && (name !== 'repair' || this.lives < this.maxLives);
  }

  // Метеор требует точку на карте; остальное срабатывает сразу.
  useAbility(name) {
    if (this.locked) return;
    if (!this.canCast(name)) {
      this.sfx.play('error');
      return;
    }
    if (name === 'meteor') {
      this.buildType = null;
      this.targeting = this.targeting === 'meteor' ? null : 'meteor';
    } else {
      this.castAbility(name, 0, 0);
    }
  }

  castAbility(name, x, y) {
    if (this.locked || !ABILITIES[name] || !this.canCast(name)) return;
    const def = ABILITIES[name];
    x = Math.round(x);
    y = Math.round(y);
    this.record('a', name, x, y);
    this.tally.spent.abilities += this.abilityCost(name);
    bump(this.tally.abilities, name, 'casts');
    this.gold -= this.abilityCost(name);
    this.abilityReady[name] = this.time + def.cd * (1 - 0.1 * this.talent('strategist'));
    if (name === 'meteor') {
      this.effects.push({ kind: 'meteor', x, y, at: this.time + 0.6, start: this.time });
    } else if (name === 'freeze') {
      for (const e of this.enemies) {
        const t = (e.def.boss ? def.bossTime : def.time) * (1 - (e.def.slowResist ?? 0));
        e.frozenUntil = Math.max(e.frozenUntil, this.time + t);
      }
      this.shake = 0.15;
      this.burst(160, 96, '#73eff7', 40, 120);
    } else if (name === 'repair') {
      this.lives = Math.min(this.maxLives, this.lives + def.lives);
      const c = this.map.castle;
      this.burst(c.x * TILE + 8, c.y * TILE + 8, '#a7f070', 20, 40);
    }
    this.sfx.play(name === 'repair' ? 'upgrade' : 'boom');
  }

  updateEffects() {
    for (const fx of this.effects) {
      if (fx.done || fx.at > this.time) continue;
      fx.done = true;
      if (fx.kind === 'meteor') {
        const def = ABILITIES.meteor;
        const dmg = def.damage * waveHpMul(Math.max(1, this.wave));
        for (const e of this.enemies) {
          if (!e.dead && Math.hypot(e.x - fx.x, e.y - fx.y) <= def.radius * TILE) this.damage(e, dmg, null, 'magic', false, 0, 'meteor');
        }
        this.shake = 0.3;
        this.burst(fx.x, fx.y, '#ef7d57', 30, 80);
        this.burst(fx.x, fx.y, '#ffcd75', 20, 50);
        this.sfx.play('boom');
      }
    }
    this.effects = this.effects.filter((fx) => !fx.done);
  }

  // ---------- опыт и карточки ----------

  get pendingCount() {
    return this.towers.reduce((sum, t) => sum + t.pending, 0);
  }

  offerSize() {
    return 3 + this.talent('choice');
  }

  openPick(t) {
    if (!t || t.pending <= 0 || this.state !== 'playing' || this.replaying) return;
    this.picking = t;
    this.selected = t;
    this.buildType = null;
  }

  closePick() {
    this.picking = null;
  }

  nextPending() {
    this.openPick(this.towers.find((t) => t.pending > 0));
  }

  pickCard(i, t = this.picking) {
    const card = t?.offer?.[i];
    if (!card || this.locked) return;
    this.record('p', t.id, i);
    this.tally.cards[card.rarity]++;
    applyCard(t, card);
    t.pending--;
    t.rerolls = 0;
    t.offer = t.pending > 0 ? makeOffer(t, this.rng, this.offerSize()) : null;
    if (!t.offer && this.picking === t) this.picking = null;
    this.burst(t.x, t.y, card.rarity === 'legendary' ? '#ffcd75' : '#a7f070', 16, 45);
    this.sfx.play(card.rarity === 'legendary' ? 'win' : 'upgrade');
  }

  get canReroll() {
    return !this.mut.has('noreroll');
  }

  rerollCost(t) {
    return Math.round(rerollCost(t) * (1 - 0.1 * this.talent('merchant')));
  }

  reroll(t = this.picking) {
    if (!t?.offer || this.locked || !this.canReroll) return;
    const cost = this.rerollCost(t);
    if (this.gold < cost) {
      this.sfx.play('error');
      return;
    }
    this.record('r', t.id);
    this.gold -= cost;
    this.tally.spent.rerolls += cost;
    t.rerolls++;
    t.offer = makeOffer(t, this.rng, this.offerSize());
    this.sfx.play('reroll');
  }

  // Опыт башни делится на множитель здоровья волны: иначе на поздних волнах (урон в сотни раз больше)
  // новые башни пролетают десятки уровней за секунды и заваливают игрока карточками.
  gainXp(t, amount) {
    t.xp += (amount / this.hpMul) * (TOWERS[t.type].xpMul ?? 1) * (1 + t.mods.xp) * (1 + 0.1 * this.talent('science'));
    let need;
    while (t.xp >= (need = xpToNext(t.xpLevel))) {
      t.xp -= need;
      t.xpLevel++;
      t.pending++;
      t.offer ??= makeOffer(t, this.rng, this.offerSize());
      this.floatText(t.x, t.y - 14, `УР.${t.xpLevel}`, '#a7f070');
      this.burst(t.x, t.y, '#a7f070', 10, 35);
      this.sfx.play('levelup');
    }
  }

  // Итоговые характеристики башни: ранг (за золото) + карточки + аура соседей + холм.
  stats(t, level = t.level) {
    const def = TOWERS[t.type];
    const base = towerLevel(def, level);
    const m = t.mods;
    const aura = this.towers.some((o) => o !== t && o.perks.aura && Math.hypot(o.x - t.x, o.y - t.y) <= AURA_RADIUS);
    const hill = this.map.feature(t.tx, t.ty) === 'hill';
    const dmgMul = 1 + m.dmg + (aura ? 0.15 : 0);
    const spdMul = 1 + m.rate + (aura ? 0.1 : 0);
    return {
      damage: base.damage * dmgMul,
      rate: base.rate / spdMul,
      range: base.range * (1 + m.range) * (hill ? 1.2 : 1),
      splash: base.splash ? base.splash * (1 + m.splash) : 0,
      slow: base.slow ? Math.min(0.85, base.slow + m.slow) : 0,
      slowTime: base.slowTime ? base.slowTime * (1 + m.slowTime) : 0,
      chain: base.chain ? base.chain + m.chain : 0,
      burn: base.burn ? base.burn * (1 + m.burn) * dmgMul : 0,
      burnTime: base.burnTime ? base.burnTime * (1 + m.burnTime) : 0,
      push: base.push ? base.push * (1 + m.push) : 0,
      wetTime: base.wetTime ? base.wetTime * (1 + m.wetTime) : 0,
      crit: m.crit,
      pierce: m.pierce + (base.pierce ?? 0),
      multishot: Math.min(1, m.multishot),
      aura,
      hill,
    };
  }

  // ---------- симуляция ----------

  update(dt) {
    if (this.replay) {
      const { actions } = this.replay;
      while (this.replay.idx < actions.length && actions[this.replay.idx][0] <= this.tick) {
        this.applyAction(actions[this.replay.idx++]);
      }
      if (this.tick >= this.replay.endTick && this.state === 'playing') {
        this.state = 'ended';
        this.emit('replayEnd');
        return;
      }
    }
    this.tick++;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);

    if (this.waveActive) {
      this.waveTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].time <= this.waveTime) {
        this.spawn(this.spawnQueue.shift().type);
      }
    }

    this.updateEffects();
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const t of this.towers) this.updateTower(t, dt);
    for (const p of this.projectiles) this.updateProjectile(p, dt);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity ?? 0) * dt;
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 12 * dt;
    }
    for (const z of this.zaps) z.life -= dt;

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.done);
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
    this.zaps = this.zaps.filter((z) => z.life > 0);

    if (this.lives <= 0 && this.state === 'playing') {
      this.lives = 0;
      this.state = 'lost';
      this.buildType = null;
      this.targeting = null;
      this.picking = null;
      this.sfx.play('lose');
      this.emit('lost');
      return;
    }

    if (this.waveActive && !this.spawnQueue.length && !this.enemies.length) this.clearWaves();
  }

  // Поле очищено: бонусы за все волны с последней зачистки и доход рудных жил.
  clearWaves() {
    this.waveActive = false;
    let bonus = 0;
    for (let n = this.cleared + 1; n <= this.wave; n++) bonus += this.bonusFor(n);
    const waves = this.wave - this.cleared;
    let ore = 0;
    for (const t of this.towers) {
      if (this.map.feature(t.tx, t.ty) !== 'ore') continue;
      const g = (5 + this.wave) * waves;
      ore += g;
      this.floatText(t.x, t.y - 12, `+${g}`, '#ffcd75');
    }
    this.gold += bonus + ore;
    this.tally.gold.waves += bonus;
    this.tally.gold.ore += ore;
    this.cleared = this.wave;
    this.emit('clear', { bonus, ore });
  }

  spawn(type) {
    const def = enemyForm(type, formIndex(type, this.wave));
    const hp = Math.round(def.hp * this.hpMul * (this.mut.has('tough') ? 1.3 : 1));
    // С 20-й волны каждый второй враг идёт через второй вход, если он есть.
    const route = this.map.routes.length > 1 && this.wave >= SECOND_ROUTE_FROM && this.spawnCount % 2 === 1 ? 1 : 0;
    this.spawnCount++;
    this.addEnemy(type, def, hp, 0, undefined, route, this.affixes);
  }

  addEnemy(type, def, hp, dist, gold, route = 0, affixes = []) {
    bump(this.tally.enemies, type, 'spawned');
    const p = this.map.pointAt(dist, route);
    const has = (a) => affixes.includes(a);
    this.enemies.push({
      type, def, hp, maxHp: hp, dist, route, x: p.x, y: p.y, dir: 1, gold,
      off: (Math.random() - 0.5) * 4, anim: Math.random() * 10,
      armor: def.armor + (has('armor') ? 3 : 0),
      regen: (def.regen ?? 0) + (has('regen') ? 0.01 : 0),
      shield: has('shield') ? hp * 0.25 : 0,
      volatile: has('volatile'), fog: has('fog'), haste: has('haste'),
      slowUntil: 0, slowAmt: 0, brittle: 0, frozenUntil: 0, wetUntil: 0, pushedAt: -Infinity,
      burnUntil: 0, burnDps: 0, burnSrc: null, healCd: def.heal?.every ?? 0, lastHit: -Infinity,
      disableCd: def.disable ? def.disable.every / 2 : 0,
      summoned: false, phase: 0, invulnUntil: 0, dashCd: def.dash?.every ?? 0, dashUntil: 0,
      flash: 0, dead: false,
    });
  }

  remaining(e) {
    return this.map.routeLength(e.route) - e.dist;
  }

  updateEnemy(e, dt) {
    const def = e.def;
    e.flash = Math.max(0, e.flash - dt);

    const burning = e.burnUntil > this.time;
    if (burning) this.damage(e, e.burnDps * dt, e.burnSrc, 'magic', true);
    if (e.dead) return;
    // Регенерация стоит, пока враг горит и ещё REGEN_DELAY секунд после любого попадания:
    // под плотным огнём босс не лечится, а через дыры в обороне — отрастает.
    if (e.regen && !burning && this.time - e.lastHit >= REGEN_DELAY) {
      e.hp = Math.min(e.maxHp, e.hp + e.regen * e.maxHp * dt);
    }
    if (def.heal && (e.healCd -= dt) <= 0) {
      e.healCd = def.heal.every;
      this.healAround(e, def.heal);
    }
    if (def.disable && (e.disableCd -= dt) <= 0) this.sabotage(e, def.disable);

    if (e.frozenUntil > this.time) return;
    const slowed = e.slowUntil > this.time;
    let speed = def.speed * (this.mut.has('swift') ? 1.2 : 1) * (slowed ? 1 - e.slowAmt : 1);
    const length = this.map.routeLength(e.route);
    if (e.haste && e.dist > length / 2) speed *= 1.4;
    if (def.dash) {
      if ((e.dashCd -= dt) <= 0) {
        e.dashCd = def.dash.every;
        e.dashUntil = this.time + def.dash.time;
        this.burst(e.x, e.y, '#a7f070', 8, 30);
      }
      if (e.dashUntil > this.time) speed *= def.dash.mul;
    }
    e.dist += speed * TILE * dt;
    e.anim += dt * (slowed ? 0.5 : 1);
    if (e.dist >= length) {
      e.dead = true;
      // Босс снимает жизни пропорционально оставшемуся здоровью: почти добитый — 1, целый — все.
      const lost = def.boss ? Math.max(1, Math.ceil(def.lives * e.hp / e.maxHp)) : (def.lives ?? 1);
      this.lives -= lost;
      bump(this.tally.enemies, e.type, 'leaked');
      bump(this.tally.enemies, e.type, 'lives', lost);
      this.shake = 0.25;
      this.sfx.play('leak');
      return;
    }
    const p = this.map.pointAt(e.dist, e.route);
    if (Math.abs(p.x - e.x) > 0.01) e.dir = p.x > e.x ? 1 : -1;
    e.x = p.x;
    e.y = p.y;
  }

  // Шаман лечит на долю здоровья цели, но считает её не больше чем от собственного максимума:
  // иначе боссы (в десятки раз толще шамана) восстанавливались полностью за пару секунд.
  healAround(src, heal) {
    let healed = false;
    for (const o of this.enemies) {
      if (o.dead || o === src || o.hp >= o.maxHp) continue;
      if (Math.hypot(o.x - src.x, o.y - src.y) > heal.radius * TILE) continue;
      o.hp = Math.min(o.maxHp, o.hp + Math.min(o.maxHp, src.maxHp) * heal.pct);
      this.burst(o.x, o.y - 6, '#a7f070', 3, 15);
      healed = true;
    }
    if (healed) this.burst(src.x, src.y - 8, '#a7f070', 6, 25);
  }

  // Диверсант отключает ближайшую башню в радиусе.
  sabotage(e, dis) {
    let best = null, bestD = dis.radius * TILE;
    for (const t of this.towers) {
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (d <= bestD && t.disabledUntil <= this.time) { best = t; bestD = d; }
    }
    if (!best) {
      e.disableCd = 0.5;
      return;
    }
    e.disableCd = dis.every;
    this.stun(best, dis.time);
  }

  stun(t, time) {
    t.disabledUntil = Math.max(t.disabledUntil, this.time + time);
    this.burst(t.x, t.y - 6, '#94b0c2', 8, 25);
    this.floatText(t.x, t.y - 12, 'ОТКЛ', '#ef7d57');
  }

  // Цели в радиусе в порядке приоритета башни. Враги в тумане видны только вблизи.
  findTargets(t, range, hitsAir, mode = t.mode) {
    const list = this.enemies.filter((e) => {
      if (e.dead || (!hitsAir && e.def.flying)) return false;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      return d <= range && (!e.fog || d <= FOG_RANGE);
    });
    const rem = (e) => this.remaining(e);
    switch (mode) {
      case 'last': return list.sort((a, b) => rem(b) - rem(a));
      case 'strong': return list.sort((a, b) => b.hp - a.hp || rem(a) - rem(b));
      case 'close': return list.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
      case 'air': return list.sort((a, b) => (b.def.flying ? 1 : 0) - (a.def.flying ? 1 : 0) || rem(a) - rem(b));
      default: return list.sort((a, b) => rem(a) - rem(b));
    }
  }

  updateTower(t, dt) {
    t.recoil = Math.max(0, t.recoil - dt);
    if (t.disabledUntil > this.time) return;
    t.cooldown -= dt;
    if (t.cooldown > 0) return;
    const def = TOWERS[t.type];
    const s = this.stats(t);
    const targets = this.findTargets(t, s.range * TILE, def.hitsAir);
    if (!targets.length) return;
    t.cooldown = s.rate;
    t.recoil = 0.1;
    t.shots++;

    if (def.projectile === 'zap') {
      if (t.perks.storm && t.shots % 4 === 0) this.storm(t, s, targets);
      else this.zap(t, s, targets[0]);
    } else if (t.perks.tsunami && t.shots % 5 === 0) {
      for (const e of targets) this.fire(t, s, e, 1);
    } else {
      this.fire(t, s, targets[0], 1);
      if (t.perks.volley) {
        for (const e of targets.slice(1, 3)) this.fire(t, s, e, 0.6);
      } else if (targets.length > 1 && this.rng.next() < s.multishot) {
        this.fire(t, s, targets[1], 1);
      }
    }
    if (def.projectile === 'ball') this.burst(t.x, t.y - 8, '#ffcd75', 4, 20);
    this.sfx.play(def.projectile);
  }

  fire(t, s, target, mul) {
    const def = TOWERS[t.type];
    const sx = t.x, sy = t.y - 6;
    this.projectiles.push({
      kind: def.projectile, x: sx, y: sy, vx: 0, vy: 0,
      target, tx: target.x, ty: target.y,
      total: Math.hypot(target.x - sx, target.y - sy) || 1, remaining: 1,
      speed: def.speed * TILE, damage: s.damage * mul, dmgType: def.dmgType, pierce: s.pierce,
      splash: s.splash * TILE, slow: s.slow, slowTime: s.slowTime, burn: s.burn, burnTime: s.burnTime,
      push: s.push, wetTime: s.wetTime,
      hitsAir: def.hitsAir, cluster: !!t.perks.cluster, src: t, done: false,
    });
  }

  // Молния мага: мгновенный удар с перескоками на ближайших соседей.
  zap(t, s, first) {
    const hit = [first];
    let dmg = s.damage;
    this.strike(t, first, dmg);
    for (let i = 0; i < s.chain; i++) {
      const cur = hit[hit.length - 1];
      let next = null, best = CHAIN_RADIUS;
      for (const e of this.enemies) {
        if (e.dead || hit.includes(e)) continue;
        const d = Math.hypot(e.x - cur.x, e.y - cur.y);
        if (d <= best) { best = d; next = e; }
      }
      if (!next) break;
      dmg *= 0.75;
      hit.push(next);
      this.strike(t, next, dmg);
    }
    this.zaps.push({ points: [{ x: t.x, y: t.y - 7 }, ...hit.map((e) => ({ x: e.x, y: e.y - (e.def.flying ? 10 : 4) }))], life: 0.15 });
  }

  storm(t, s, targets) {
    for (const e of targets) {
      this.strike(t, e, s.damage * 0.6);
      this.zaps.push({ points: [{ x: t.x, y: t.y - 7 }, { x: e.x, y: e.y - (e.def.flying ? 10 : 4) }], life: 0.2 });
    }
    this.burst(t.x, t.y - 8, '#c165e0', 12, 40);
  }

  // Удар молнии с реакциями: мокрый враг получает +50%, горящий — «перегрузка» (взрыв по соседям).
  strike(t, e, dmg) {
    if (e.dead) return;
    if (e.wetUntil > this.time) dmg *= 1.5;
    const overload = e.burnUntil > this.time;
    this.damage(e, dmg, t, 'magic');
    if (!overload) return;
    this.tally.reactions.overload++;
    for (const o of this.enemies) {
      if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) <= TILE) this.damage(o, dmg * 0.3, t, 'magic', true);
    }
    this.burst(e.x, e.y - 4, '#c165e0', 8, 35);
  }

  updateProjectile(p, dt) {
    if (p.target && !p.target.dead) {
      p.tx = p.target.x;
      p.ty = p.target.y - (p.target.def.flying ? 8 : 2);
    }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    p.remaining = d;
    if (d <= step) {
      p.x = p.tx;
      p.y = p.ty;
      p.done = true;
      this.hit(p);
      return;
    }
    p.vx = dx / d;
    p.vy = dy / d;
    p.x += p.vx * step;
    p.y += p.vy * step;
    if (p.kind === 'fireball' && Math.random() < 0.5) {
      this.particles.push({ x: p.x, y: p.y, vx: 0, vy: -8, life: 0.25, maxLife: 0.25, color: '#ef7d57', size: 1 });
    }
  }

  hit(p) {
    if (p.splash > 0) {
      const fire = p.kind === 'fireball';
      for (const e of this.enemies) {
        if (e.dead || (!p.hitsAir && e.def.flying)) continue;
        if (Math.hypot(e.x - p.tx, e.y - p.ty) > p.splash) continue;
        // «Термошок»: огонь по замедленному или замороженному врагу — двойной прямой урон.
        const shock = fire && (e.slowUntil > this.time || e.frozenUntil > this.time);
        if (shock) {
          this.floatText(e.x, e.y - 12, 'шок', '#ef7d57');
          this.tally.reactions.shock++;
        }
        this.damage(e, p.damage * (shock ? 2 : 1), p.src, p.dmgType, false, p.pierce);
        this.applyEffects(e, p);
      }
      this.burst(p.tx, p.ty, fire ? '#ffcd75' : '#ef7d57', p.kind === 'bomb' ? 5 : 10, fire ? 35 : 50);
      this.burst(p.tx, p.ty, fire ? '#ef7d57' : '#ffcd75', p.kind === 'bomb' ? 3 : 6, 30);
      this.sfx.play('boom');
      if (p.cluster) this.dropBomblets(p);
      return;
    }
    const e = p.target;
    if (!e || e.dead) return;
    if (e.def.dodge && this.rng.next() < e.def.dodge) {
      this.floatText(e.x, e.y - 12, 'мимо', '#94b0c2');
      this.tally.reactions.dodge++;
      return;
    }
    this.damage(e, p.damage, p.src, p.dmgType, false, p.pierce);
    if (!e.dead) this.applyEffects(e, p);
  }

  // Замедление, заморозка, поджог, отталкивание и намокание от попадания.
  applyEffects(e, p) {
    const resist = e.def.slowResist ?? 0;
    if (p.slow) {
      // Лёд по мокрому врагу — мгновенная заморозка.
      if (e.wetUntil > this.time) {
        e.frozenUntil = Math.max(e.frozenUntil, this.time + 0.8 * (1 - resist));
        e.wetUntil = 0;
        this.tally.reactions.wetFreeze++;
        this.burst(e.x, e.y - 4, '#f4f4f4', 8, 30);
      }
      const stillSlowed = e.slowUntil > this.time;
      e.slowAmt = Math.max(stillSlowed ? e.slowAmt : 0, p.slow * (1 - resist));
      e.brittle = Math.max(stillSlowed ? e.brittle : 0, p.src.mods.brittle);
      e.slowUntil = Math.max(e.slowUntil, this.time + p.slowTime);
      if (p.src.perks.zero && this.rng.next() < 0.15) {
        e.frozenUntil = this.time + (e.def.boss ? 0.4 : 1.2) * (1 - resist);
        this.burst(e.x, e.y - 4, '#f4f4f4', 8, 30);
      }
      this.burst(p.tx, p.ty, '#73eff7', 4, 20);
    }
    if (p.burn) {
      if (p.burn >= e.burnDps || e.burnUntil <= this.time) {
        e.burnDps = p.burn;
        e.burnSrc = p.src;
      }
      e.burnUntil = Math.max(e.burnUntil, this.time + p.burnTime);
    }
    if (p.wetTime) {
      e.wetUntil = Math.max(e.wetUntil, this.time + p.wetTime);
      // Отталкивание не чаще раза в 1.2 с на врага, боссов — вчетверо слабее.
      if (this.time - e.pushedAt >= 1.2) {
        e.pushedAt = this.time;
        e.dist = Math.max(0, e.dist - p.push * TILE * (e.def.boss ? 0.25 : 1));
      }
      this.burst(p.tx, p.ty, '#41a6f6', 4, 20);
    }
  }

  // Кассетные бомбы: три малых снаряда разлетаются от места взрыва.
  dropBomblets(p) {
    for (let i = 0; i < 3; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = TILE * (0.6 + this.rng.next() * 0.6);
      const tx = p.tx + Math.cos(a) * r, ty = p.ty + Math.sin(a) * r;
      this.projectiles.push({
        kind: 'bomb', x: p.tx, y: p.ty, vx: 0, vy: 0, target: null, tx, ty,
        total: r, remaining: r, speed: 3 * TILE, damage: p.damage * 0.4, dmgType: 'phys', pierce: p.pierce,
        splash: 0.6 * TILE, slow: 0, slowTime: 0, burn: 0, burnTime: 0, push: 0, wetTime: 0,
        hitsAir: false, cluster: false, src: p.src, done: false,
      });
    }
  }

  // dot — урон со временем (горение, взрывы): без критов, брони и минимального урона.
  // tag — источник без башни (способность), для статистики.
  damage(e, amount, src, type = 'phys', dot = false, pierce = 0, tag = null) {
    if (e.dead) return;
    const def = e.def;
    if (e.invulnUntil > this.time) return;
    if (e.brittle && e.slowUntil > this.time) amount *= 1 + e.brittle;
    if (src && (def.boss || e.type === 'golem')) amount *= 1 + src.mods.bigDmg;
    if (src && !dot) {
      if (this.rng.next() < src.mods.crit) {
        amount *= 2;
        this.tally.reactions.crit++;
        this.burst(e.x, e.y - 6, '#ffcd75', 5, 30);
      }
      if (src.perks.deadeye && this.rng.next() < 0.15) {
        amount *= 5;
        this.tally.reactions.deadeye++;
        this.floatText(e.x, e.y - 14, 'x5', '#ef7d57');
      }
    }
    let dealt = amount;
    if (type === 'phys') {
      if (def.physResist) dealt *= 1 - def.physResist;
      if (!dot) dealt = Math.max(1, dealt - Math.max(0, e.armor - pierce));
    }
    // Щит (модификатор волны) принимает урон первым.
    let absorbed = 0;
    if (e.shield > 0) {
      absorbed = Math.min(e.shield, dealt);
      e.shield -= absorbed;
      dealt -= absorbed;
    }
    if (src?.perks.execute && !def.boss && e.hp > dealt && e.hp - dealt < e.maxHp * 0.15) {
      dealt = e.hp;
      this.tally.reactions.execute++;
    }
    dealt = Math.min(dealt, e.hp);
    e.hp -= dealt;
    if (dealt + absorbed > 0) e.lastHit = this.time;
    this.tallyDamage(e, dealt + absorbed, src, tag, dot);
    if (!dot) e.flash = 0.08;
    if (src) {
      this.gainXp(src, dealt + absorbed);
      this.playerXp += (dealt + absorbed) * PLAYER_XP_RATE * heatXpMul(this.heat);
    }
    this.bossPhases(e);
    if (e.hp > 0) return;
    this.kill(e, src, tag);
  }

  tallyDamage(e, total, src, tag, dot) {
    if (total <= 0) return;
    const tl = this.tally;
    tl.totalDmg += total;
    if (src) {
      src.rec.dmg += total;
      bump(tl.byType, src.type, 'dmg', total);
    } else if (tag) {
      bump(tl.abilities, tag, 'dmg', total);
    }
    if (!dot && (!tl.best || total > tl.best.dmg)) {
      tl.best = { dmg: total, by: src?.type ?? tag, enemy: e.def.name, wave: this.wave };
    }
  }

  bossPhases(e) {
    const def = e.def;
    if (def.summon && !e.summoned && e.hp > 0 && e.hp <= e.maxHp * def.summon.at) {
      e.summoned = true;
      const s = def.summon;
      const minion = enemyForm(s.type, formIndex(s.type, this.wave));
      for (let i = 0; i < s.count; i++) {
        this.addEnemy(s.type, minion, Math.round(minion.hp * this.hpMul), Math.max(0, e.dist - 4 - i * 6), undefined, e.route);
      }
      this.floatText(e.x, e.y - 20, 'ПОДМОГА!', '#ef7d57');
    }
    const shields = def.shieldAt;
    if (shields && e.phase < shields.length && e.hp > 0 && e.hp <= e.maxHp * shields[e.phase]) {
      e.phase++;
      e.invulnUntil = this.time + 2;
      this.floatText(e.x, e.y - 20, 'ЩИТ', '#73eff7');
      this.burst(e.x, e.y - 10, '#73eff7', 16, 40);
    }
  }

  kill(e, src, tag = null) {
    const def = e.def;
    e.dead = true;
    const gold = (e.gold ?? killGold(e.type, this.wave)) + (src?.mods.gold ?? 0);
    this.gold += gold;
    const tl = this.tally;
    tl.kills++;
    tl.gold.kills += gold;
    bump(tl.enemies, e.type, 'killed');
    if (src) {
      src.rec.kills++;
      bump(tl.byType, src.type, 'kills');
    } else if (tag) {
      bump(tl.abilities, tag, 'kills');
    }
    this.floatText(e.x, e.y - 10, `+${gold}`, '#ffcd75');
    this.burst(e.x, e.y, def.flying ? '#7b3f9e' : '#b13e53', def.boss ? 30 : 10, def.boss ? 60 : 40);
    this.sfx.play('coin');

    // Королевский слизень распадается на малых слизней.
    if (def.split) {
      const child = enemyForm('slime', 0);
      for (let i = 0; i < def.split; i++) {
        this.addEnemy('slime', child, Math.max(1, Math.round(e.maxHp * 0.3)), Math.max(0, e.dist - 6 + i * 12), 1, e.route);
      }
    }
    // «Взрывные» (модификатор волны): гибнущий враг оглушает башни рядом.
    if (e.volatile) {
      for (const t of this.towers) if (Math.hypot(t.x - e.x, t.y - e.y) <= TILE * 1.1) this.stun(t, 1.5);
      this.burst(e.x, e.y, '#ffcd75', 10, 40);
    }
    // «Пепел»: сгоревший враг взрывается и обжигает соседей.
    const ash = e.burnUntil > this.time && e.burnSrc?.perks.ash;
    if (ash && !def.boss) {
      for (const o of this.enemies) {
        if (!o.dead && Math.hypot(o.x - e.x, o.y - e.y) <= TILE) this.damage(o, e.maxHp * 0.25, e.burnSrc, 'magic', true);
      }
      this.burst(e.x, e.y, '#ef7d57', 14, 45);
    }
  }

  // ---------- эффекты ----------

  burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = 0.3 + Math.random() * 0.4;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10,
        gravity: 80, life, maxLife: life, color, size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  floatText(x, y, text, color) {
    this.texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }
}
