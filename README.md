# 🎂 Олю, з Днем народження!

A small birthday gift website for Olya: a greeting card with our photo, and a game where she catches falling money.

## How to run

Double-click `index.html`. It opens in any modern browser. No install, no backend.

(Or serve the folder, e.g. `python3 -m http.server`, then open http://localhost:8000.)

## The flow

1. **Greeting**: our photo in a polaroid frame, the Ukrainian birthday wish, and the "Почати гру 🎮" button.
2. **Game**: a little girl in a party hat runs along the bottom and catches falling money.
3. **Final screen**: "Олю, ти назбирала $X! 💰🎉", the birthday wish, and "Зіграти ще раз 🎮".

## The game

| Money | Value |
|-------|-------|
| 🪙 Coin | $10 |
| 💵 Banknote | $100 |
| 💰 Money bag | $500 |

A round lasts 60 seconds. Over time money falls faster, appears more often, and money bags show up more.
Missed money fades away on the ground (no penalty).

**Controls:** ← → or A / D to run · P / Esc to pause.
On phones: hold the ◀ ▶ buttons, or drag a finger across the game.

## Files

- `index.html`: the three screens (greeting → game → final message)
- `css/style.css`: design, animations, responsive layout
- `js/confetti.js`: confetti effects
- `js/game.js`: game engine (character, falling money, difficulty, drawing)
- `js/main.js`: screen flow, controls, sound, final screen

To tweak: round length is `GAME_DURATION` and money values are `MONEY` at the top of `js/game.js`.
The photo is in `photos/`.
