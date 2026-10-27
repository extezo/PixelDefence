import { TILE, COLS, ROWS } from './config.js';

export const CELL = { GRASS: 0, PATH: 1, DECOR: 2, CASTLE: 3, RUIN: 4 };

export function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

const inBounds = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

const MIN_PATH = 44;
const MAX_PATH = 80;

// Запасной маршрут на случай, если генератор не справится (практически не случается).
const FALLBACK_PATH = [
  [-1, 2], [3, 2], [3, 8], [8, 8], [8, 3], [13, 3], [13, 9], [17, 9], [17, 5], [19, 5],
];

// Одна попытка проложить дорогу слева направо чередованием горизонтальных и вертикальных
// отрезков. Дорога не должна касаться сама себя — между витками остаётся место под башни.
function tryPath(rng) {
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const used = new Set();
  const key = (x, y) => y * COLS + x;
  let x = 0, y = ri(1, ROWS - 2);
  used.add(key(x, y));
  const corners = [[-1, y]];

  const step = (nx, ny) => {
    if (nx < 0 || nx >= COLS || ny < 1 || ny > ROWS - 2 || used.has(key(nx, ny))) return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const mx = nx + dx, my = ny + dy;
      if ((mx !== x || my !== y) && used.has(key(mx, my))) return false;
    }
    used.add(key(nx, ny));
    x = nx;
    y = ny;
    return true;
  };
  const run = (dx, dy, len) => {
    for (let i = 0; i < len; i++) if (!step(x + dx, y + dy)) return false;
    if (len > 0) corners.push([x, y]);
    return true;
  };

  if (!run(1, 0, ri(1, 3))) return null;
  while (x < COLS - 3) {
    let ny;
    do ny = ri(1, ROWS - 2); while (Math.abs(ny - y) < 2);
    if (!run(0, Math.sign(ny - y), Math.abs(ny - y))) return null;
    // Иногда дорога делает петлю назад — так карты разнообразнее.
    const back = x > 5 && x < COLS - 5 && rng() < 0.25;
    if (!(back ? run(-1, 0, ri(2, 3)) : run(1, 0, ri(2, 5)))) return null;
  }
  if (!run(1, 0, COLS - 1 - x)) return null;
  return used.size >= MIN_PATH && used.size <= MAX_PATH ? corners : null;
}

function generatePath(rng) {
  for (let i = 0; i < 1000; i++) {
    const path = tryPath(rng);
    if (path) return path;
  }
  return FALLBACK_PATH;
}

function makeRoute(path) {
  const points = path.map(([x, y]) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 }));
  const segs = [];
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: length });
    length += len;
  }
  return { points, segs, length };
}

function pointOn(route, d) {
  for (const s of route.segs) {
    if (d < s.start + s.len) {
      const t = Math.max(0, (d - s.start) / s.len);
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    }
  }
  const last = route.points[route.points.length - 1];
  return { x: last.x, y: last.y };
}

// Второй вход: прямая дорога с верхнего или нижнего края, вливающаяся в горизонтальный участок
// основной дороги (Т-образный перекрёсток). Не касается остальной дороги и не идёт по деревьям.
function secondRoute(path, grid, rng) {
  const isPath = (x, y) => inBounds(x, y) && (grid[y][x] === CELL.PATH || grid[y][x] === CELL.CASTLE);
  const candidates = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, y0] = path[i], [x1, y1] = path[i + 1];
    if (y0 !== y1) continue;
    for (let x = Math.min(x0, x1) + 1; x < Math.max(x0, x1); x++) {
      if (x < 5 || x > COLS - 5) continue;
      for (const dir of [-1, 1]) candidates.push({ i, x, y: y0, dir });
    }
  }
  for (let n = candidates.length; n > 0; n--) {
    const c = candidates.splice(Math.floor(rng() * n), 1)[0];
    const cells = [];
    let ok = true;
    for (let y = c.y + c.dir; y >= 0 && y < ROWS; y += c.dir) {
      if (grid[y][c.x] !== CELL.GRASS || isPath(c.x - 1, y) || isPath(c.x + 1, y)) { ok = false; break; }
      if (y !== c.y + c.dir && isPath(c.x, y)) { ok = false; break; }
      cells.push([c.x, y]);
    }
    if (!ok || cells.length < 2) continue;
    for (const [x, y] of cells) grid[y][x] = CELL.PATH;
    const edge = c.dir < 0 ? -1 : ROWS;
    return [[c.x, edge], [c.x, c.y], ...path.slice(c.i + 1)];
  }
  return null;
}

