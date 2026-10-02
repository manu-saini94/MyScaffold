# Build plan: Phases 4 to 8

Phases 0-3 are done (scaffold, Google import, content + viewer auth, unlock + "Who's here?" + real `/api/experience`).
The owner asked for phases 4-7 (then ship) in one run, with this visual direction. Every agent reads this file first.

## Visual direction (owner, 2026-10-02) — overrides earlier theme notes where they conflict

- **Rose theme background: pure white** (`#ffffff`), no cream. Roses gather in **clusters at the top and the bottom**
  of the page (more of them than today), line-art red roses with green stems, gently swaying.
- **All text: dark, sparkly gold.** Base colour dark gold that passes WCAG AA on white (about `#7a5a12`, at least
  4.5:1 for body text); display text uses an animated gold gradient (`#6b4e0e -> #c9a227 -> #f4e3a1 -> #8a6a14`)
  with a slow shimmer sweep and tiny glints. Body text stays readable (solid dark gold, no shimmer). Cinema theme
  keeps its dark background and uses a brighter gold for text.
- **Home: round world icons scattered across the whole page** (not a compact cluster). Each icon shows **one photo
  from inside that world** (cover, else first preview, via `/api/media/{id}/thumb`, LQIP blur-up first). Locked
  worlds are frosted with a live countdown. Layout is deterministic per world set (seeded by slug), never overlapping,
  responsive (phone: fewer columns, still scattered), with gentle floating motion.
- **Click anywhere:** small hearts pop out around the click point and drift up and fade.
- **"Anvi ❤ Manu" title:** more vibrant (animated rose-to-gold gradient, beating heart). Clicking near it plays a
  *different* effect from the global hearts (for example a golden sparkle burst with a few rose petals).
- **Gradients, transitions and animation wherever they help**: page transitions, hover lifts, shimmer, staggered
  entrances. Only animate transform, opacity, clip-path and filter. Honour reduced motion (fades instead).

## Phase map and owners

| Wave | Work | Owns (paths under frontend/src unless noted) |
|---|---|---|
| A1 | Phase 4: home + visual overhaul (themes, gold text, rose clusters, scattered photo orbs, click hearts, title effect, progress rings) | styles/**, components/Rose/**, components/Particles/**, components/ClickEffects/** (new), app/Header*, app/Shell.tsx, features/launcher/** |
| A2 | Phase 5 foundation: world shell (fetch, locked teaser, intro card, lazy layout, outro, next chapter, progress), media helpers, lightbox | features/world/**, worlds/registry.ts, worlds/types.ts, worlds/_placeholder/**, components/ProgressiveImage/**, components/Lightbox/**, services/media.ts |
| A3 | Phase 6: admin UI at /admin + backend dev-page removal | features/admin/**, services/adminApi.ts, app/router.tsx (add /admin only), backend (dev page, post-login-url) |
| B1-B3 | Phase 5 layouts, two each | worlds/<Layout>/** only |
| C1 | Phase 7: story mode (/story) + optional music | features/story/**, router (add /story), launcher "Play our story" entry |
| C2 | Phase 7: letters (wax seal) + easter eggs | features/letters/**, features/easter-eggs/**, hooks in world shell |
| D | Review (Legolas, Boromir), browser verify (Pippin, mocked API), Phase 8 ship (Sam) | read-only / ops files |

## Contracts

- Media: `mediaUrl(mediaId, size: 'thumb' | 'medium' | 'full')` in `services/media.ts` -> `/api/media/{id}/{size}`.
- Layout component: default export of `worlds/<Layout>/index.tsx`, props
  `{ world: OpenWorldDetail; onFinished: () => void; onOpenPhoto: (index: number) => void }`
  (types in `worlds/types.ts`). The shell owns intro, outro, letters, lightbox, progress and "Next chapter".
- Layout keys: `POLAROID_TABLE -> PolaroidTable`, `FILM_STRIP -> FilmStrip`, `POSTCARDS -> Postcards`,
  `MEMORY_WALL -> MemoryWall`, `ENVELOPE -> Envelope`, `CONSTELLATION -> Constellation`. Each is its own lazy chunk.
- Progress: `localStorage['our-story-progress']` = `{ [slug]: number 0..1 }`, written by the shell, read by the home
  orbs (progress ring). Wrap storage access in try/catch.
- Shared element: the home orb and the world shell share `layoutId` `world-${slug}` (keep the existing contract).
- Letters: bodies are RAW markdown; render with `react-markdown` (no raw HTML, no `rehype-raw`).

## Dependencies added for these phases (all checked 2026-10-02, `npm audit --omit=dev`: 0 vulnerabilities)

yet-another-react-lightbox 3.32.2 (lightbox), react-markdown 10.1.0 (safe letters), canvas-confetti 1.9.4 (envelope
burst), @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10.0.0 + @dnd-kit/utilities 3.2.2 (admin ordering; stable line chosen
over the pre-1.0 @dnd-kit/react), uqr 0.1.3 (QR code, tiny, no deps). Agents do not add others without a one-line
justification in docs/decisions.md.

## Rules for every agent

- Never write the real unlock answer anywhere; tests use the dummy "Sample".
- Never read `.env` or credential files.
- Use `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` to locate code before reading broadly.
- Stay inside your owned paths; report anything you need outside them instead of editing it.
- Verify for real (tsc, eslint, vitest for your files) and paste the output. Do not commit; the orchestrator commits.
- Budget: initial JS stays small; every layout, admin, lightbox, story mode and confetti is lazy-loaded.
