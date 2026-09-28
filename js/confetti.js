/* =========================================================
   Confetti — a tiny particle system drawn on a full-screen canvas.
   Exposes window.Confetti with: burst(), cannons(), rain(on).
   ========================================================= */
(function (global) {
  'use strict';

  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  const COLORS = ['#ff5d8f', '#ffc53d', '#6bc8ff', '#9b5de5', '#2ec4b6', '#ff8c42', '#ffffff'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let particles = [];
  let raining = false;
  let running = false;
  let W = 0;
  let H = 0;

  // Keep the canvas sharp on high-DPI screens
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function makeParticle(x, y, vx, vy) {
    return {
      x, y, vx, vy,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      shape: Math.random() < 0.6 ? 'rect' : 'circle',
      phase: Math.random() * Math.PI * 2,
      age: 0,
    };
  }

  function scaled(count) {
    return reduceMotion ? Math.floor(count / 4) : count;
  }

  /** Explosion of confetti from a point (defaults to upper middle of the screen). */
  function burst(count = 150, x = W / 2, y = H * 0.35) {
    for (let i = 0; i < scaled(count); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      particles.push(makeParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 4));
    }
    start();
  }

  /** Two "party cannons" shooting from the bottom corners. */
  function cannons(count = 90) {
    for (let i = 0; i < scaled(count); i++) {
      const speed = 12 + Math.random() * 10;
      const spread = (Math.random() - 0.5) * 0.5;
      // Left cannon aims up-right, right cannon aims up-left
      const a1 = -Math.PI / 3 + spread;
      const a2 = -Math.PI * 2 / 3 + spread;
      particles.push(makeParticle(0, H, Math.cos(a1) * speed, Math.sin(a1) * speed));
      particles.push(makeParticle(W, H, Math.cos(a2) * speed, Math.sin(a2) * speed));
    }
    start();
  }

  /** Gentle continuous confetti falling from the top. */
  function rain(on) {
    raining = on && !reduceMotion;
    if (raining) start();
  }

  function start() {
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);

    if (raining && particles.length < 120) {
      particles.push(makeParticle(Math.random() * W, -10, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 2));
    }

    for (const p of particles) {
      p.age++;
      p.vx *= 0.985;              // air drag
      p.vy = p.vy * 0.985 + 0.16; // gravity
      p.x += p.vx + Math.sin(p.age * 0.08 + p.phase) * 0.6; // flutter
      p.y += p.vy;
      p.rotation += p.spin;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(1, Math.cos(p.age * 0.1 + p.phase)); // 3D "flip" effect
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Drop particles that have fallen off the screen
    particles = particles.filter((p) => p.y < H + 30 && p.age < 600);

    if (particles.length || raining) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      ctx.clearRect(0, 0, W, H);
    }
  }

  global.Confetti = { burst, cannons, rain };
})(window);
