/* =========================================================
   Olya's Birthday Fortune: the falling-money game engine.

   A little running character moves left and right along the
   bottom of the game area and catches money falling from the sky.
   The round lasts GAME_DURATION seconds and gets harder over time:
   money falls faster, appears more often, and bigger bills show up.

   Exposes window.MoneyGame (a class). The engine knows nothing
   about the page. It reports what happens through callbacks:
     onUpdate(state), onCatch(info), onGameOver(stats)
   ========================================================= */
(function (global) {
  'use strict';

  const GAME_DURATION = 60; // seconds per round

  // Money types: value in $, emoji, drawn size (relative to the character) and base spawn weight
  const MONEY = {
    coin: { emoji: '🪙', value: 10,  size: 0.42 },
    cash: { emoji: '💵', value: 100, size: 0.5 },
    bag:  { emoji: '💰', value: 500, size: 0.56 },
  };

  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Spawn chances shift toward bigger money as the game goes on (d = difficulty 0..1). */
  function pickMoneyType(d) {
    const weights = [['coin', lerp(62, 38, d)], ['cash', lerp(30, 42, d)], ['bag', lerp(8, 20, d)]];
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * total;
    for (const [type, weight] of weights) {
      r -= weight;
      if (r < 0) return type;
    }
    return 'coin';
  }

  /** Pre-render each emoji once into a small canvas: much faster than fillText every frame. */
  function makeSprite(emoji, size) {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    const px = Math.ceil(size * 1.3);
    c.width = c.height = px * dpr;
    const cx = c.getContext('2d');
    cx.scale(dpr, dpr);
    cx.font = `${size}px ${EMOJI_FONT}`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(emoji, px / 2, px / 2 + size * 0.06);
    return { canvas: c, px };
  }

  class MoneyGame {
    constructor({ canvas, onUpdate, onCatch, onGameOver }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onUpdate = onUpdate || (() => {});
      this.onCatch = onCatch || (() => {});
      this.onGameOver = onGameOver || (() => {});

      this.W = 0;
      this.H = 0;
      this.keys = { left: false, right: false };
      this.touchDir = 0;
      this.pointerX = null;
      this.running = false;
      this.paused = false;
      this.over = false;
      this.rafId = null;
      this.reset();
    }

    /* ---------- Setup ---------- */

    reset() {
      this.score = 0;
      this.caught = 0;
      this.elapsed = 0;
      this.spawnTimer = 0.4;
      this.items = [];
      this.sparks = [];
      this.over = false;
      this.paused = false;
      this.player = { x: this.W / 2, vx: 0, facing: 1, phase: 0, catchGlow: 0 };
    }

    /** Size the canvas (in CSS pixels) and keep it sharp on high-DPI screens. */
    resize(width, height) {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const oldW = this.W;
      this.W = width;
      this.H = height;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Character size scales with the game area
      this.ph = clamp(height * 0.16, 64, 110);
      this.pw = this.ph * 0.5;
      this.groundY = height - clamp(height * 0.05, 16, 30);

      this.sprites = {};
      for (const [type, m] of Object.entries(MONEY)) this.sprites[type] = makeSprite(m.emoji, this.ph * m.size);

      // Keep the character at the same relative spot after a resize
      this.player.x = oldW ? (this.player.x / oldW) * width : width / 2;
      this.player.x = clamp(this.player.x, this.pw / 2, width - this.pw / 2);
      if (!this.running || this.paused || this.over) this.draw();
    }

    get difficulty() { return clamp(this.elapsed / GAME_DURATION, 0, 1); }
    get level() { return 1 + Math.floor(this.elapsed / 10); }
    get timeLeft() { return Math.max(0, GAME_DURATION - this.elapsed); }

    state() {
      return { score: this.score, timeLeft: this.timeLeft, level: this.level, paused: this.paused, over: this.over };
    }

    /* ---------- Controls ---------- */

    setKey(dir, pressed) {
      if (dir < 0) this.keys.left = pressed;
      else this.keys.right = pressed;
      if (pressed) this.pointerX = null; // keyboard takes over from dragging
    }

    setTouchDir(dir) {
      this.touchDir = dir;
      if (dir) this.pointerX = null;
    }

    /** Dragging/tapping on the game: run toward that x position (null = stop following). */
    setPointerX(x) { this.pointerX = x; }

    /* ---------- Game loop ---------- */

    start() {
      this.stop();
      this.reset();
      this.running = true;
      this.lastTime = performance.now();
      this.onUpdate(this.state());
      this.rafId = requestAnimationFrame((t) => this.frame(t));
    }

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    togglePause(force) {
      if (!this.running || this.over) return;
      this.paused = typeof force === 'boolean' ? force : !this.paused;
      this.keys.left = this.keys.right = false;
      this.touchDir = 0;
      this.pointerX = null;
      this.lastTime = performance.now();
      this.onUpdate(this.state());
    }

    frame(time) {
      if (!this.running) return;
      const dt = Math.min(0.05, (time - this.lastTime) / 1000); // cap so a lag spike can't teleport things
      this.lastTime = time;

      if (!this.paused && !this.over) this.update(dt);
      this.draw();
      this.rafId = requestAnimationFrame((t) => this.frame(t));
    }

    update(dt) {
      const prevSecond = Math.ceil(this.timeLeft);
      this.elapsed += dt;
      this.updatePlayer(dt);
      this.updateSpawning(dt);
      this.updateItems(dt);
      this.updateSparks(dt);

      if (this.timeLeft <= 0) {
        this.over = true;
        this.onUpdate(this.state());
        this.onGameOver({ score: this.score, caught: this.caught, level: this.level });
      } else if (Math.ceil(this.timeLeft) !== prevSecond) {
        this.onUpdate(this.state());
      }
    }

    updatePlayer(dt) {
      const p = this.player;
      const maxSpeed = Math.max(400, this.W * 0.85);

      let targetVx = 0;
      const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) || this.touchDir;
      if (dir) {
        targetVx = dir * maxSpeed;
      } else if (this.pointerX !== null) {
        const dx = this.pointerX - p.x;
        targetVx = Math.abs(dx) < 4 ? 0 : clamp(dx * 9, -maxSpeed, maxSpeed);
      }

      // Smooth acceleration so the character feels springy, not robotic
      p.vx += (targetVx - p.vx) * Math.min(1, dt * 14);
      p.x += p.vx * dt;

      const half = this.pw / 2;
      if (p.x < half) { p.x = half; p.vx = 0; }
      if (p.x > this.W - half) { p.x = this.W - half; p.vx = 0; }

      if (Math.abs(p.vx) > 20) p.facing = Math.sign(p.vx);
      p.phase += Math.abs(p.vx) * dt * (9 / this.ph);
      p.catchGlow = Math.max(0, p.catchGlow - dt * 3);
    }

    updateSpawning(dt) {
      const d = this.difficulty;
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) return;

      // Money appears more and more often: every ~0.9s at the start, ~0.3s at the end
      this.spawnTimer = lerp(0.9, 0.3, d) * (0.7 + Math.random() * 0.6);
      this.spawnItem();
      if (Math.random() < d * 0.4) this.spawnItem(); // sometimes two at once
    }

    spawnItem() {
      const d = this.difficulty;
      const type = pickMoneyType(d);
      const r = (this.ph * MONEY[type].size) / 2;
      // Falls from the top of the screen to the ground in ~3.3s at the start, ~1.3s at the end
      const baseSpeed = this.H / lerp(3.3, 1.3, d);
      this.items.push({
        type,
        r,
        x: r + Math.random() * (this.W - r * 2),
        y: -r,
        vy: baseSpeed * (0.85 + Math.random() * 0.3) * (type === 'bag' ? 1.15 : 1),
        sway: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.6,
        missed: 0, // >0 = lying on the ground, fading away
      });
    }

    updateItems(dt) {
      const p = this.player;
      const top = this.groundY - this.ph * 0.95; // head height: the character catches with the whole body
      const reach = this.pw / 2 + 4;

      for (const it of this.items) {
        if (it.missed) {
          it.missed += dt;
          continue;
        }
        it.y += it.vy * dt;
        it.sway += dt * 3;

        const touching = Math.abs(it.x - p.x) < reach + it.r * 0.5 && it.y + it.r * 0.6 >= top && it.y - it.r < this.groundY;
        if (touching) {
          it.caught = true;
          this.catchItem(it);
        } else if (it.y + it.r * 0.7 >= this.groundY) {
          it.y = this.groundY - it.r * 0.7;
          it.missed = 0.0001; // start fading
        }
      }
      this.items = this.items.filter((it) => !it.caught && it.missed < 0.45);
    }

    catchItem(it) {
      const value = MONEY[it.type].value;
      this.score += value;
      this.caught++;
      this.player.catchGlow = 1;

      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 140;
        this.sparks.push({ x: it.x, y: it.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.6 });
      }

      this.onCatch({ value, type: it.type, x: this.player.x, y: this.groundY - this.ph * 1.1 });
      this.onUpdate(this.state());
    }

    updateSparks(dt) {
      for (const s of this.sparks) {
        s.life -= dt;
        s.vy += 400 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      this.sparks = this.sparks.filter((s) => s.life > 0);
    }

    /* ---------- Drawing ---------- */

    draw() {
      const { ctx, W, H } = this;
      if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);

      this.drawGround();
      this.drawStartHint();
      for (const it of this.items) this.drawItem(it);
      this.drawPlayer();
      this.drawSparks();
    }

    drawGround() {
      const { ctx, W, H, groundY } = this;
      const g = ctx.createLinearGradient(0, groundY, 0, H);
      g.addColorStop(0, 'rgba(255, 197, 61, 0.35)');
      g.addColorStop(1, 'rgba(255, 197, 61, 0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = 'rgba(255, 197, 61, 0.7)';
      ctx.fillRect(0, groundY, W, 2);
    }

    /** Short "how to play" text that fades out during the first seconds. */
    drawStartHint() {
      const alpha = clamp(1 - (this.elapsed - 2) / 1, 0, 1);
      if (!alpha || this.over) return;
      const { ctx, W, H } = this;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#3b1f5c';
      ctx.textAlign = 'center';
      ctx.font = `600 ${clamp(W * 0.05, 16, 26)}px Rubik, Nunito, sans-serif`;
      ctx.fillText('Лови гроші! 💸', W / 2, H * 0.36);
      ctx.font = `500 ${clamp(W * 0.032, 12, 16)}px Nunito, sans-serif`;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillText('← → / A D  або тягни пальцем', W / 2, H * 0.36 + 28);
      ctx.restore();
    }

    drawItem(it) {
      const { ctx } = this;
      const sprite = this.sprites[it.type];
      ctx.save();
      ctx.globalAlpha = it.missed ? Math.max(0, 1 - it.missed / 0.45) : 1;
      ctx.translate(it.x + (it.missed ? 0 : Math.sin(it.sway) * 3), it.y);
      ctx.rotate(it.missed ? 0.5 : Math.sin(it.sway) * it.spin);

      if (it.type === 'bag' && !it.missed) {
        // Big money gets a golden glow so it's easy to spot
        ctx.shadowColor = 'rgba(255, 210, 80, 0.9)';
        ctx.shadowBlur = 18;
      }
      ctx.drawImage(sprite.canvas, -sprite.px / 2, -sprite.px / 2, sprite.px, sprite.px);
      ctx.restore();
    }

    drawSparks() {
      const { ctx } = this;
      ctx.save();
      for (const s of this.sparks) {
        ctx.globalAlpha = clamp(s.life / 0.6, 0, 1);
        ctx.fillStyle = '#ffd45e';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /**
     * The character: a little girl with a ponytail and a party hat.
     * Drawn around her feet at (0, 0); u = 1% of her height.
     */
    drawPlayer() {
      const { ctx } = this;
      const p = this.player;
      const u = this.ph / 100;
      const run = clamp(Math.abs(p.vx) / 250, 0, 1); // 0 = standing, 1 = full sprint
      const swing = Math.sin(p.phase) * 0.7 * run;
      const bob = -Math.abs(Math.cos(p.phase)) * 4 * u * run;

      // Shadow on the ground
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x, this.groundY + 2, this.pw * 0.55, 5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(p.x, this.groundY + bob);
      ctx.scale(p.facing, 1);
      if (run > 0.2) ctx.rotate(0.08 * run); // lean into the run
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (p.catchGlow) {
        ctx.shadowColor = `rgba(255, 210, 80, ${p.catchGlow})`;
        ctx.shadowBlur = 25 * p.catchGlow;
      }

      const hipY = -38 * u;
      const shoulderY = -66 * u;
      const limb = (x0, y0, angle, len, width, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        const x1 = x0 + Math.sin(angle) * len;
        const y1 = y0 + Math.cos(angle) * len;
        ctx.lineTo(x1, y1);
        ctx.stroke();
        return [x1, y1];
      };

      // Back arm and back leg (slightly darker, behind the body)
      limb(0, shoulderY + 3 * u, -swing - 0.15, 24 * u, 7 * u, '#e8b79c');
      const [bfx, bfy] = limb(-3 * u, hipY, -swing, 34 * u, 8 * u, '#4a2c73');
      this.drawShoe(bfx, bfy, u, '#c2255c');

      // Ponytail bouncing behind the head
      const tailBounce = Math.sin(p.phase * 2) * 4 * u * run;
      ctx.fillStyle = '#e2b25c';
      ctx.beginPath();
      ctx.ellipse(-15 * u, -84 * u + tailBounce, 6 * u, 12 * u, 0.6 + run * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Dress
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath();
      ctx.moveTo(-9 * u, shoulderY);
      ctx.lineTo(9 * u, shoulderY);
      ctx.lineTo(15 * u, hipY + 2 * u);
      ctx.quadraticCurveTo(0, hipY + 7 * u, -15 * u, hipY + 2 * u);
      ctx.closePath();
      ctx.fill();
      // A little heart on the dress
      ctx.fillStyle = '#fff';
      ctx.font = `${9 * u}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('♥', 1 * u, -48 * u);

      // Front leg and front arm
      const [ffx, ffy] = limb(3 * u, hipY, swing, 34 * u, 8 * u, '#5b3a8a');
      this.drawShoe(ffx, ffy, u, '#e64980');
      limb(0, shoulderY + 3 * u, swing + 0.15, 24 * u, 7 * u, '#ffd9c2');

      // Head
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd9c2';
      ctx.beginPath();
      ctx.arc(2 * u, -82 * u, 13 * u, 0, Math.PI * 2);
      ctx.fill();
      // Hair (top of the head)
      ctx.fillStyle = '#eec170';
      ctx.beginPath();
      ctx.arc(1 * u, -84 * u, 13.5 * u, Math.PI * 1.02, Math.PI * 1.95);
      ctx.quadraticCurveTo(4 * u, -88 * u, -11 * u, -78 * u);
      ctx.closePath();
      ctx.fill();
      // Eye, cheek and smile (she's looking where she runs)
      ctx.fillStyle = '#3b1f5c';
      ctx.beginPath();
      ctx.arc(8 * u, -83 * u, 1.8 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 93, 143, 0.45)';
      ctx.beginPath();
      ctx.arc(6 * u, -77 * u, 2.8 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3b1f5c';
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.arc(9 * u, -79 * u, 3.5 * u, 0.2 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();

      // Party hat with a pompom
      ctx.fillStyle = '#9b5de5';
      ctx.beginPath();
      ctx.moveTo(-8 * u, -94 * u);
      ctx.lineTo(9 * u, -95 * u);
      ctx.lineTo(3 * u, -114 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffc53d';
      ctx.beginPath();
      ctx.arc(-2 * u, -99 * u, 1.6 * u, 0, Math.PI * 2);
      ctx.arc(4 * u, -103 * u, 1.6 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3 * u, -115 * u, 3.2 * u, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    drawShoe(x, y, u, color) {
      const { ctx } = this;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x + 3 * u, y, 6 * u, 3.5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  MoneyGame.DURATION = GAME_DURATION;
  MoneyGame.MONEY = MONEY;
  global.MoneyGame = MoneyGame;
})(window);
