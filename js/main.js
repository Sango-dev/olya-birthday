/* =========================================================
   Olya's Birthday: screen flow, controls, sound and celebrations.
   Flow: greeting (photo + wishes) → money game → final birthday message.
   ========================================================= */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const formatMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

  /* ---------- Tiny localStorage wrapper (never throws) ---------- */
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
  };

  /* ---------- Screen flow ---------- */
  const screens = {
    greeting: $('#greeting-screen'),
    game: $('#game-screen'),
    final: $('#final-screen'),
  };
  let currentScreen = 'greeting';

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle('active', key === name));
    currentScreen = name;
    document.body.dataset.screen = name;
    window.scrollTo(0, 0);
  }

  /* ---------- Balloons & floating emoji ---------- */
  function createPartyDecor() {
    const layer = $('#party-layer');
    const colors = ['#ff5d8f', '#ffc53d', '#6bc8ff', '#9b5de5', '#2ec4b6', '#ff8c42'];
    const balloonCount = window.innerWidth < 600 ? 7 : 12;

    for (let i = 0; i < balloonCount; i++) {
      const balloon = document.createElement('div');
      const duration = 14 + Math.random() * 12;
      balloon.className = 'balloon';
      balloon.style.setProperty('--color', colors[i % colors.length]);
      balloon.style.setProperty('--size', `${48 + Math.random() * 26}px`);
      balloon.style.setProperty('--sway', `${20 + Math.random() * 40}px`);
      balloon.style.left = `${(i / balloonCount) * 100 + Math.random() * 5}%`;
      balloon.style.animationDuration = `${duration}s`;
      balloon.style.animationDelay = `${-Math.random() * duration}s`; // start mid-flight
      layer.appendChild(balloon);
    }

    const emojis = ['🎈', '✨', '❤️', '🎉', '💖', '🎂', '⭐', '🎁'];
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className = 'floaty';
      el.textContent = emojis[i % emojis.length];
      el.style.left = `${Math.random() * 95}%`;
      el.style.top = `${Math.random() * 95}%`;
      el.style.fontSize = `${18 + Math.random() * 18}px`;
      el.style.animationDuration = `${5 + Math.random() * 4}s`;
      el.style.animationDelay = `${-Math.random() * 6}s`;
      layer.appendChild(el);
    }
  }

  /* ---------- Sound effects (tiny Web Audio synth, no files needed) ---------- */
  const Sound = {
    enabled: store.get('olya-sound', true),
    ctx: null,

    // Browsers only allow audio after a user gesture, so call this from click/key handlers
    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    },

    tone(freq, delay, duration, type = 'sine', volume = 0.1) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    },

    // Coins "clink", banknotes "cha-ching", money bags get a little fanfare
    catch(type) {
      if (type === 'coin') {
        this.tone(1568, 0, 0.12, 'square', 0.03);
      } else if (type === 'cash') {
        this.tone(1318, 0, 0.12, 'square', 0.035);
        this.tone(1976, 0.06, 0.2, 'sine', 0.06);
      } else {
        [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, i * 0.06, 0.2, 'square', 0.035));
        this.tone(2637, 0.28, 0.35, 'sine', 0.07);
      }
    },

    tick() { this.tone(880, 0, 0.06, 'triangle', 0.05); },

    timeUp() {
      [784, 659, 523].forEach((f, i) => this.tone(f, i * 0.14, 0.25, 'triangle', 0.1));
    },

    fanfare() {
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, i * 0.12, 0.3, 'triangle', 0.1));
    },
  };

  /* ---------- Birthday music: "Happy Birthday" on a synthesized music box ---------- */
  const Music = {
    enabled: store.get('olya-music', true), // Olya's choice, remembered
    playing: false,
    master: null,
    loopTimer: null,

    BEAT: 0.42, // seconds per beat (3/4 time)
    // [note in semitones from C4, length in beats]
    MELODY: [
      [7, 0.75], [7, 0.25], [9, 1], [7, 1], [12, 1], [11, 2],
      [7, 0.75], [7, 0.25], [9, 1], [7, 1], [14, 1], [12, 2],
      [7, 0.75], [7, 0.25], [19, 1], [16, 1], [12, 1], [11, 1], [9, 2],
      [17, 0.75], [17, 0.25], [16, 1], [12, 1], [14, 1], [12, 3],
    ],

    // One music-box "pling": a bell-like sine plus a quiet octave shimmer
    note(semi, t, len) {
      const ctx = Sound.ctx;
      const freq = 261.63 * Math.pow(2, semi / 12);
      [[1, 0.16], [2, 0.04]].forEach(([mult, vol]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * mult, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.5, len * 1.4));
        osc.connect(gain).connect(this.master);
        osc.start(t);
        osc.stop(t + len * 1.4 + 0.6);
      });
    },

    // Schedules the whole song, then queues the next round just before this one ends
    scheduleLoop(startAt) {
      let t = startAt;
      this.MELODY.forEach(([semi, beats]) => {
        const len = beats * this.BEAT;
        this.note(semi, t, len);
        t += len;
      });
      t += this.BEAT * 2; // a short breath between rounds
      const msUntilNext = (t - Sound.ctx.currentTime - 0.3) * 1000;
      this.loopTimer = setTimeout(() => this.scheduleLoop(t), msUntilNext);
    },

    play() {
      if (!this.enabled || this.playing || !Sound.ctx) return;
      this.playing = true;
      this.master = Sound.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(Sound.ctx.destination);
      this.scheduleLoop(Sound.ctx.currentTime + 0.15);
      renderMusicBtn();
    },

    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearTimeout(this.loopTimer);
      // Quick fade, then drop the whole node so already-scheduled notes go silent
      const master = this.master;
      const now = Sound.ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.25);
      setTimeout(() => master.disconnect(), 300);
      this.master = null;
      renderMusicBtn();
    },
  };

  const musicBtn = $('#music-btn');
  function renderMusicBtn() {
    musicBtn.classList.toggle('playing', Music.playing);
    musicBtn.classList.toggle('muted', !Music.enabled);
    musicBtn.setAttribute('aria-pressed', String(Music.playing));
    musicBtn.title = Music.playing ? 'Вимкнути музику' : 'Увімкнути музику';
  }

  /* ---------- Game setup ---------- */
  const gameFrame = $('#game-frame');
  const canvas = $('#game-canvas');
  const floatLayer = $('#float-layer');
  const scoreEl = $('#score');
  const timerEl = $('#timer');
  const pauseOverlay = $('#pause-overlay');
  const timeupOverlay = $('#timeup-overlay');

  let lastStats = null;
  let gameOverTimer = null;
  let lastShownSecond = null;

  const game = new MoneyGame({
    canvas,
    onUpdate: updateHud,
    onCatch: handleCatch,
    onGameOver: handleGameOver,
  });

  function updateHud(state) {
    scoreEl.textContent = formatMoney(state.score);

    const secs = Math.ceil(state.timeLeft);
    timerEl.textContent = `⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    timerEl.classList.toggle('hurry', secs <= 10 && !state.over);
    if (secs <= 5 && secs > 0 && secs !== lastShownSecond && !state.paused) Sound.tick();
    lastShownSecond = secs;

    pauseOverlay.classList.toggle('hidden', !state.paused);
    $('#pause-btn').textContent = state.paused ? '▶' : '⏸';
  }

  /** Money caught: "+$100" pops up above the character, the score bumps. */
  function handleCatch({ value, type, x, y }) {
    const el = document.createElement('div');
    el.className = `float-text${type === 'bag' ? ' big' : ''}`;
    el.textContent = `+${formatMoney(value)}`;
    el.style.left = `${Math.max(50, Math.min(gameFrame.clientWidth - 50, x))}px`; // stay inside the game area
    el.style.top = `${y}px`;
    floatLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());

    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth; // restart the CSS animation
    scoreEl.classList.add('bump');

    Sound.catch(type);
    if (type === 'bag') {
      const rect = gameFrame.getBoundingClientRect();
      Confetti.burst(30, rect.left + x, rect.top + y);
    }
  }

  function handleGameOver(stats) {
    const best = store.get('olya-best', 0);
    lastStats = {
      ...stats,
      best: Math.max(best, stats.score),
      isRecord: best > 0 && stats.score > best,
    };
    store.set('olya-best', lastStats.best);

    Sound.timeUp();
    timeupOverlay.classList.remove('hidden');
    gameOverTimer = setTimeout(showFinal, 1600);
  }

  /** Make the game area fill the space between the header and the controls. */
  function fitGame() {
    if (currentScreen !== 'game') return;
    game.resize(gameFrame.clientWidth, gameFrame.clientHeight);
  }

  function startGame() {
    clearTimeout(gameOverTimer);
    timeupOverlay.classList.add('hidden');
    floatLayer.innerHTML = '';
    lastStats = null;
    lastShownSecond = null;
    Music.stop(); // the game has its own coin sounds
    showScreen('game');
    if (document.activeElement) document.activeElement.blur(); // so keys don't "click" buttons
    game.stop();
    fitGame(); // reading layout sizes forces a synchronous layout, so this is safe right away
    game.start();
  }

  /* ---------- Final birthday message ---------- */
  function showFinal() {
    game.stop();
    const stats = lastStats || { score: game.score, best: game.score, isRecord: false };

    $('#final-best').textContent = formatMoney(stats.best);
    $('#record-badge').classList.toggle('hidden', !stats.isRecord);

    showScreen('final');
    countUp($('#final-amount'), stats.score, 1600);
    Sound.fanfare();
    Confetti.cannons();
    setTimeout(() => Confetti.burst(140), 500);
    setTimeout(() => { if (currentScreen === 'final') Music.play(); }, 1200); // after the fanfare
  }

  // Animated "money counter" from $0 up to the final score
  function countUp(el, target, duration) {
    const start = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatMoney(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Keyboard controls (hold to run) ---------- */
  const moveKeys = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

  document.addEventListener('keydown', (e) => {
    if (currentScreen !== 'game') return;
    if (e.code in moveKeys) {
      e.preventDefault();
      Sound.unlock();
      game.setKey(moveKeys[e.code], true);
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      game.togglePause();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code in moveKeys) game.setKey(moveKeys[e.code], false);
  });

  /* ---------- Touch controls: hold ◀ ▶, or drag a finger across the game ---------- */
  document.querySelectorAll('#touch-controls [data-dir]').forEach((btn) => {
    const dir = Number(btn.dataset.dir);
    const stop = () => {
      btn.classList.remove('pressed');
      game.setTouchDir(0);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Sound.unlock();
      btn.classList.add('pressed');
      game.setTouchDir(dir);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  let dragging = false;
  const pointerToGame = (e) => e.clientX - canvas.getBoundingClientRect().left;
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    game.setPointerX(pointerToGame(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) game.setPointerX(pointerToGame(e));
  });
  ['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => {
    dragging = false;
    game.setPointerX(null);
  }));

  /* ---------- Buttons ---------- */
  function onClick(selector, handler) {
    $(selector).addEventListener('click', (e) => {
      Sound.unlock();
      e.currentTarget.blur();
      handler();
    });
  }

  onClick('#start-btn', startGame);
  onClick('#play-again-btn', startGame);
  onClick('#pause-btn', () => game.togglePause());
  onClick('#home-btn', () => {
    showScreen('greeting');
    Confetti.burst(120);
    Music.play();
  });
  pauseOverlay.addEventListener('click', () => game.togglePause(false));

  // Every photo is a surprise: it stays wrapped until Olya taps it
  document.querySelectorAll('.photo-cover').forEach((cover) => {
    cover.addEventListener('click', () => {
      Sound.unlock();
      const reveal = cover.closest('.photo-reveal');
      if (!reveal.classList.contains('is-hidden')) return;
      reveal.classList.remove('is-hidden');
      const isMain = reveal.id === 'photo-reveal';
      const r = reveal.getBoundingClientRect();
      Confetti.burst(isMain ? 160 : 70, r.left + r.width / 2, r.top + r.height / 2);
      [659, 784, 988, 1318].forEach((f, i) => Sound.tone(f, i * 0.08, 0.3, 'triangle', 0.08));
      if (isMain) setTimeout(() => Music.play(), 700); // the birthday song starts with the surprise
    });
  });

  onClick('#music-btn', () => {
    Music.enabled = !Music.playing;
    store.set('olya-music', Music.enabled);
    if (Music.enabled) Music.play(); else Music.stop();
    renderMusicBtn();
  });
  renderMusicBtn();

  const soundBtn = $('#sound-btn');
  const renderSoundBtn = () => { soundBtn.textContent = Sound.enabled ? '🔊' : '🔇'; };
  onClick('#sound-btn', () => {
    Sound.enabled = !Sound.enabled;
    store.set('olya-sound', Sound.enabled);
    renderSoundBtn();
  });
  renderSoundBtn();

  /* ---------- Window events ---------- */
  window.addEventListener('resize', fitGame);

  // Auto-pause when Olya switches tabs
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentScreen === 'game') game.togglePause(true);
    // The loop timer is throttled in background tabs, so rest the music and pick it up on return
    if (document.hidden) Music.stop();
    else if (currentScreen !== 'game' && !$('#photo-reveal').classList.contains('is-hidden')) Music.play();
  });

  // Handy for testing from the browser console
  window.__olya = { game, startGame, showFinal, Music };

  /* ---------- Let the party begin! ---------- */
  createPartyDecor();
  setTimeout(() => Confetti.cannons(), 400);
})();
