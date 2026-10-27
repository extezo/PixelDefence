import { TILE, COLS, ROWS, TOWERS, ABILITIES } from './config.js';
import { CELL, mulberry32 } from './map.js';
import { SPRITES, variant } from './sprites.js';

export const VIEW_W = COLS * TILE;
export const VIEW_H = ROWS * TILE;

const C = {
  grass: '#4b9a3f', grassDark: '#3c7f34', grassLight: '#68b84a',
  path: '#c8a064', pathDark: '#a98349', pathLight: '#dcb97e', pathEdge: '#7d5c33',
  ok: '#a7f070', bad: '#ef7d57', white: '#f4f4f4', outline: '#1a1c2c',
};

// Цвета рангов: 1–3 жёлтые, 4–6 оранжевые, 7–9 красные, дальше фиолетовые, голубые, белые.
const RANK_COLORS = ['#ffcd75', '#ef7d57', '#b13e53', '#c165e0', '#73eff7', '#f4f4f4'];

export class Renderer {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.map = null;
    this.bg = null;
  }

  draw(game, view) {
    const ctx = this.ctx;
    if (this.map !== game.map) {
      this.map = game.map;
      this.bg = drawBackground(game.map);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (game.shake > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
    }
    ctx.drawImage(this.bg, 0, 0);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (game.map.cell(x, y) === CELL.RUIN) ctx.drawImage(SPRITES.ruin, x * TILE, y * TILE);
    }
    if (game.selectedRuin) corners(ctx, game.selectedRuin.tx * TILE, game.selectedRuin.ty * TILE, C.white);
    if (game.buildType) drawGrid(ctx, game);

    const sel = game.selected;
    if (sel) drawRange(ctx, sel.x, sel.y, game.stats(sel).range * TILE, C.white);

    // Башни и враги сортируются по нижнему краю, чтобы корректно перекрываться.
    const items = [];
    for (const t of game.towers) items.push([t.ty * TILE + TILE, 0, t]);
    for (const e of game.enemies) items.push([e.y + 5 + (e.def.flying ? 12 : 0), 1, e]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, kind, obj] of items) {
      if (kind === 0) drawTower(ctx, obj, game.time);
      else drawEnemy(ctx, obj, game.time);
    }

    for (const p of game.projectiles) drawProjectile(ctx, p);
    for (const z of game.zaps) drawZap(ctx, z);
    for (const fx of game.effects) drawMeteor(ctx, fx, game.time);

    for (const p of game.particles) {
      ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    if (view.hover && game.state === 'playing') {
      if (game.targeting === 'meteor') {
        const { tx, ty } = view.hover;
        drawRange(ctx, tx * TILE + TILE / 2, ty * TILE + TILE / 2, ABILITIES.meteor.radius * TILE, C.bad);
      } else {
        drawHover(ctx, game, view.hover);
      }
    }

    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of game.texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 2);
      const x = Math.round(t.x), y = Math.round(t.y);
      ctx.fillStyle = C.outline;
      ctx.fillText(t.text, x + 1, y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawBackground(map) {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d');
  const rng = mulberry32(map.seed * 31 + 1);
  const ri = (n) => Math.floor(rng() * n);
  const isRoad = (x, y) => {
    const cell = map.cell(x, y);
    return cell === -1 || cell === CELL.PATH || cell === CELL.CASTLE;
  };

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE, py = y * TILE;
      if (isRoad(x, y)) {
        g.fillStyle = C.path;
        g.fillRect(px, py, TILE, TILE);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = rng() < 0.6 ? C.pathDark : C.pathLight;
          g.fillRect(px + ri(TILE), py + ri(TILE), 1, 1);
        }
        if (rng() < 0.4) {
          g.fillStyle = C.pathDark;
          g.fillRect(px + 2 + ri(11), py + 2 + ri(11), 2, 1);
        }
        g.fillStyle = C.pathEdge;
        if (!isRoad(x, y - 1)) g.fillRect(px, py, TILE, 1);
        if (!isRoad(x, y + 1)) g.fillRect(px, py + TILE - 1, TILE, 1);
        if (!isRoad(x - 1, y)) g.fillRect(px, py, 1, TILE);
        if (!isRoad(x + 1, y)) g.fillRect(px + TILE - 1, py, 1, TILE);
      } else {
        g.fillStyle = C.grass;
        g.fillRect(px, py, TILE, TILE);
        for (let i = 0; i < 5; i++) {
          // травинки
          const gx = px + ri(TILE - 1), gy = py + ri(TILE - 2);
          g.fillStyle = C.grassDark;
          g.fillRect(gx, gy, 1, 2);
          g.fillStyle = C.grassLight;
          g.fillRect(gx, gy, 1, 1);
        }
        if (rng() < 0.12) {
          g.fillStyle = rng() < 0.5 ? '#ffcd75' : '#f4f4f4';
          g.fillRect(px + 2 + ri(12), py + 2 + ri(12), 1, 1);
        }
      }
    }
  }

  // Холм — светлый бугор с тенью; рудная жила — золотые и серые вкрапления.
  for (const [key, kind] of map.features) {
    const [x, y] = key.split(',').map(Number);
    const px = x * TILE, py = y * TILE;
    if (kind === 'hill') {
      g.fillStyle = '#5fae4c';
      g.fillRect(px + 2, py + 5, 12, 9);
      g.fillRect(px + 4, py + 3, 8, 2);
      g.fillStyle = '#7cc95a';
      g.fillRect(px + 4, py + 4, 6, 3);
      g.fillStyle = '#2f6b2a';
      g.fillRect(px + 2, py + 14, 12, 1);
      g.fillRect(px + 13, py + 6, 1, 8);
    } else {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i % 3 === 0 ? '#ffcd75' : i % 3 === 1 ? '#94b0c2' : '#566c86';
        g.fillRect(px + 2 + ri(11), py + 2 + ri(11), 2, 2);
      }
    }
  }

  for (const d of map.decor) {
    const px = d.x * TILE, py = d.y * TILE;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px + 3, py + 13, 10, 2);
    g.drawImage(SPRITES[d.kind], px, py);
  }
  g.drawImage(SPRITES.castle, map.castle.x * TILE, map.castle.y * TILE);
  return c;
}

