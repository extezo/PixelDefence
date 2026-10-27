import { DATA, PALETTE, OGRE_PALETTE, SABOTEUR_PALETTE } from './sprite-data.js';
import { ENEMIES, TOWER_KEYS } from './config.js';

function buildSprite(rows, overrides = {}) {
  const w = rows[0].length, h = rows.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = overrides[ch] ?? PALETTE[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

const TINTS = {
  white: 'rgba(255,255,255,0.85)',
  frost: 'rgba(115,239,247,0.45)',
  ice: 'rgba(220,250,255,0.8)',
  wet: 'rgba(65,166,246,0.35)',
  shield: 'rgba(115,239,247,0.6)',
  off: 'rgba(26,28,44,0.55)',
};

// Отражённые и подкрашенные копии спрайта, кэшируются на самом canvas.
export function variant(img, flip, tint) {
  const key = (flip ? 'f' : '') + (tint || '');
  if (!key) return img;
  img._variants ??= {};
  if (img._variants[key]) return img._variants[key];
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  if (flip) {
    g.translate(img.width, 0);
    g.scale(-1, 1);
  }
  g.drawImage(img, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (tint) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = TINTS[tint];
    g.fillRect(0, 0, c.width, c.height);
  }
  return (img._variants[key] = c);
}

// Огр — перекрашенный гоблин; у остальных врагов свой рисунок.
const ENEMY_SOURCE = { ogre: ['goblin', OGRE_PALETTE], saboteur: ['goblin', SABOTEUR_PALETTE] };

// enemies[type][form] — кадры анимации для каждой эволюции: базовая палитра + перекраска формы.
function enemyForms(type) {
  const [src, basePalette] = ENEMY_SOURCE[type] ?? [type, {}];
  const forms = [];
  let palette = { ...basePalette };
  forms.push(DATA[src].map((f) => buildSprite(f, palette)));
  for (const evo of ENEMIES[type].evolve ?? []) {
    palette = { ...palette, ...evo.palette };
    forms.push(DATA[src].map((f) => buildSprite(f, palette)));
  }
  return forms;
}

export const SPRITES = {
  enemies: Object.fromEntries(Object.keys(ENEMIES).map((t) => [t, enemyForms(t)])),
  towers: Object.fromEntries(TOWER_KEYS.map((t) => [t, buildSprite(DATA[t])])),
  lock: buildSprite(DATA.lock),
  ruin: buildSprite(DATA.ruin),
  tree: buildSprite(DATA.tree),
  rock: buildSprite(DATA.rock),
  castle: buildSprite(DATA.castle),
  levelUp: buildSprite(DATA.levelUp),
};