// legacy — карта как до появления местности и второго входа: так грузятся старые сохранения,
// чтобы башни встали ровно туда, где стояли.
export function buildMap(seed, { legacy = false } = {}) {
  const rng = mulberry32(seed);
  const path = generatePath(rng);
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(CELL.GRASS));

  for (let i = 0; i < path.length - 1; i++) {
    const [x0, y0] = path[i];
    const [x1, y1] = path[i + 1];
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    for (;;) {
      if (inBounds(x, y)) grid[y][x] = CELL.PATH;
      if (x === x1 && y === y1) break;
      x += dx;
      y += dy;
    }
  }
  const [cx, cy] = path[path.length - 1];
  grid[cy][cx] = CELL.CASTLE;

  // Деревья и камни — не рядом с дорогой, чтобы оставить места под башни.
  const nearPath = (x, y) => {
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++)
        if (inBounds(x + i, y + j) && grid[y + j][x + i] !== CELL.GRASS && grid[y + j][x + i] !== CELL.DECOR) return true;
    return false;
  };
  const decor = [];
  const decorCount = 10 + Math.floor(rng() * 8);
  for (let tries = 0; decor.length < decorCount && tries < 500; tries++) {
    const x = Math.floor(rng() * COLS), y = Math.floor(rng() * ROWS);
    if (grid[y][x] !== CELL.GRASS || nearPath(x, y)) continue;
    grid[y][x] = CELL.DECOR;
    decor.push({ x, y, kind: rng() < 0.65 ? 'tree' : 'rock' });
  }

  // Местность и второй вход — отдельным генератором, чтобы не сдвинуть дорогу и деревья старых карт.
  const routes = [makeRoute(path)];
  const features = new Map(); // "x,y" -> 'hill' | 'ore'
  if (!legacy) {
    const frng = mulberry32(seed ^ 0x2c1b3c6d);
    if (frng() < 0.65) {
      const second = secondRoute(path, grid, frng);
      if (second) routes.push(makeRoute(second));
    }
    const grass = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === CELL.GRASS) grass.push([x, y]);
    const take = (filter) => {
      const list = grass.filter(([x, y]) => grid[y][x] === CELL.GRASS && !features.has(`${x},${y}`) && filter(x, y));
      return list.length ? list[Math.floor(frng() * list.length)] : null;
    };
    const near = (x, y, r) => {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++)
        if (inBounds(x + i, y + j) && grid[y + j][x + i] === CELL.PATH) return true;
      return false;
    };
    for (let i = 0, n = 3 + Math.floor(frng() * 3); i < n; i++) {
      const c = take((x, y) => near(x, y, 2));
      if (c) features.set(`${c[0]},${c[1]}`, 'hill');
    }
    for (let i = 0, n = 2 + Math.floor(frng() * 2); i < n; i++) {
      const c = take(() => true);
      if (c) features.set(`${c[0]},${c[1]}`, 'ore');
    }
    // Руины занимают хорошие клетки у дороги; их можно расчистить за золото.
    for (let i = 0, n = 3 + Math.floor(frng() * 3); i < n; i++) {
      const c = take((x, y) => near(x, y, 1));
      if (c) grid[c[1]][c[0]] = CELL.RUIN;
    }
  }

  const main = routes[0];
  return {
    seed,
    legacy,
    grid,
    routes,
    segs: main.segs,
    length: main.length,
    decor,
    features,
    castle: { x: cx, y: cy },
    cell(tx, ty) {
      return inBounds(tx, ty) ? grid[ty][tx] : -1;
    },
    feature(tx, ty) {
      return features.get(`${tx},${ty}`) ?? null;
    },
    routeLength(r = 0) {
      return routes[r].length;
    },
    pointAt(d, r = 0) {
      return pointOn(routes[r], d);
    },
  };
}