function drawGrid(ctx, game) {
  ctx.fillStyle = 'rgba(26,28,44,0.18)';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!game.canBuild(x, y)) continue;
      ctx.fillRect(x * TILE, y * TILE, TILE, 1);
      ctx.fillRect(x * TILE, y * TILE, 1, TILE);
    }
  }
}

function drawRange(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function corners(ctx, x, y, color) {
  const L = 4;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, L, 1);
  ctx.fillRect(x + TILE - L, y, L, 1);
  ctx.fillRect(x, y + TILE - 1, L, 1);
  ctx.fillRect(x + TILE - L, y + TILE - 1, L, 1);
  ctx.fillRect(x, y, 1, L);
  ctx.fillRect(x + TILE - 1, y, 1, L);
  ctx.fillRect(x, y + TILE - L, 1, L);
  ctx.fillRect(x + TILE - 1, y + TILE - L, 1, L);
}

function drawHover(ctx, game, { tx, ty }) {
  if (game.map.cell(tx, ty) === -1) return;
  const x = tx * TILE, y = ty * TILE;
  if (game.buildType) {
    const def = TOWERS[game.buildType];
    const ok = game.canBuild(tx, ty) && game.gold >= def.cost;
    const hill = game.map.feature(tx, ty) === 'hill' ? 1.2 : 1;
    drawRange(ctx, x + TILE / 2, y + TILE / 2, def.levels[0].range * hill * TILE, ok ? C.white : C.bad);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(SPRITES.towers[game.buildType], x, y);
    ctx.globalAlpha = 1;
    corners(ctx, x, y, ok ? C.ok : C.bad);
  } else if (game.towerAt(tx, ty) || game.map.cell(tx, ty) === CELL.RUIN) {
    corners(ctx, x, y, C.white);
  }
}

