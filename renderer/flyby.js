'use strict';

/* global flybyApi */

// Sprite sheet "oneko" (il gatto pixel classico), pubblico dominio.
// Sorgente: https://github.com/adryd325/oneko.js  (oneko.gif, 256x128, celle 32x32).
const SPRITE =
  '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';

const stage = document.getElementById('stage');
const catWrap = document.getElementById('catWrap');
const cat = document.getElementById('cat');
const yarn = document.getElementById('yarn');
const thread = document.getElementById('thread');
const nameMask = document.getElementById('nameMask');
const nameText = document.getElementById('nameText');

cat.style.setProperty('--sheet', `url(data:image/gif;base64,${SPRITE})`);

// Pose oneko: [colonna, riga] in celle da 32px sullo sprite sheet.
const POSES = {
  sit: [[3, 3]],
  lick: [
    [5, 0],
    [6, 0],
    [7, 0],
  ],
  run: [
    [3, 0],
    [3, 1],
  ],
  alert: [[7, 3]],
};

let frameTimer = null;
function setFrame(pose, i) {
  const f = POSES[pose][i % POSES[pose].length];
  cat.style.backgroundPosition = `${-f[0] * 32}px ${-f[1] * 32}px`;
}
function anim(pose, fps) {
  clearInterval(frameTimer);
  let i = 0;
  setFrame(pose, 0);
  if (POSES[pose].length > 1) {
    frameTimer = setInterval(() => setFrame(pose, ++i), 1000 / fps);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function tx(el, px, ms) {
  el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4,0,.2,1)` : 'none';
  el.style.transform = `translateX(${px}px)`;
}
function lf(el, px, ms, ease = 'linear') {
  el.style.transition = ms ? `left ${ms}ms ${ease}` : 'none';
  el.style.left = px + 'px';
}

let finished = false;
function finish() {
  if (finished) {
    return;
  }
  finished = true;
  clearInterval(frameTimer);
  stage.classList.add('fade-out');
  setTimeout(() => flybyApi.done(), 520);
}

let seq = 0;
let escaped = false;

// Clic sul gatto: niente esplosione, scatta subito veloce fuori schermo a destra.
function escapeCat() {
  if (escaped || finished) {
    return;
  }
  escaped = true;
  seq++;
  clearInterval(frameTimer);
  anim('run', 16);
  tx(catWrap, window.innerWidth + 240, 420);
  setTimeout(finish, 460);
}

// Finestra click-through: rendiamola interattiva solo quando il puntatore e'
// sopra il gatto, cosi' resta cliccabile senza bloccare il resto del desktop.
let interactive = false;
function updateHover(x, y) {
  const r = cat.getBoundingClientRect();
  const over = !escaped && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  if (over !== interactive) {
    interactive = over;
    flybyApi.setIgnore(!over);
  }
}
window.addEventListener('mousemove', (e) => updateHover(e.clientX, e.clientY));
catWrap.addEventListener('click', escapeCat);

async function play(holdSeconds) {
  const mine = ++seq;
  const aborted = () => mine !== seq;
  const W = window.innerWidth;
  const catX = Math.round(W * 0.38);
  const nameW = nameText.offsetWidth;
  const cx = Math.round((W - nameW) / 2);

  tx(catWrap, -130, 0);
  lf(yarn, -60, 0);
  yarn.style.transform = '';
  thread.style.transition = 'none';
  thread.style.width = '0px';
  thread.style.left = cx + 'px';
  nameMask.style.transition = 'none';
  nameMask.style.width = '0px';
  nameMask.style.left = cx + 'px';
  await sleep(30);
  if (aborted()) {
    return;
  }

  anim('run', 7); // 1) entra trotterellando
  tx(catWrap, catX, 2200);
  await sleep(2250);
  if (aborted()) {
    return;
  }

  anim('sit'); // 2) si siede
  await sleep(450);
  if (aborted()) {
    return;
  }

  anim('lick', 4); // 3) si lecca
  await sleep(900);
  if (aborted()) {
    return;
  }

  lf(yarn, catX + 4, 650, 'cubic-bezier(.2,.6,.3,1)'); // 4) il gomitolo arriva al gatto
  await sleep(680);
  if (aborted()) {
    return;
  }

  anim('alert'); // reazione
  await sleep(220);
  if (aborted()) {
    return;
  }

  const unroll = 1500; // 5) si srotola e scrive il nome (centrato)
  thread.style.transition = `width ${unroll}ms linear`;
  thread.style.width = nameW + 10 + 'px';
  nameMask.style.transition = `width ${unroll}ms linear`;
  nameMask.style.width = nameW + 'px';
  lf(yarn, W + 60, unroll, 'linear');
  await sleep(unroll);
  if (aborted()) {
    return;
  }

  anim('run', 11); // 6) insegue il gomitolo ed esce
  tx(catWrap, W + 200, 850);
  await sleep(900);
  if (aborted()) {
    return;
  }
  clearInterval(frameTimer);

  await sleep(holdSeconds * 1000); // 7) resta il nome
  if (aborted()) {
    return;
  }
  finish();
}

function staticShow(holdSeconds) {
  const W = window.innerWidth;
  const nameW = nameText.offsetWidth;
  const cx = Math.round((W - nameW) / 2);
  tx(catWrap, Math.round(W * 0.38), 0);
  setFrame('sit', 0);
  thread.style.left = cx + 'px';
  thread.style.width = nameW + 10 + 'px';
  nameMask.style.left = cx + 'px';
  nameMask.style.width = nameW + 'px';
  setTimeout(finish, Math.max(0, holdSeconds * 1000));
}

flybyApi.onInit((data) => {
  nameText.textContent = data.text || '';
  const holdSeconds = typeof data.holdSeconds === 'number' ? data.holdSeconds : 8;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // attende il font pixel cosi' la larghezza del nome e' misurata correttamente
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    if (reduced) {
      staticShow(holdSeconds);
    } else {
      play(holdSeconds);
    }
  });
});
