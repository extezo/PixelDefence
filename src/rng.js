// Детерминированный генератор случайных чисел (mulberry32) с сохраняемым состоянием.
// Вся игровая случайность идёт через него — поэтому реплей воспроизводит партию точь-в-точь.
// Math.random остаётся только для чисто визуальных эффектов (частицы, разброс спрайтов).
export class Rng {
  constructor(state) {
    this.state = state | 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n) {
    return Math.floor(this.next() * n);
  }
}