function drawTower(ctx, t, time) {
  const x = t.tx * TILE, y = t.ty * TILE;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 2, y + 15, 12, 1);
  const off = t.disabledUntil > time;
  ctx.drawImage(variant(SPRITES.towers[t.type], false, off ? 'off' : null), x, y + (t.recoil > 0.05 ? 1 : 0));
  if (off && Math.floor(time * 4) % 2) {
    ctx.fillStyle = '#ef7d57';
    ctx.fillRect(x + 6, y + 2, 1, 3);
    ctx.fillRect(x + 9, y + 2, 1, 3);
  }
  // Ранг — «звёздочки» в правом верхнем углу: 1–3 штуки, цвет меняется каждые три ранга.
  const pips = (t.level % 3) + 1;
  const color = RANK_COLORS[Math.min(RANK_COLORS.length - 1, Math.floor(t.level / 3))];
  for (let i = 0; i < pips; i++) {
    const px = x + 13 - i * 3;
    ctx.fillStyle = C.outline;
    ctx.fillRect(px - 1, y - 1, 4, 4);
    ctx.fillStyle = color;
    ctx.fillRect(px, y, 2, 2);
  }
  // Новый уровень опыта — прыгающая стрелка над башней.
  if (t.pending > 0) {
    ctx.drawImage(SPRITES.levelUp, x + 1, y - 4 - (Math.floor(time * 4) % 2));
  }
}

function drawEnemy(ctx, e, time) {
  const def = e.def;
  const frames = SPRITES.enemies[e.type][def.form];
  const frame = frames[Math.floor(e.anim * (def.flying ? 8 : 5)) % 2];
  const tint = e.flash > 0 || e.invulnUntil > time ? 'white'
    : e.frozenUntil > time ? 'ice' : e.slowUntil > time ? 'frost' : e.wetUntil > time ? 'wet' : null;
  const img = variant(frame, e.dir < 0, tint);
  const sc = def.scale ?? 1;
  const w = img.width * sc, h = img.height * sc;
  const bob = def.flying ? -8 + Math.round(Math.sin(e.anim * 5) * 1.5) : 0;
  const cx = Math.round(e.x + e.off), by = Math.round(e.y + e.off * 0.5 + 5);

  const sw = Math.round(w * 0.6);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(cx - (sw >> 1), by - 1, sw, 2);
  if (e.type === 'ghost') ctx.globalAlpha = 0.7;
  ctx.drawImage(img, cx - (w >> 1), by - h + bob, w, h);
  ctx.globalAlpha = 1;
  // Горящий враг — язычки пламени над головой.
  if (e.burnUntil > time && Math.random() < 0.6) {
    ctx.fillStyle = Math.random() < 0.5 ? '#ef7d57' : '#ffcd75';
    ctx.fillRect(cx - 3 + Math.floor(Math.random() * 6), by - h + bob + 2 + Math.floor(Math.random() * 4), 1, 2);
  }

  if (e.hp < e.maxHp) {
    const bw = def.boss ? 20 : 10;
    const bx = cx - (bw >> 1);
    const top = by - h + bob - 3 + (e.type === 'slime' ? 3 : 0);
    ctx.fillStyle = C.outline;
    ctx.fillRect(bx - 1, top - 1, bw + 2, 3);
    ctx.fillStyle = '#b13e53';
    ctx.fillRect(bx, top, bw, 1);
    ctx.fillStyle = '#38b764';
    ctx.fillRect(bx, top, Math.max(0, Math.round((bw * e.hp) / e.maxHp)), 1);
  }
  // Щит модификатора волны — голубая полоска над здоровьем.
  if (e.shield > 0) {
    const bw = def.boss ? 20 : 10;
    const top = by - h + bob - 5 + (e.type === 'slime' ? 3 : 0);
    ctx.fillStyle = '#73eff7';
    ctx.fillRect(cx - (bw >> 1), top, Math.max(1, Math.round((bw * e.shield) / (e.maxHp * 0.25))), 1);
  }
}

