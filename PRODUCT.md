# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- People who move in a wheelchair in Pisa (university area), and the people who accompany them, planning a route before leaving or while moving.
- People evaluating the prototype: hackathon jury, local bodies, potential partners. They need to understand method, data sources and limits.

The landing page speaks to both (confirmed 2026-10-25).

## Product Purpose

OpenWay ("Freedom to move.") computes a wheelchair route in Pisa, compares it with OpenStreetMap accessibility data and user reports, and says clearly what is known, what is only probable and what is missing. Success: a person understands a route before leaving, and contributes reports that improve the data for others.

## Positioning

OpenWay never declares a route "accessible" or "safe". It shows what the data can verify, numbers the attention points in the order they are met, flags stretches without a mapped sidewalk, and recalculates when a blocking report lands on the active route.

## Operating Context

- Web app (Vite + React + Leaflet) with a Node API in the same repository; landing page lives at `/landing/`, the app stays at `/` (demo links `/?from=…&to=…`).
- Used with map, touch or voice (ElevenLabs dictation and turn-by-turn voice guidance, HTTPS only).
- Free public services: Valhalla and OSRM (FOSSGIS), Nominatim, OpenStreetMap tiles; Gemma 4 for reading reports.

## Capabilities and Constraints

- Wheelchair routing (Valhalla `wheelchair`, ORS optional), up to 3 alternatives checked segment by segment.
- Attention points: OSM known obstacles, user reports, road stretches without sidewalk.
- Comparison with the walking route.
- Reports: point on map or GPS, text, optional photo; Gemma proposes type and asks a follow-up; reporter confirms. Every report starts "da controllare"; only a moderator marks it checked or resolved.
- Automatic reroute when a blocking report is on the active route, verified on geometry.
- Voice: dictation of start, destination and report text; voice guidance reads real routing instructions. No full voice commands yet.
- Coverage: Pisa, university area only. OSM snapshot of 24/10/2026, 1158 elements.
- Language: Italian (confirmed 2026-10-25). All landing copy centralised for localisation.

## Brand Commitments

- Name OpenWay, payoff "Freedom to move." Formerly AccessGo (old repo and `cloud/` edition keep the old name).
- Logo: `public/logo.png`.
- Wording rules: never "accessibile" or "sicuro"; use "nei dati disponibili", "da controllare", "non verificabile".
- Landing visual specification: `design_system.md` (OpenWay Design System v1.0).

## Evidence on Hand

- README demo scenarios (verified 24/10/2026, obstacles from OSM, not checked on site).
- OSM snapshot `server/data/osm-pisa.json`: 55 known obstacles, 398 possible issues, 105 useful elements.
- 136 Vitest tests.
- No testimonials, partners, user numbers, team names or contact details exist. Do not invent them.

## Product Principles

1. Say what is known, what is probable, what is missing.
2. Every fallback is declared.
3. Coordinates come from the map, never from text; the AI never marks anything verified.
4. Voice and text never trigger an irreversible action on their own.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Atkinson Hyperlegible Next as typeface. Marker colours from Okabe-Ito, every state also has shape, icon or text. Visible keyboard focus, reduced motion respected, no autoplay audio.
