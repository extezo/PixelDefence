import { TILE } from './config.js';
import { Game, STEP } from './game.js';
import { Renderer, VIEW_W, VIEW_H } from './render.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('game');
const sfx = new Sfx();
const game = new Game(sfx);
const renderer = new Renderer(canvas);
const ui = new UI(game, sfx);
const view = { hover: null };

// Игра начинается с главного меню.
game.state = 'menu';

function tileFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * VIEW_W;
  const y = ((e.clientY - r.top) / r.height) * VIEW_H;
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

canvas.addEventListener('pointermove', (e) => (view.hover = tileFromEvent(e)));
canvas.addEventListener('pointerleave', () => (view.hover = null));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  const { tx, ty } = tileFromEvent(e);
  view.hover = { tx, ty };
  if (e.button === 2) game.cancel();
  else if (e.button === 0) game.clickTile(tx, ty, e.shiftKey);
});

// Целочисленный масштаб сохраняет пиксели чёткими.
function fit() {
  const narrow = window.innerWidth < 900;
  const panel = document.getElementById('panel');
  const hud = document.getElementById('hud');
  const availW = window.innerWidth - (narrow ? 32 : panel.offsetWidth + 64);
  const availH = window.innerHeight - hud.offsetHeight - 48;
  let s = narrow ? availW / VIEW_W : Math.min(availW / VIEW_W, availH / VIEW_H);
  if (s >= 1) s = Math.floor(s);
  canvas.style.width = `${Math.round(VIEW_W * s)}px`;
  canvas.style.height = `${Math.round(VIEW_H * s)}px`;
}
window.addEventListener('resize', fit);
fit();

// Симуляция идёт фиксированными шагами независимо от частоты кадров — это делает реплеи точными.
const MAX_STEPS_PER_FRAME = 40;
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game.paused && !game.picking && !ui.blocking && game.state === 'playing') {
    acc += dt * game.speed;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS_PER_FRAME && game.state === 'playing') {
      game.update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  } else {
    acc = 0;
  }
  renderer.draw(game, view);
  ui.sync();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.game = game; // для отладки из консоли
window.ui = ui;
