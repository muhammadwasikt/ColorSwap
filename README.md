# Chromatic Shift

Chromatic Shift is a React/Next.js match-3 puzzle game designed as a mobile-first web game rather than a traditional website.

## Game systems

- 100 campaign levels with progressive difficulty and world themes
- Responsive 8x8 match-3 board sized from the actual viewport
- Tap or swipe-to-swap interaction
- Smooth swap, burst, falling and cascade animations
- Glossy 3D-style gem rendering using layered CSS
- Match-4 Line Gems
- Match-5 Color Bombs
- L/T intersection Wrapped Gems
- Special + Special combinations
- Ice and Chain blockers
- Move limits, score, combo feedback and three-star rewards
- Shuffle, Hammer and Color Bomb boosters
- Persistent local progress
- Daily Chromatic Trial with a deterministic daily board
- Web Audio feedback and haptic feedback where supported
- First-run tutorial
- No fake advertisements or simulated ad rewards

## Tech

- Next.js App Router
- React
- TypeScript
- CSS only for the visual system; no external UI framework required

## Run

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm start
```

## Monetization

Advertising is intentionally not included yet. A real ad provider can be integrated later with verified callbacks for any rewarded gameplay benefit.

## Save data

Campaign progress, stars, best scores, coins, boosters and daily challenge state are stored in browser localStorage under:

`chromatic-shift-next-v1`