function drawProjectile(ctx, p) {
  const x = Math.round(p.x), y = Math.round(p.y);
  switch (p.kind) {
    case 'arrow':
      ctx.fillStyle = '#8b5a2b';
      for (let k = 1; k <= 3; k++) ctx.fillRect(Math.round(p.x - p.vx * k), Math.round(p.y - p.vy * k), 1, 1);
      ctx.fillStyle = C.white;
      ctx.fillRect(x, y, 1, 1);
      break;
    case 'bomb':
      ctx.fillStyle = C.outline;
      ctx.fillRect(x - 1, y - 1 - Math.round(Math.sin((1 - p.remaining / p.total) * Math.PI) * 5), 2, 2);
      break;
    case 'ball': {
      // Ядро летит по дуге: высота зависит от пройденной доли пути.
      const prog = 1 - Math.min(1, p.remaining / p.total);
      const lift = Math.round(Math.sin(prog * Math.PI) * 8);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - 1, y + 1, 3, 1);
      ctx.fillStyle = C.outline;
      ctx.fillRect(x - 1, y - 1 - lift, 3, 3);
      ctx.fillStyle = '#566c86';
      ctx.fillRect(x - 1, y - 1 - lift, 1, 1);
      break;
    }
    case 'ice':
      ctx.fillStyle = '#73eff7';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      ctx.fillStyle = C.white;
      ctx.fillRect(x - 1, y - 1, 1, 1);
      break;
    case 'spear':
      ctx.fillStyle = '#5d3a1a';
      for (let k = 1; k <= 6; k++) ctx.fillRect(Math.round(p.x - p.vx * k), Math.round(p.y - p.vy * k), 1, 1);
      ctx.fillStyle = '#94b0c2';
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(Math.round(p.x - p.vx), Math.round(p.y - p.vy), 1, 1);
      break;
    case 'water':
      ctx.fillStyle = '#41a6f6';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      ctx.fillStyle = '#73eff7';
      ctx.fillRect(Math.round(p.x - p.vx * 2), Math.round(p.y - p.vy * 2), 1, 1);
      break;
    case 'fireball':
      ctx.fillStyle = '#ef7d57';
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = '#ffcd75';
      ctx.fillRect(x, y - 1, 1, 2);
      break;
  }
}

// Метеор: падает сверху за 0.6 с, тень на земле растёт.
function drawMeteor(ctx, fx, time) {
  const t = Math.min(1, (time - fx.start) / (fx.at - fx.start));
  const r = Math.round(2 + t * 6);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(fx.x - r, fx.y - 1, r * 2, 3);
  ctx.globalAlpha = 1;
  const y = Math.round(fx.y - (1 - t) * 120), x = Math.round(fx.x + (1 - t) * 40);
  ctx.fillStyle = '#ffcd75';
  ctx.fillRect(x + 2, y - 4, 2, 2);
  ctx.fillStyle = '#ef7d57';
  ctx.fillRect(x - 2, y - 2, 5, 5);
  ctx.fillStyle = '#b13e53';
  ctx.fillRect(x - 1, y - 1, 3, 3);
}

// Молния — ломаная между целями со случайными изломами (только визуально).
function drawZap(ctx, z) {
  ctx.globalAlpha = Math.min(1, z.life / 0.1);
  for (const [color, w] of [['#c165e0', 2], ['#f4f4f4', 1]]) {
    ctx.fillStyle = color;
    for (let i = 0; i < z.points.length - 1; i++) {
      const a = z.points[i], b = z.points[i + 1];
      const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const j = s === 0 || s === steps ? 0 : Math.round((Math.random() - 0.5) * 3);
        ctx.fillRect(Math.round(a.x + (b.x - a.x) * t) + j, Math.round(a.y + (b.y - a.y) * t) - j, w, w);
      }
    }
  }
  ctx.globalAlpha = 1;
}
