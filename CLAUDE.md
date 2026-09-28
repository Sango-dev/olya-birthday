# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static birthday-gift website for Olya: a greeting card (photo + wishes), then a 60-second game where a little girl character catches falling money, then a final screen with the total. All user-facing text is in **Ukrainian**; keep new UI copy in Ukrainian.

## Running

There is no build, no package manager, no tests, no linter. Plain HTML/CSS/vanilla JS.

- Open `index.html` directly in a browser, or
- `python3 -m http.server` and visit http://localhost:8000

Scripts are classic `<script>` tags (not ES modules), loaded in order: `js/confetti.js` → `js/game.js` → `js/main.js`. Each file is an IIFE that publishes one global; keep it that way so `file://` opening keeps working.

## Architecture

- **`js/game.js`: `window.MoneyGame`**. A canvas game engine that knows nothing about the DOM outside its canvas. It reports out only through the callbacks `onUpdate(state)`, `onCatch(info)`, `onGameOver(stats)`, and takes input via `setKey(dir, pressed)`, `setTouchDir(dir)`, `setPointerX(x)`, `togglePause(force)`, `start()`, `stop()`, `resize(w, h)`. Tuning constants live at the top: `GAME_DURATION` (seconds) and `MONEY` (emoji, $ value, sprite size). Difficulty is `elapsed / GAME_DURATION` (0..1) and drives fall speed, spawn rate, and the coin/cash/bag weights in `pickMoneyType`. Money emojis are pre-rendered to offscreen sprite canvases in `resize()`. The character is drawn procedurally (`drawPlayer`), not an image. Canvas is DPR-scaled (capped at 2); game coordinates are CSS pixels.
- **`js/main.js`: the glue**. Owns the screen flow (`showScreen('greeting' | 'game' | 'final')` toggles `.active` on the `<section>`s and sets `body[data-screen]`), HUD updates, keyboard/touch/pointer-drag input mapping, WebAudio-synthesized sound effects (`Sound`, no audio files), the looping "Happy Birthday" music-box melody (`Music`: starts when the gift photo is unwrapped, stops during the game, resumes on the final screen; toggled by the floating `#music-btn`), the final-screen count-up, and `fitGame()` which sizes the canvas to `#game-frame`. It auto-pauses when the tab is hidden. Persists to `localStorage` under `olya-best` (high score), `olya-sound` and `olya-music`, always through the non-throwing `store` wrapper. `window.__olya` exposes `{ game, startGame, showFinal, Music }` for poking at things from the devtools console.
- **`js/confetti.js`: `window.Confetti`**. A full-screen overlay canvas with `burst()`, `cannons()`, `rain(on)`; respects `prefers-reduced-motion`.
- **`index.html`** holds all three screens plus the game overlays (pause, time-up) and the touch ◀ ▶ controls; element IDs are what `main.js` binds to.
- **`css/style.css`** does layout, animations, and the responsive/mobile layout.

The main photo is referenced by its URL-encoded filename (`photos/photo_2026-09-26%2010.09.32.jpeg`) on the greeting screen; the final screen shows a separate portrait photo (`photos/photo_2026-09-28%2017.28.30.jpeg`). The extra photos live in the `.memories` strip under the greeting (each a `<figure class="memory">` with a handwritten title, cropped to 3:4); like the main photo, each is gift-wrapped (`.photo-reveal.is-hidden` + `.photo-cover`) until tapped, and only the main one starts the music.
