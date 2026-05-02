# Particle Accelerator

You are the sample, hurtling through the collider. Dodge contamination, amplify your lab tech, hold to the readout. A BioKEA game.

> **Status:** private beta. Public release pending.

![Particle Accelerator gameplay](docs/screenshot.png)
<!-- TODO: drop a real screenshot or gif at docs/screenshot.png before going public -->

## The science angle

The arena is a collider chamber and you're the sample being run through it. Weapons are real lab kit — PCR for amplification, centrifuge for control, CRISPR for precision edits, antibody for targeting — and upgrades branch into three lineages (Amplify / Contain / Edit) that mirror how working biologists actually compose a protocol. It's a bullet-heaven survival run with the vocabulary of a wet lab, part of [BioKEA](https://biokea.ai)'s effort to make modern biology feel native to anyone who can dodge.

## Play

- **Normal run** — single 8-minute survival, ending in a prion-boss readout.
- **Daily** — one seeded run per day, share the result.
- **Boss Arena** — unlocked after your first win; pick a boss and chase a best time.
- **Endless** — survive as long as you can; the run records your longest readout.

### Controls

- **Move** — WASD or arrow keys.
- **Fire** — automatic, targets the nearest contaminant.
- **Level-up pick** — `1`, `2`, or `3` (or click the card).
- **Mute** — corner toggle.

## Tech

- React 18 + TypeScript + Vite
- Custom 2D canvas engine (no game framework — `update`/`render` loop in `src/game/`)
- Tailwind + Radix UI primitives
- LocalStorage for all meta progression — no backend, no accounts
- Bun as package manager

## Local dev

```bash
bun install
bun run dev      # http://localhost:3000
bun run build    # type-check + production build into dist/
```

No environment variables required — the game runs fully client-side.

## License

MIT — see [LICENSE](LICENSE).

---

Made by [BioKEA](https://biokea.ai).
