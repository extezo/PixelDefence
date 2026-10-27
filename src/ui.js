import {
  TOWERS, TOWER_KEYS, ENEMIES, TARGET_MODES, ABILITIES, ABILITY_KEYS, AFFIXES, TALENTS, MUTATORS, MUTATOR_KEYS,
  makeWave, formIndex, enemyForm, waveAffixes, talentCost, runHeat, heatXpMul, dailyRun, todayUtc,
} from './config.js';
import { SPRITES } from './sprites.js';
import { RARITIES, CARD_BY_ID, xpToNext } from './cards.js';
import * as store from './save.js';
import * as api from './api.js';

const $ = (id) => document.getElementById(id);
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };

// Автовыбор берёт самую редкую карту из предложенных (при равенстве — первую).
const bestCard = (offer) => offer.reduce((best, c, i) => (RARITY_RANK[c.rarity] > RARITY_RANK[offer[best].rarity] ? i : best), 0);

const icon = (canvas) => (canvas._url ??= canvas.toDataURL());
const num = (v, digits = 1) => String(+v.toFixed(digits));
const pct = (v) => `${Math.round(v * 100)}%`;
const fmtXp = (v) => Math.floor(v).toLocaleString('ru-RU');
const fmtDate = (ms) => new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const btn = (action, label, cls = '', attrs = '') => `<button class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const ALL_TOWERS = new Set(TOWER_KEYS);

const STAT_ROWS = [
  ['Урон', 'damage', (v) => num(v)],
  ['Перезарядка', 'rate', (v) => `${num(v, 2)}с`],
  ['Радиус', 'range', (v) => num(v)],
  ['Площадь', 'splash', (v) => num(v, 2)],
  ['Замедление', 'slow', pct],
  ['Длит. замедл.', 'slowTime', (v) => `${num(v)}с`],
  ['Прыжков молнии', 'chain', (v) => v],
  ['Горение', 'burn', (v) => `${num(v)}/с`],
  ['Длит. горения', 'burnTime', (v) => `${num(v)}с`],
  ['Отталкивание', 'push', (v) => num(v, 2)],
  ['Намокание', 'wetTime', (v) => `${num(v)}с`],
  ['Крит', 'crit', pct],
  ['Пробивание', 'pierce', (v) => v],
  ['Второй выстрел', 'multishot', pct],
];

function statsTable(cur, next) {
  const rows = STAT_ROWS.filter(([, key]) => cur[key]).map(([label, key, fmt]) => {
    const up = next && fmt(next[key]) !== fmt(cur[key]) ? ` <span class="up">&gt;${fmt(next[key])}</span>` : '';
    return `<tr><td>${label}</td><td>${fmt(cur[key])}${up}</td></tr>`;
  });
  return `<table class="stats">${rows.join('')}</table>`;
}

// Взятые карточки, сгруппированные по типу; цвет — по самой редкой копии.
function cardChips(t) {
  const groups = new Map();
  for (const c of t.cards) {
    const g = groups.get(c.id) ?? { count: 0, rarity: c.rarity };
    g.count++;
    if (RARITY_RANK[c.rarity] > RARITY_RANK[g.rarity]) g.rarity = c.rarity;
    groups.set(c.id, g);
  }
  const chips = [...groups].map(([id, g]) => {
    const def = CARD_BY_ID[id];
    const title = def.perk ? def.text() : def.name;
    return `<span class="chip" style="--rc:${RARITIES[g.rarity].color}" title="${title}">${def.name}${g.count > 1 ? ` ×${g.count}` : ''}</span>`;
  });
  return chips.length ? `<div class="chips">${chips.join('')}</div>` : '';
}

const fmtNum = (v) => Math.round(v).toLocaleString('ru-RU');
const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const share = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);
const bar = (v, max, color = 'var(--green)') =>
  `<div class="sbar"><div style="width:${max > 0 ? Math.max(2, (v / max) * 100) : 0}%;background:${color}"></div></div>`;
const sourceName = (key) => TOWERS[key]?.name ?? ABILITIES[key]?.name ?? '—';

const affixList = (keys) => keys.map((k) => `<span class="affix" title="${AFFIXES[k].desc}">${AFFIXES[k].name}</span>`).join(' ');

const HELP = [
  ['Строительство', [
    ['1 – 7', 'выбрать башню'],
    ['ЛКМ', 'построить / выбрать башню или руины'],
    ['Shift + ЛКМ', 'строить несколько подряд'],
    ['ПКМ, Esc', 'отменить выбор'],
    ['U', 'повысить ранг выбранной башни (рангов сколько угодно)'],
    ['T', 'сменить приоритет цели выбранной башни'],
    ['S', 'продать выбранную башню'],
  ]],
  ['Бой', [
    ['Пробел', 'начать волну; когда текущая вся вышла — вызвать следующую досрочно за бонус'],
    ['Z', 'Метеор — затем клик по карте'],
    ['X', 'Стужа — заморозить всех врагов'],
    ['C', 'Починка — +3 жизни'],
    ['F', 'скорость x1 / x2 / x3 (в реплее до x8)'],
    ['P', 'пауза'],
    ['M', 'звук вкл/выкл'],
  ]],
  ['Карточки улучшений', [
    ['E', 'открыть выбор карты (выбранной башни или следующей)'],
    ['A', 'автовыбор вкл/выкл: сразу брать самую редкую карту'],
    ['1 – 4', 'взять карту'],
    ['R', 'перебросить карты за золото'],
    ['Esc', 'отложить выбор'],
  ]],
  ['Окна', [
    ['Esc', 'меню паузы / закрыть окно'],
    ['H, F1', 'эта справка'],
  ]],
];

export class UI {
  constructor(game, sfx) {
    this.game = game;
    this.sfx = sfx;
    this.profile = store.readProfile();
    this.shopButtons = {};
    this.abilityButtons = {};
    this.infoSig = '';
    this.cardsSig = '';
    this.screenSig = '';
    this.text = {};
    this.dialog = null;
    this.runXp = 0; // опыт игрока за текущую партию — для экрана поражения
    this.result = null; // результат отправки в таблицу лидеров
    this.currentReplay = null; // реплей, который сейчас смотрят
    this.newRunMutators = new Set(this.profile.lastMutators ?? []);
    this.leadersTab = 'normal';
    game.unlocked = this.unlockedSet();
    game.onEvent = (name, data) => this.onEvent(name, data);
    this.buildShop();
    this.buildAbilities();
    this.bindButtons();
    this.bindKeys();
    window.addEventListener('beforeunload', () => this.persistReplay());
  }

  // Пока открыт диалог, симуляция стоит.
  get blocking() {
    return !!this.dialog;
  }

  unlockedSet() {
    return new Set(TOWER_KEYS.filter((k) => !TOWERS[k].unlock || this.profile.unlocked.includes(k)));
  }

  // ---------- магазин башен и способности ----------

  buildShop() {
    const shop = $('shop');
    TOWER_KEYS.forEach((key, i) => {
      const def = TOWERS[key];
      const b = document.createElement('button');
      b.className = 'btn shop-item';
      b.innerHTML = `<img src="${icon(SPRITES.towers[key])}" alt="">
        <span class="name">${def.name}</span><span class="key">${i + 1}</span>
        <span class="cost">${def.cost} з.</span>
        <span class="lock-cost"><img src="${icon(SPRITES.lock)}" alt="">${fmtXp(def.unlock ?? 0)} оп.</span>`;
      b.addEventListener('click', () => {
        if (this.game.unlocked.has(key)) this.game.toggleBuild(key);
        else this.openDialog('arsenal');
      });
      shop.append(b);
      this.shopButtons[key] = b;
    });
  }

  buildAbilities() {
    const bar = $('abilities');
    for (const key of ABILITY_KEYS) {
      const def = ABILITIES[key];
      const b = document.createElement('button');
      b.className = 'btn ability';
      b.title = `${def.name}: ${def.desc}`;
      b.innerHTML = `<span class="ab-name">${def.name}</span><span class="ab-key">${def.key}</span>
        <span class="ab-cost"></span><span class="ab-cd"></span>`;
      b.addEventListener('click', () => this.game.useAbility(key));
      bar.append(b);
      this.abilityButtons[key] = b;
    }
  }

  // ---------- кнопки и клавиши ----------

  bindButtons() {
    const g = this.game;
    $('btn-wave').onclick = () => g.startWave();
    $('btn-speed').onclick = () => g.cycleSpeed();
    $('btn-pause').onclick = () => g.togglePause();
    $('btn-mute').onclick = () => (this.sfx.muted = !this.sfx.muted);
    $('btn-cards').onclick = () => g.nextPending();
    $('btn-reroll').onclick = () => g.reroll();
    $('btn-later').onclick = () => g.closePick();
    $('btn-auto').onclick = () => this.toggleAutoPick();
    $('btn-menu').onclick = () => this.openDialog('pause');
    $('btn-help').onclick = () => this.openDialog('help');
    $('btn-exit-replay').onclick = () => this.toMenu();
    $('card-row').addEventListener('click', (e) => {
      const i = e.target.closest('[data-pick]')?.dataset.pick;
      if (i !== undefined) g.pickCard(Number(i));
    });
    // pointerdown, а не click: панель перерисовывается при каждом изменении золота,
    // и click мог бы потеряться между нажатием и отпусканием.
    $('info').addEventListener('pointerdown', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'upgrade') g.upgrade(g.selected);
      if (action === 'sell') g.sell(g.selected);
      if (action === 'cards') g.openPick(g.selected);
      if (action === 'mode') g.cycleMode(g.selected);
      if (action === 'clear-ruin' && g.selectedRuin) g.clearRuin(g.selectedRuin.tx, g.selectedRuin.ty);
    });
    const onAction = (e) => {
      const el = e.target.closest('[data-action]');
      if (el && !el.disabled) this.action(el.dataset.action, el.dataset);
    };
    $('screen-actions').addEventListener('click', onAction);
    $('screen-text').addEventListener('click', onAction);
    $('dialog').addEventListener('click', (e) => {
      if (e.target.id === 'dialog') this.closeDialog(); // клик по затемнению
      else onAction(e);
    });
    $('replay-file').addEventListener('change', (e) => this.openReplayFile(e.target));
    // Первый клик/нажатие где угодно включает звук.
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Снимаем фокус с кнопок, чтобы Пробел запускал волну, а не «нажимал» кнопку повторно.
    document.addEventListener('click', (e) => e.target.closest('button')?.blur());
  }

  bindKeys() {
    const abilityByKey = Object.fromEntries(ABILITY_KEYS.map((k) => [`Key${ABILITIES[k].key}`, k]));
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const g = this.game;
      if (this.dialog) {
        if (e.code === 'Escape') this.closeDialog();
        return;
      }
      if (e.target.closest?.('input, textarea')) return;
      if (e.code === 'KeyH' || e.code === 'F1') {
        e.preventDefault();
        this.openDialog('help');
        return;
      }
      if (e.code === 'KeyM') this.sfx.muted = !this.sfx.muted;
      if (g.state !== 'playing') return;

      const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : 0;
      if (e.code === 'KeyA') {
        this.toggleAutoPick();
        return;
      }
      if (g.picking) {
        if (digit >= 1 && digit <= g.picking.offer.length) g.pickCard(digit - 1);
        else if (e.code === 'KeyR') g.reroll();
        else if (e.code === 'Escape') g.closePick();
        return;
      }
      if (digit >= 1 && digit <= TOWER_KEYS.length) {
        const key = TOWER_KEYS[digit - 1];
        if (g.unlocked.has(key)) g.toggleBuild(key);
        else this.sfx.play('error');
        return;
      }
      if (abilityByKey[e.code]) {
        g.useAbility(abilityByKey[e.code]);
        return;
      }
      switch (e.code) {
        case 'Space': e.preventDefault(); g.startWave(); break;
        case 'Escape':
          if (g.buildType || g.selected || g.selectedRuin || g.targeting) g.cancel();
          else if (!g.replaying) this.openDialog('pause');
          break;
        case 'KeyU': g.upgrade(g.selected); break;
        case 'KeyS': g.sell(g.selected); break;
        case 'KeyT': g.cycleMode(g.selected); break;
        case 'KeyE': g.selected?.pending ? g.openPick(g.selected) : g.nextPending(); break;
        case 'KeyF': g.cycleSpeed(); break;
        case 'KeyP': g.togglePause(); break;
      }
    });
  }

  // ---------- действия меню и диалогов ----------

  action(name, data = {}) {
    const g = this.game;
    switch (name) {
      case 'new':
        if (this.confirmLeave()) this.openDialog('newgame');
        break;
      case 'start-new': this.newGame(); break;
      case 'mutator': {
        const m = data.mutator;
        if (this.newRunMutators.has(m)) this.newRunMutators.delete(m);
        else this.newRunMutators.add(m);
        this.renderDialog();
        break;
      }
      case 'daily':
        if (this.confirmLeave()) this.startDaily();
        break;
      case 'continue': {
        const last = store.latestSlot();
        if (last && this.confirmLeave()) this.loadData(last.data);
        break;
      }
      case 'resume': this.closeDialog(); break;
      case 'close': this.closeDialog(); break;
      case 'menu': if (this.confirmLeave()) this.toMenu(); break;
      case 'saves': case 'arsenal': case 'leaders': case 'help': case 'nick': case 'stats': this.openDialog(name); break;
      case 'leaders-tab': this.leadersTab = data.tab; this.renderDialog(); break;
      case 'watch': {
        const rep = store.readReplay();
        if (store.validReplay(rep)) this.watchReplay(rep);
        break;
      }
      case 'rewatch': if (this.currentReplay) this.watchReplay(this.currentReplay); break;
      case 'download': this.downloadReplay(); break;
      case 'open-replay': $('replay-file').click(); break;
      case 'slot-save': {
        const i = Number(data.slot);
        if (store.readSlot(i) && !confirm(`Перезаписать слот ${i + 1}?`)) return;
        const ok = store.writeSlot(i, g);
        this.renderDialog();
        this.message(ok ? `Сохранено в слот ${i + 1}` : 'Не удалось сохранить: хранилище браузера недоступно');
        if (ok) this.sfx.play('place');
        break;
      }
      case 'slot-load': {
        const save = store.readSlot(Number(data.slot));
        if (save && this.confirmLeave()) this.loadData(save);
        break;
      }
      case 'slot-del':
        if (confirm(`Удалить сохранение из слота ${Number(data.slot) + 1}?`)) {
          store.deleteSlot(Number(data.slot));
          this.renderDialog();
        }
        break;
      case 'export': {
        const str = store.exportString(g);
        $('save-string').value = str;
        $('save-string').select();
        navigator.clipboard?.writeText(str).then(
          () => this.message('Строка скопирована в буфер обмена'),
          () => this.message('Скопируйте строку из поля выше'),
        );
        break;
      }
      case 'import': {
        const save = store.importString($('save-string').value);
        if (!save) this.message('Строка не похожа на сохранение этой игры');
        else if (this.confirmLeave()) this.loadData(save);
        break;
      }
      case 'unlock': this.unlock(data.type); break;
      case 'talent': this.buyTalent(data.talent); break;
      case 'autopick': this.toggleAutoPick(); this.renderDialog(); break;
      case 'register': this.registerNick(); break;
    }
  }

  // Предупреждение, если текущая партия идёт и будет брошена.
  confirmLeave() {
    const g = this.game;
    const inRun = g.state === 'playing' && !g.replaying && (g.wave > 0 || g.towers.length > 0);
    return !inRun || confirm('Текущая партия будет прервана. Несохранённый прогресс пропадёт. Продолжить?');
  }

  // Условия обычной партии: таланты из профиля и выбранные усложнения.
  newGame() {
    const mutators = MUTATOR_KEYS.filter((m) => this.newRunMutators.has(m));
    this.profile.lastMutators = mutators;
    store.writeProfile(this.profile);
    this.flushXp();
    this.persistReplay();
    this.game.reset(undefined, { talents: { ...this.profile.talents }, mutators, daily: null });
    this.startRun();
    if (mutators.length) this.banner(`ЖАР ${runHeat(this.game.run)}<br><small>опыт x${num(heatXpMul(this.game.heat), 2)}</small>`);
  }

  // Вызов дня: одна карта и одни усложнения для всех, все башни открыты, таланты не действуют.
  startDaily() {
    const day = todayUtc();
    const { seed, run } = dailyRun(day);
    this.flushXp();
    this.persistReplay();
    this.game.reset(seed, run);
    this.startRun(ALL_TOWERS);
    this.banner(`ВЫЗОВ ДНЯ<br><small>${day}: ${run.mutators.map((m) => MUTATORS[m].name).join(', ')}</small>`);
  }

  loadData(data) {
    this.flushXp();
    this.persistReplay();
    this.game.load(data);
    this.startRun(data.run?.daily ? ALL_TOWERS : undefined);
    this.banner(`ВОЛНА ${data.wave}<br><small>сохранение загружено</small>`);
  }

  // Новая партия (с нуля или из сохранения): реплей прошлой удаляется.
  startRun(unlocked = this.unlockedSet()) {
    store.deleteReplay();
    this.game.unlocked = new Set(unlocked);
    this.runXp = 0;
    this.result = null;
    this.currentReplay = null;
    this.closeDialog();
  }

  toMenu() {
    this.flushXp();
    this.persistReplay();
    this.game.reset();
    this.game.state = 'menu';
    this.game.unlocked = this.unlockedSet();
    this.currentReplay = null;
    this.closeDialog();
  }

  watchReplay(rep) {
    if (!store.replayRulesMatch(rep)) {
      this.openDialog('message', 'Этот реплей записан в старой версии игры. С тех пор правила изменились, и он воспроизвёлся бы неверно.');
      return;
    }
    this.flushXp();
    this.persistReplay();
    this.currentReplay = rep;
    this.game.startReplay(rep);
    this.game.speed = 1;
    this.closeDialog();
    this.banner('РЕПЛЕЙ<br><small>F — скорость до x8</small>');
  }

  // Реплей текущей партии лежит в браузере, пока не начнётся новая партия.
  persistReplay() {
    const g = this.game;
    if (g.replaying || g.state === 'menu' || (g.wave === 0 && !g.log.length)) return;
    store.writeReplay(g.replayData());
  }

  downloadReplay() {
    const rep = this.currentReplay ?? store.readReplay();
    if (!store.validReplay(rep)) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(rep)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `pixel-td-replay-wave-${rep.wave}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  openReplayFile(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      let rep = null;
      try {
        rep = JSON.parse(text);
      } catch {
        // не JSON
      }
      if (store.validReplay(rep)) this.watchReplay(rep);
      else this.openDialog('message', 'Этот файл не похож на реплей Pixel TD.');
    });
  }

  // Опыт игрока переносится в профиль после каждой волны и при поражении.
  flushXp() {
    const g = this.game;
    const xp = Math.floor(g.playerXp);
    if (g.replaying || xp <= 0) return 0;
    g.playerXp -= xp;
    this.runXp += xp;
    this.profile.xp += xp;
    this.profile.totalXp += xp;
    store.writeProfile(this.profile);
    return xp;
  }

  toggleAutoPick() {
    this.profile.autoPick = !this.profile.autoPick;
    store.writeProfile(this.profile);
    if (this.profile.autoPick) this.game.closePick();
    this.banner(`АВТОВЫБОР КАРТ<br><small>${this.profile.autoPick ? 'включён: берётся самая редкая карта' : 'выключен'}</small>`);
  }

  // Автовыбор: все накопившиеся выборы разбираются сразу. Выборы записываются в реплей как обычные.
  autoPick() {
    const g = this.game;
    if (!this.profile.autoPick || g.state !== 'playing' || g.replaying || !g.pendingCount) return;
    for (const t of g.towers) {
      // Защита от зависания: если выбор почему-то не прошёл (пустое предложение), не крутимся вечно.
      while (t.pending > 0 && t.offer?.length) {
        const before = t.pending;
        g.pickCard(bestCard(t.offer), t);
        if (t.pending === before) break;
      }
    }
  }

  unlock(type) {
    const def = TOWERS[type];
    if (!def?.unlock || this.profile.unlocked.includes(type) || this.profile.xp < def.unlock) return;
    this.profile.xp -= def.unlock;
    this.profile.unlocked.push(type);
    store.writeProfile(this.profile);
    if (!this.game.replaying && !this.game.run.daily) this.game.unlockTower(type);
    this.sfx.play('upgrade');
    this.renderDialog();
  }

  // Таланты действуют со следующей партии: текущая идёт с тем набором, с которым началась.
  buyTalent(id) {
    const level = this.profile.talents[id] ?? 0;
    const cost = talentCost(id, level);
    if (cost === null || level >= TALENTS[id].max || this.profile.xp < cost) return;
    this.profile.xp -= cost;
    this.profile.talents = { ...this.profile.talents, [id]: level + 1 };
    store.writeProfile(this.profile);
    this.sfx.play('upgrade');
    this.renderDialog();
  }

  async registerNick() {
    const nick = $('nick-input').value.trim();
    this.message('Регистрируем…');
    try {
      const res = await api.register(nick);
      this.profile.nick = res.nick;
      this.profile.token = res.token;
      store.writeProfile(this.profile);
      this.screenSig = '';
      this.renderDialog();
      this.message(`Готово! Вы — ${esc(res.nick)}`);
    } catch (err) {
      this.message(esc(err.message));
    }
  }

  async submitResult() {
    const { nick, token } = this.profile;
    const g = this.game;
    if (!nick) return;
    this.result = { pending: true };
    this.screenSig = '';
    try {
      this.result = await api.submitScore({ nick, token, wave: g.cleared, seed: g.map.seed, heat: g.heat, daily: g.run.daily });
    } catch (err) {
      this.result = { error: err.message };
    }
    this.screenSig = '';
  }

  // ---------- события игры ----------

  onEvent(name, data) {
    const g = this.game;
    if (name === 'wave') {
      const boss = makeWave(data.wave).some((gr) => ENEMIES[gr.type].boss);
      const sub = [
        boss && 'БОСС!',
        data.evolved.length && `Эволюция: ${data.evolved.join(', ')}`,
        data.affixes.length && data.affixes.map((a) => AFFIXES[a].name).join(' · '),
      ].filter(Boolean);
      this.banner(`ВОЛНА ${data.wave}${sub.map((s) => `<br><small>${s}</small>`).join('')}`);
    } else if (name === 'early') {
      g.floatText(160, 20, `+${data} досрочно`, '#ffcd75');
    } else if (name === 'clear') {
      const gold = data.bonus + data.ore;
      if (g.replaying) return this.banner('ВОЛНА ОТБИТА');
      store.writeBest(g.cleared);
      const xp = this.flushXp();
      this.persistReplay();
      this.banner(`ВОЛНА ОТБИТА<br><small>+${gold} золота${data.ore ? ` (руда +${data.ore})` : ''}${xp ? ` · +${fmtXp(xp)} опыта` : ''}</small>`);
    } else if (name === 'lost' && !g.replaying) {
      this.flushXp();
      this.persistReplay();
      this.submitResult();
    }
  }

  banner(html) {
    const el = $('banner');
    el.innerHTML = html;
    el.classList.remove('show');
    void el.offsetWidth; // перезапуск CSS-анимации
    el.classList.add('show');
  }

  setText(id, value) {
    const v = String(value);
    if (this.text[id] !== v) {
      this.text[id] = v;
      $(id).textContent = v;
    }
  }

  // ---------- синхронизация с игрой (каждый кадр) ----------

  sync() {
    const g = this.game;
    const live = g.state === 'playing' && !g.replaying;
    this.setText('lives', g.lives);
    this.setText('gold', g.gold);
    this.setText('wave', g.wave);
    this.setText('best', store.readBest());
    this.setText('pxp', fmtXp(this.profile.xp));
    this.setText('btn-speed', `x${g.speed}`);
    this.setText('btn-pause', g.paused ? '▶' : '❚❚');
    this.setText('btn-wave', g.earlyCall ? `▶ Волна +${g.earlyBonus()}` : '▶ Волна');
    this.setText('run-badge', g.run.daily ? `ВЫЗОВ ДНЯ · ЖАР ${g.heat}` : g.heat ? `ЖАР ${g.heat}` : '');
    $('run-badge').hidden = g.state === 'menu' || (!g.run.daily && !g.heat);
    $('btn-wave').disabled = !g.canStartWave;
    $('btn-wave').hidden = g.replaying;
    $('btn-menu').hidden = !live;
    $('btn-exit-replay').hidden = !g.replaying;
    $('replay-badge').hidden = !g.replaying;
    $('btn-mute').classList.toggle('off', this.sfx.muted);
    $('stage').classList.toggle('paused', g.paused && g.state === 'playing' && !g.picking);
    $('stage').classList.toggle('building', !!g.buildType || !!g.targeting);

    this.autoPick();
    this.setText('btn-auto', `Автовыбор: ${this.profile.autoPick ? 'вкл' : 'выкл'} (A)`);
    const pending = g.pendingCount;
    $('btn-cards').hidden = pending === 0 || !live;
    this.setText('btn-cards', `Карты: ${pending}`);

    for (const key of TOWER_KEYS) {
      const b = this.shopButtons[key];
      b.classList.toggle('active', g.buildType === key);
      b.classList.toggle('poor', g.gold < TOWERS[key].cost);
      b.classList.toggle('locked', !g.unlocked.has(key));
    }
    this.syncAbilities(live);

    const sel = g.selected;
    const left = g.spawnQueue.length + g.enemies.length;
    const sig = [
      sel?.id, sel?.level, sel?.xpLevel, sel?.pending, sel?.cards.length, sel?.mode, sel && g.stats(sel).aura,
      g.selectedRuin && `${g.selectedRuin.tx},${g.selectedRuin.ty}`,
      g.buildType, g.gold, g.wave, g.waveActive, g.waveActive && left, g.replaying,
    ].join('|');
    if (sig !== this.infoSig) {
      this.infoSig = sig;
      $('info').innerHTML = this.infoHtml();
      delete this.text['xp-text'];
    }
    // Полоска опыта меняется постоянно — обновляем её отдельно, без перерисовки панели.
    if (sel) {
      const need = xpToNext(sel.xpLevel);
      const fill = $('xp-fill');
      if (fill) fill.style.width = `${Math.min(100, (sel.xp / need) * 100)}%`;
      if ($('xp-text')) this.setText('xp-text', `${Math.floor(sel.xp)}/${need}`);
    }

    this.syncCards();
    this.syncScreen();
  }

  syncAbilities(live) {
    const g = this.game;
    const off = g.mut.has('noability');
    $('abilities-box').hidden = !live || off;
    if (!live || off) return;
    for (const key of ABILITY_KEYS) {
      const b = this.abilityButtons[key];
      const left = g.abilityLeft(key);
      b.disabled = !g.canCast(key);
      b.classList.toggle('active', g.targeting === key);
      const cost = b.querySelector('.ab-cost');
      const cd = b.querySelector('.ab-cd');
      const costText = `${g.abilityCost(key)} з.`;
      if (cost.textContent !== costText) cost.textContent = costText;
      const cdText = left > 0 ? `${Math.ceil(left)}с` : '';
      if (cd.textContent !== cdText) cd.textContent = cdText;
    }
  }

  syncCards() {
    const g = this.game;
    const t = g.picking;
    const cost = t ? g.rerollCost(t) : 0;
    const sig = t ? [t.id, t.pending, t.offer.map((c) => c.id + c.rarity).join(), cost, g.gold >= cost].join('|') : '';
    if (sig === this.cardsSig) return;
    this.cardsSig = sig;
    $('cards').hidden = !t;
    if (!t) return;
    const more = t.pending > 1 ? ` <span class="muted">(ещё ${t.pending - 1})</span>` : '';
    $('cards-title').innerHTML = `${TOWERS[t.type].name} — уровень ${t.xpLevel}${more}`;
    $('card-row').innerHTML = t.offer.map((c, i) => {
      const def = CARD_BY_ID[c.id];
      const r = RARITIES[c.rarity];
      return `<button class="card ${c.rarity}" style="--rc:${r.color}" data-pick="${i}">
          <span class="card-rarity">${r.name}</span>
          <span class="card-name">${def.name}</span>
          <span class="card-text">${def.text(c.value)}</span>
          <span class="card-key">${i + 1}</span>
        </button>`;
    }).join('');
    const reroll = $('btn-reroll');
    reroll.hidden = !g.canReroll;
    reroll.textContent = `Обновить карты — ${cost} з. (R)`;
    reroll.disabled = g.gold < cost;
  }

  // Экран поверх поля: главное меню, поражение, конец реплея.
  syncScreen() {
    const g = this.game;
    const sig = [g.state, g.replaying, this.profile.nick, JSON.stringify(this.result)].join('|');
    if (sig === this.screenSig) return;
    this.screenSig = sig;
    $('screen').hidden = g.state === 'playing';
    if (g.state === 'playing') return;
    const [title, text, actions] = g.state === 'menu' ? this.menuScreen()
      : g.replaying ? this.replayEndScreen() : this.lostScreen();
    $('screen-title').textContent = title;
    $('screen-text').innerHTML = text;
    $('screen-actions').innerHTML = actions.join('');
  }

  profileLine() {
    const p = this.profile;
    return p.nick
      ? `<p>Игрок: <span class="gold">${esc(p.nick)}</span></p>`
      : `<p class="muted">Без ника результаты не попадут в таблицу лидеров. ${btn('nick', 'Выбрать ник', 'small')}</p>`;
  }

  menuScreen() {
    const last = store.latestSlot();
    const rep = store.readReplay();
    const daily = dailyRun(todayUtc());
    return ['PIXEL TD', `${this.profileLine()}
      <p class="muted">Опыт игрока: ${fmtXp(this.profile.xp)} · Рекорд: ${store.readBest()} волн</p>
      <p class="muted">Вызов дня: ${daily.run.mutators.map((m) => MUTATORS[m].name).join(', ')}</p>`, [
      btn('new', 'Новая игра', 'primary'),
      btn('daily', 'Вызов дня', 'primary'),
      last ? btn('continue', `Продолжить (слот ${last.i + 1}, волна ${last.data.wave})`, 'primary') : '',
      btn('saves', 'Сохранения'),
      btn('arsenal', 'Арсенал'),
      btn('leaders', 'Лидеры'),
      store.validReplay(rep) ? btn('watch', `Последний реплей (волна ${rep.wave})`) : '',
      btn('open-replay', 'Реплей из файла'),
      btn('help', 'Справка'),
    ]];
  }

  lostScreen() {
    const g = this.game;
    const r = this.result;
    const board = !this.profile.nick ? ''
      : r?.pending ? '<p class="muted">Отправляем результат в таблицу лидеров…</p>'
      : r?.error ? `<p class="bad">Таблица лидеров: ${esc(r.error)}</p>`
      : r ? `<p>${g.run.daily ? 'Вызов дня' : 'Таблица лидеров'}: <span class="gold">место #${r.rank}</span> (ваш лучший — ${r.best} волн)</p>` : '';
    const heat = g.heat ? ` · жар ${g.heat}` : '';
    return [g.run.daily ? 'ВЫЗОВ ДНЯ ОКОНЧЕН' : 'ПОРАЖЕНИЕ', `<p>Замок пал на волне ${g.wave}. Отбито волн: ${g.cleared}${heat}. Рекорд: ${store.readBest()}.</p>
      <p class="xp-line">+${fmtXp(this.runXp)} опыта игрока за партию (всего ${fmtXp(this.profile.xp)})</p>
      ${this.statsSummary()}
      ${board}${this.profile.nick ? '' : this.profileLine()}`, [
      btn('stats', 'Статистика', 'primary'),
      btn('watch', 'Смотреть реплей', 'primary'),
      btn('download', 'Скачать реплей'),
      btn('saves', 'Загрузить сохранение'),
      btn('new', 'Новая игра'),
      btn('menu', 'В меню'),
    ]];
  }

  replayEndScreen() {
    const g = this.game;
    return ['РЕПЛЕЙ ОКОНЧЕН', `<p>${g.state === 'lost' ? `Замок пал на волне ${g.wave}.` : `Запись обрывается на волне ${g.wave}.`}</p>`, [
      btn('stats', 'Статистика', 'primary'),
      btn('rewatch', 'Смотреть снова', 'primary'),
      btn('download', 'Скачать реплей'),
      btn('menu', 'В меню'),
    ]];
  }

  // ---------- статистика партии ----------

  // Лучшая башня и лучший тип башен — коротко, прямо на экране поражения.
  statsSummary() {
    const tl = this.game.tally;
    const mvp = [...tl.towers].sort((a, b) => b.dmg - a.dmg)[0];
    const topType = Object.entries(tl.byType).sort((a, b) => (b[1].dmg ?? 0) - (a[1].dmg ?? 0))[0];
    if (!mvp || !tl.totalDmg) return '';
    return `<p class="muted">Урон: ${fmtNum(tl.totalDmg)} · убито врагов: ${fmtNum(tl.kills)} · время: ${fmtTime(this.game.time)}</p>
      <p>Лучшая башня: <span class="gold">${TOWERS[mvp.type].name} #${mvp.id}</span> — ${share(mvp.dmg, tl.totalDmg)}% урона, ${mvp.kills} убийств.
      Самый полезный тип: <span class="gold">${TOWERS[topType[0]].name}</span> (${share(topType[1].dmg ?? 0, tl.totalDmg)}%).</p>`;
  }

  statsHtml() {
    const g = this.game;
    const tl = g.tally;
    const alive = new Map(g.towers.map((t) => [t.id, t]));
    const total = tl.totalDmg;
    const earned = Object.values(tl.gold).reduce((a, b) => a + b, 0);
    const spent = Object.values(tl.spent).reduce((a, b) => a + b, 0);
    const cards = Object.values(tl.cards).reduce((a, b) => a + b, 0);
    const fromSave = g.start.save ? '<p class="muted">Партия загружена из сохранения — статистика считается с момента загрузки.</p>' : '';

    const kv = (rows) => `<table class="stats-kv">${rows.filter(Boolean).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
    const summary = kv([
      ['Отбито волн', g.cleared],
      ['Время партии', fmtTime(g.time)],
      ['Нанесено урона', fmtNum(total)],
      ['Убито врагов', fmtNum(tl.kills)],
      ['Построено башен', tl.towers.length],
      ['Взято карт', `${cards} <span class="muted">(${['common', 'rare', 'epic', 'legendary'].map((r) =>
        `<span style="color:${RARITIES[r].color}">${tl.cards[r]}</span>`).join(' / ')})</span>`],
      tl.best && ['Сильнейший удар', `${fmtNum(tl.best.dmg)} — ${sourceName(tl.best.by)} по «${tl.best.enemy}», волна ${tl.best.wave}`],
    ]);

    // Урон по типам башен и способностям.
    const sources = [
      ...Object.entries(tl.byType).map(([k, v]) => ({ name: TOWERS[k].name, img: icon(SPRITES.towers[k]), count: `×${v.built ?? 0}`, ...v })),
      ...Object.entries(tl.abilities).map(([k, v]) => ({ name: ABILITIES[k].name, img: null, count: `${v.casts ?? 0} раз`, ...v })),
    ].sort((a, b) => (b.dmg ?? 0) - (a.dmg ?? 0));
    const maxSrc = Math.max(0, ...sources.map((r) => r.dmg ?? 0));
    const bySource = `<table class="stats-table"><tr><th></th><th>Источник</th><th>Урон</th><th></th><th>Убийств</th></tr>${sources.map((r) =>
      `<tr><td>${r.img ? `<img src="${r.img}" alt="">` : ''}</td><td>${r.name} <span class="muted">${r.count}</span></td>
        <td>${fmtNum(r.dmg ?? 0)} <span class="muted">${share(r.dmg ?? 0, total)}%</span></td><td class="bar-cell">${bar(r.dmg ?? 0, maxSrc)}</td>
        <td>${fmtNum(r.kills ?? 0)}</td></tr>`).join('')}</table>`;

    // Топ башен по урону.
    const top = [...tl.towers].sort((a, b) => b.dmg - a.dmg).slice(0, 10);
    const maxTower = top[0]?.dmg ?? 0;
    const byTower = `<table class="stats-table"><tr><th></th><th>Башня</th><th>Ранг / ур.</th><th>Урон</th><th></th><th>Убийств</th></tr>${top.map((r) => {
      const t = alive.get(r.id);
      const level = t ? t.level : r.level ?? 0, xpLevel = t ? t.xpLevel : r.xpLevel ?? 1;
      const terrain = g.map.feature(r.tx, r.ty);
      const tag = [r.sold && 'продана', terrain === 'hill' && 'холм', terrain === 'ore' && 'руда'].filter(Boolean).join(', ');
      return `<tr><td><img src="${icon(SPRITES.towers[r.type])}" alt=""></td>
        <td>${TOWERS[r.type].name} #${r.id}${tag ? ` <span class="muted">(${tag})</span>` : ''}</td>
        <td>${level + 1} / ${xpLevel}</td><td>${fmtNum(r.dmg)}</td><td class="bar-cell">${bar(r.dmg, maxTower, 'var(--gold)')}</td><td>${r.kills}</td></tr>`;
    }).join('')}</table>`;

    // Враги: сколько пришло, убито и прорвалось.
    const enemies = Object.entries(tl.enemies).sort((a, b) => (b[1].spawned ?? 0) - (a[1].spawned ?? 0));
    const byEnemy = `<table class="stats-table"><tr><th></th><th>Враг</th><th>Пришло</th><th>Убито</th><th>Прорвалось</th><th>Снято жизней</th></tr>${enemies.map(([k, v]) =>
      `<tr><td><img src="${icon(SPRITES.enemies[k][0][0])}" alt=""></td><td>${ENEMIES[k].name}</td><td>${fmtNum(v.spawned ?? 0)}</td>
        <td>${fmtNum(v.killed ?? 0)}</td><td class="${v.leaked ? 'bad' : ''}">${v.leaked ?? 0}</td><td class="${v.lives ? 'bad' : ''}">${v.lives ?? 0}</td></tr>`).join('')}</table>`;

    const gold = kv([
      ['Заработано', `<span class="gold">${fmtNum(earned)}</span>`],
      ['— за убийства', fmtNum(tl.gold.kills)],
      ['— бонусы волн', fmtNum(tl.gold.waves)],
      tl.gold.early && ['— досрочные волны', fmtNum(tl.gold.early)],
      tl.gold.ore && ['— рудные жилы', fmtNum(tl.gold.ore)],
      tl.gold.sells && ['— продажа башен', fmtNum(tl.gold.sells)],
      ['Потрачено', `<span class="gold">${fmtNum(spent)}</span>`],
      ['— постройка', fmtNum(tl.spent.build)],
      ['— ранги', fmtNum(tl.spent.rank)],
      tl.spent.abilities && ['— способности', fmtNum(tl.spent.abilities)],
      tl.spent.rerolls && ['— рероллы', fmtNum(tl.spent.rerolls)],
      tl.spent.ruins && ['— расчистка руин', fmtNum(tl.spent.ruins)],
    ]);
    const r = tl.reactions;
    const reactions = kv([
      ['Криты', fmtNum(r.crit)],
      r.deadeye && ['Смертельные выстрелы (x5)', fmtNum(r.deadeye)],
      r.execute && ['Казни', fmtNum(r.execute)],
      r.shock && ['Термошок', fmtNum(r.shock)],
      r.overload && ['Перегрузка', fmtNum(r.overload)],
      r.wetFreeze && ['Мгновенная заморозка', fmtNum(r.wetFreeze)],
      ['Уклонения врагов', fmtNum(r.dodge)],
    ]);

    return `<h2>Статистика партии</h2>${fromSave}
      <div class="stats-cols"><div>${summary}</div><div><h3>Золото</h3>${gold}</div></div>
      <h3>Урон по источникам</h3>${bySource}
      <h3>Лучшие башни</h3>${byTower}
      <h3>Враги</h3>${byEnemy}
      <h3>Реакции и особые эффекты</h3>${reactions}`;
  }

  // ---------- диалоги ----------

  openDialog(name, data) {
    this.dialog = name;
    this.dialogData = data;
    $('dialog').hidden = false;
    this.renderDialog();
  }

  closeDialog() {
    this.dialog = null;
    $('dialog').hidden = true;
  }

  message(html) {
    const el = $('dialog-msg');
    if (el) el.innerHTML = html;
  }

  renderDialog() {
    if (!this.dialog) return;
    const render = {
      pause: () => this.pauseHtml(),
      newgame: () => this.newGameHtml(),
      saves: () => this.savesHtml(),
      arsenal: () => this.arsenalHtml(),
      leaders: () => this.leadersHtml(),
      nick: () => this.nickHtml(),
      stats: () => this.statsHtml(),
      help: () => this.helpHtml(),
      message: () => `<p>${this.dialogData}</p>`,
    }[this.dialog];
    $('dialog-body').innerHTML = render();
    if (this.dialog === 'leaders') this.loadLeaders();
  }

  pauseHtml() {
    return `<h2>Пауза</h2><div class="menu-col">
      ${btn('resume', 'Продолжить', 'primary')}
      ${btn('stats', 'Статистика партии')}
      ${btn('saves', 'Сохранения')}
      ${btn('arsenal', 'Арсенал')}
      ${btn('leaders', 'Лидеры')}
      ${btn('help', 'Справка')}
      ${btn('autopick', `Автовыбор карт: ${this.profile.autoPick ? 'вкл' : 'выкл'}`)}
      ${btn('new', 'Новая игра')}
      ${btn('menu', 'Выйти в главное меню')}
    </div>`;
  }

  newGameHtml() {
    const run = { mutators: [...this.newRunMutators] };
    const heat = runHeat(run);
    const rows = MUTATOR_KEYS.map((m) => {
      const def = MUTATORS[m];
      const on = this.newRunMutators.has(m);
      return `<button class="mutator ${on ? 'on' : ''}" data-action="mutator" data-mutator="${m}">
        <span class="mut-check">${on ? '■' : '□'}</span><span><b>${def.name}</b> <span class="gold">+${def.heat}</span><br>
        <span class="desc">${def.desc}</span></span></button>`;
    }).join('');
    const tal = Object.entries(this.profile.talents).filter(([, l]) => l > 0)
      .map(([id, l]) => `${TALENTS[id].name} ${l}`).join(', ');
    return `<h2>Новая игра</h2>
      <p class="muted">Карта генерируется заново. Усложнения дают «жар»: больше опыта игрока и отметку в таблице лидеров.</p>
      <div class="mutators">${rows}</div>
      <p>Жар: <span class="gold">${heat}</span> · опыт игрока x${num(heatXpMul(heat), 2)}</p>
      <p class="muted">Таланты: ${tal || 'нет (покупаются в Арсенале)'}</p>
      <div class="row">${btn('start-new', 'Начать', 'primary')}</div>`;
  }

  savesHtml() {
    const g = this.game;
    const canSave = g.canSave;
    const slots = store.listSlots().map((d, i) => {
      const tags = [d?.run?.daily && 'вызов дня', d?.run?.mutators?.length && `жар ${runHeat(d.run)}`].filter(Boolean).join(', ');
      const info = d ? `Волна ${d.wave} · башен ${d.towers.length}${tags ? ` · ${tags}` : ''} · ${d.date ? fmtDate(d.date) : ''}` : 'пусто';
      return `<div class="slot"><div><b>Слот ${i + 1}</b><br><span class="muted">${info}</span></div>
        <div class="slot-actions">
          ${canSave ? btn('slot-save', 'Сохранить', 'primary small', `data-slot="${i}"`) : ''}
          ${d ? btn('slot-load', 'Загрузить', 'small', `data-slot="${i}"`) : ''}
          ${d ? btn('slot-del', '×', 'danger small', `data-slot="${i}" title="Удалить"`) : ''}
        </div></div>`;
    }).join('');
    const hint = g.state === 'playing' && !canSave && !g.replaying
      ? '<p class="muted">Сохраниться можно между волнами, начиная с первой отбитой.</p>' : '';
    return `<h2>Сохранения</h2>${slots}${hint}
      <h3>Перенос строкой</h3>
      <p class="muted">Строкой можно перенести игру на другое устройство или отправить другу.</p>
      <textarea id="save-string" rows="3" placeholder="Вставьте сюда строку сохранения"></textarea>
      <div class="row">${btn('export', 'Скопировать текущую игру', '', canSave ? '' : 'disabled')}${btn('import', 'Загрузить из строки')}</div>
      <p id="dialog-msg" class="gold"></p>`;
  }

  arsenalHtml() {
    const p = this.profile;
    const rows = TOWER_KEYS.map((k) => {
      const def = TOWERS[k];
      const open = !def.unlock || p.unlocked.includes(k);
      const status = open ? '<span class="ok">Открыта</span>'
        : btn('unlock', `Открыть — ${fmtXp(def.unlock)} оп.`, 'primary small', `data-type="${k}" ${p.xp < def.unlock ? 'disabled' : ''}`);
      return `<div class="arsenal-row ${open ? '' : 'locked'}"><img src="${icon(SPRITES.towers[k])}" alt="">
        <div><b>${def.name}</b> <span class="muted">${def.cost} з. · ${def.dmgType === 'magic' ? 'магия' : 'физ. урон'}</span><br>
        <span class="desc">${def.desc}</span></div><div>${status}</div></div>`;
    }).join('');
    const talents = Object.entries(TALENTS).map(([id, def]) => {
      const level = p.talents[id] ?? 0;
      const cost = talentCost(id, level);
      const maxed = level >= def.max || cost === null;
      const status = maxed ? '<span class="ok">Максимум</span>'
        : btn('talent', `Ур. ${level + 1} — ${fmtXp(cost)} оп.`, 'primary small', `data-talent="${id}" ${p.xp < cost ? 'disabled' : ''}`);
      return `<div class="arsenal-row talent"><div class="talent-lvl">${level}/${def.max}</div>
        <div><b>${def.name}</b><br><span class="desc">${level ? `сейчас: ${def.text(level)}` : def.text(1)}</span></div><div>${status}</div></div>`;
    }).join('');
    return `<h2>Арсенал</h2>
      <p>Опыт игрока: <span class="gold">${fmtXp(p.xp)}</span> <span class="muted">(всего заработано ${fmtXp(p.totalXp)})</span></p>
      <p class="muted">Опыт игрока копится во всех партиях за урон башен и тратится на башни и таланты.</p>
      <h3>Башни</h3>${rows}
      <h3>Таланты</h3>
      <p class="muted">Таланты действуют со следующей партии. В вызове дня они отключены.</p>
      ${talents}`;
  }

  nickHtml() {
    const p = this.profile;
    return `<h2>Ник</h2>
      ${p.nick ? `<p>Сейчас вы играете как <span class="gold">${esc(p.nick)}</span>. Новый ник — это новая запись в таблице.</p>` : ''}
      <p class="muted">3–16 символов: буквы, цифры, _ и -. Ключ к нику хранится в этом браузере.</p>
      <div class="row"><input id="nick-input" maxlength="16" placeholder="Ваш ник" value="">${btn('register', 'Зарегистрироваться', 'primary')}</div>
      <p id="dialog-msg" class="gold"></p>`;
  }

  leadersHtml() {
    const tab = (id, label) => btn('leaders-tab', label, this.leadersTab === id ? 'primary small' : 'small', `data-tab="${id}"`);
    return `<h2>Таблица лидеров</h2>
      <div class="row">${tab('normal', 'Общая')}${tab('daily', `Вызов дня ${todayUtc()}`)}</div>
      <p>${this.profile.nick ? `Вы: <span class="gold">${esc(this.profile.nick)}</span>` : `Без ника вас не будет в таблице. ${btn('nick', 'Выбрать ник', 'small')}`}</p>
      <div id="leaders-list"><p class="muted">Загрузка…</p></div>`;
  }

  async loadLeaders() {
    let html;
    const tab = this.leadersTab;
    try {
      const { top } = await api.leaderboard(tab === 'daily' ? todayUtc() : null);
      const me = this.profile.nick?.toLowerCase();
      html = top.length ? `<table class="leaders"><tr><th>#</th><th>Игрок</th><th>Волн</th><th>Жар</th><th>Когда</th></tr>${top.map((r, i) =>
        `<tr class="${r.nick.toLowerCase() === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.nick)}</td><td>${r.wave}</td><td>${r.heat || ''}</td><td>${fmtDate(r.date * 1000)}</td></tr>`).join('')}</table>`
        : '<p class="muted">Пока никого. Станьте первым!</p>';
    } catch (err) {
      html = `<p class="bad">${esc(err.message)}. Таблица работает, только когда игра запущена через serve.py.</p>`;
    }
    if (this.dialog === 'leaders' && this.leadersTab === tab) $('leaders-list').innerHTML = html;
  }

  helpHtml() {
    const sections = HELP.map(([title, rows]) => `<div><h3>${title}</h3><table class="keys">${rows.map(([k, v]) =>
      `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table></div>`).join('');
    return `<h2>Справка</h2><div class="help-cols">${sections}</div>
      <h3>Коротко о правилах</h3>
      <ul class="rules">
        <li>Волны бесконечны: продержитесь как можно дольше. Каждая 5-я волна — босс; у боссов есть фазы.</li>
        <li>Физический урон режется бронёй, магический (лёд, маг, жаровня) — нет. Призраки получают вдвое меньше физического урона.</li>
        <li>С ростом номера волны враги эволюционируют, а с 10-й волны у волн появляются модификаторы.</li>
        <li>Реакции: огонь по замедленным — двойной урон; молния по горящим — взрыв; водомёт делает врагов мокрыми — молния бьёт сильнее, лёд замораживает сразу.</li>
        <li>Холм даёт башне +20% радиуса, башня на рудной жиле приносит золото после волны, руины можно расчистить.</li>
        <li>Башни копят опыт и на новых уровнях дают выбрать карточку улучшения.</li>
        <li>Опыт игрока копится между партиями и тратится на башни и таланты в Арсенале.</li>
        <li>Сохраняться можно между волнами. Реплей последней партии хранится, пока не начнётся новая.</li>
      </ul>`;
  }

  // ---------- панель выбранной башни ----------

  infoHtml() {
    const g = this.game;
    const t = g.selected;
    const live = !g.replaying;
    if (t) {
      const def = TOWERS[t.type];
      const cost = g.upgradeCost(t);
      const cur = g.stats(t);
      const next = g.stats(t, t.level + 1);
      const upBtn = `<button class="btn primary" data-action="upgrade" ${g.gold < cost ? 'disabled' : ''}>Ранг+ ${cost}</button>`;
      const cardsBtn = t.pending && live
        ? `<button class="btn card-btn" data-action="cards">Выбрать улучшение (${t.pending}) — E</button>`
        : '';
      const terrain = g.map.feature(t.tx, t.ty);
      return `<div class="info-head"><img src="${icon(SPRITES.towers[t.type])}" alt="">
          <div><b>${def.name}</b><br><span class="muted">Ранг ${t.level + 1}</span></div></div>
        <div class="xp"><span>Ур. ${t.xpLevel}</span><div class="xp-bar"><div id="xp-fill"></div></div><span id="xp-text"></span></div>
        ${cardsBtn}
        ${live ? `<button class="btn small mode-btn" data-action="mode">Цель: ${TARGET_MODES[t.mode]} (T)</button>` : `<p class="muted">Цель: ${TARGET_MODES[t.mode]}</p>`}
        ${statsTable(cur, live ? next : null)}
        ${terrain === 'hill' ? '<p class="ok">Холм: +20% радиуса</p>' : ''}
        ${terrain === 'ore' ? `<p class="gold">Рудная жила: +${5 + g.wave + 1} золота после волны</p>` : ''}
        ${cur.aura ? '<p class="gold">Аура командира: +15% урона, +10% скорости</p>' : ''}
        ${cardChips(t)}
        ${live ? `<div class="actions">${upBtn}<button class="btn danger" data-action="sell">Продать +${g.sellValue(t)}</button></div>` : ''}`;
    }
    if (g.selectedRuin) {
      const cost = g.ruinCost();
      return `<div class="info-head"><img src="${icon(SPRITES.ruin)}" alt=""><div><b>Руины</b></div></div>
        <p class="muted">Занимают клетку у дороги. Расчистите, чтобы построить здесь башню.</p>
        ${live ? `<div class="actions"><button class="btn primary" data-action="clear-ruin" ${g.gold < cost ? 'disabled' : ''}>Расчистить — ${cost} з.</button></div>` : ''}`;
    }
    if (g.buildType) {
      const def = TOWERS[g.buildType];
      return `<div class="info-head"><img src="${icon(SPRITES.towers[g.buildType])}" alt="">
          <div><b>${def.name}</b><br><span class="gold">${def.cost} з.</span></div></div>
        <p class="muted">${def.desc}</p>${statsTable(def.levels[0])}
        <p class="muted">Кликните по траве, чтобы построить. Shift — строить несколько. Холм даёт +20% радиуса.</p>`;
    }
    if (g.waveActive) {
      const early = g.earlyCall && live ? `<p class="gold">Волна вся на поле — Пробел вызовет следующую досрочно (+${g.earlyBonus()} з.)</p>` : '';
      return `<h3>Волна ${g.wave}</h3><p>Осталось врагов: ${g.spawnQueue.length + g.enemies.length}</p>
        ${g.affixes.length ? `<p>${affixList(g.affixes)}</p>` : ''}${early}`;
    }
    const n = g.wave + 1;
    const items = makeWave(n).map((gr) => {
      const form = formIndex(gr.type, n);
      const e = enemyForm(gr.type, form);
      const tag = e.boss ? ' <span class="bad">(босс)</span>' : e.flying ? ' <span class="muted">(летает)</span>' : '';
      return `<li><img src="${icon(SPRITES.enemies[gr.type][form][0])}" alt="">${e.name} ×${gr.count}${tag}</li>`;
    });
    const affixes = waveAffixes(g.map.seed, n, g.mut.has('evil'));
    return `<h3>Следующая волна ${n}</h3><ul class="enemy-list">${items.join('')}</ul>
      ${affixes.length ? `<p>Модификаторы: ${affixList(affixes)}</p>` : ''}
      ${live ? '<p class="muted">Пробел — начать волну.</p>' : ''}`;
  }
}

