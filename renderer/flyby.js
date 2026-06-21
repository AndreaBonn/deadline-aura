'use strict';

/* global flybyApi */

const PARTICLE_COUNT = 14;
const EXPLOSION_DURATION_MS = 550;
const PARTICLE_COLORS = ['#cbd5e1', '#e2e8f0', '#f8fafc', '#94a3b8', '#818cf8', '#ffffff'];
const PARTICLE_SIZES = [5, 7, 9, 11];

const flybyEl = document.getElementById('flyby');
const explosionEl = document.getElementById('explosion');
const bannerText = document.getElementById('bannerText');
const pigeonEl = document.getElementById('pigeon');

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createExplosionParticles(originX, originY) {
  explosionEl.innerHTML = '';
  const angleStep = (2 * Math.PI) / PARTICLE_COUNT;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    const angle = angleStep * i + (Math.random() - 0.5) * 0.6;
    const distance = 50 + Math.random() * 70;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const size = randomFromArray(PARTICLE_SIZES);

    particle.style.cssText =
      'left:' +
      originX +
      'px;' +
      'top:' +
      originY +
      'px;' +
      'width:' +
      size +
      'px;' +
      'height:' +
      size +
      'px;' +
      'background:' +
      randomFromArray(PARTICLE_COLORS) +
      ';' +
      '--tx:' +
      Math.round(tx) +
      'px;' +
      '--ty:' +
      Math.round(ty) +
      'px;';

    explosionEl.appendChild(particle);
  }
}

function handleClick() {
  flybyApi.clicked();

  const rect = pigeonEl.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  flybyEl.classList.add('flyby-hidden');
  createExplosionParticles(originX, originY);
  explosionEl.classList.add('active');

  setTimeout(() => {
    flybyApi.dismiss();
  }, EXPLOSION_DURATION_MS);
}

flybyApi.onInit(function (data) {
  bannerText.innerHTML = escapeHtml(data.title);
  flybyEl.addEventListener('click', handleClick, { once: true });
});
