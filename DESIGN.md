---
name: OpenWay Landing
description: Freedom to move. The landing page at /landing/, a light map-first product canvas.
colors:
  canvas: "#F8F9F7"
  surface: "#FFFFFF"
  surface-soft: "#F1F4F2"
  ink: "#202124"
  ink-muted: "#5F6368"
  border: "#DADCE0"
  route-blue: "#1677FF"
  action-blue: "#0F63D8"
  action-blue-deep: "#0B54BD"
  route-blue-soft: "#E8F1FF"
  mobility-teal: "#167D78"
  success: "#137333"
  warning: "#A15C00"
  danger: "#B3261E"
  focus: "#0B57D0"
  marker-known: "#B54800"
  marker-possible: "#F2B01E"
  marker-positive: "#00795A"
  marker-info: "#6B7480"
  marker-report: "#6B3FA0"
typography:
  display:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.625rem, 1.9rem + 2.4vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.25rem, 1.85rem + 1.4vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  title-lg:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 1.5rem + 0.9vw, 2.25rem)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  statement:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.5rem, 1.2rem + 1.1vw, 2.125rem)"
    fontWeight: 500
    lineHeight: 1.32
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  lead:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.125rem, 1.05rem + 0.3vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.2
  caption:
    fontFamily: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "28px"
  pill: "999px"
spacing:
  gutter-mobile: "20px"
  gutter-tablet: "32px"
  gutter-desktop: "56px"
  grid-gap: "32px"
  section: "clamp(72px, 10vw, 136px)"
  container-max: "1280px"
  header-height: "60px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-soft}"
  button-small:
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 4px 4px 16px"
    height: "56px"
  nav-link:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "44px"
  scenario-option:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  scenario-option-selected:
    backgroundColor: "{colors.route-blue-soft}"
  hero-panel:
    rounded: "{rounded.xl}"
    padding: "40px 40px 36px"
  route-card:
    rounded: "{rounded.lg}"
    padding: "20px"
    width: "300px"
  demo-stage:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
---

# Design System: OpenWay Landing

Scope: this file documents the landing page at `/landing/` (`landing/index.html`, `src/landing/landing.css`, `src/landing/*.tsx`, plus the shared `src/markers.css`). The app at `/` is a separate surface with its own incumbent system in `src/styles.css` (Atkinson Hyperlegible Next, dark mode, `#0a66d8`); it is not described here and these rules do not apply to it. The user-supplied visual specification is `design_system.md` (OpenWay Design System v1.0); this file records what was built from it, including where the build departs.

## Overview

**Creative North Star: "The Map at Work"**

The landing is a cartographic product canvas, not a marketing page. The first viewport is a full-bleed, desaturated map of Pisa carrying a real route, with its attention points numbered exactly as in the app. Everything the page says sits on that map in light glass panels, then the page continues as a bright, editorial sequence of solid surfaces on a warm off-white canvas.

The world is daylight: pages are read outdoors, before leaving. Density is calm, with generous section spacing and asymmetric 12-column compositions (a sticky title on the left, content on the right). Colour is almost entirely ink on white; blue belongs to the route and to the one action that matters. The data vocabulary (marker shapes and colours, numbered route points, endpoints) is shared with the app so a person who learned the landing can read the app.

**Key Characteristics:**
- Map first: the hero is a live Leaflet map with grayscale tiles, not an illustration.
- Glass only over the map; solid surfaces everywhere else.
- One family, Atkinson Hyperlegible Next, for every role.
- Pill geometry for everything you press or type into; rounded rectangles for containers.
- State is never colour alone: Okabe-Ito marker colours always paired with shape, icon or text.

## Colors

A near-neutral daylight palette where blue is spent on the route and the primary action, and the only other saturated colours are data states.

### Primary
- **Route Blue** (route-blue): the route line on the map, the active dot in the features index, spinner accent, input caret, legend swatch. A graphic colour, never a text or button-fill colour.
- **Action Blue** (action-blue): fill of primary buttons, the destination pin, link text, the selected scenario border. Deliberate deviation from `design_system.md`, which puts CTAs on Route Blue: white on Route Blue measures 4.1:1, below AA, so buttons moved to Action Blue (white on it passes AA) and Route Blue stays the route colour.
- **Action Blue Deep** (action-blue-deep): hover fill of primary buttons.
- **Route Blue Soft** (route-blue-soft): selected scenario background, active search result, closing section band.

### Secondary
- **Mobility Teal** (mobility-teal): a quiet secondary accent, used for the bullet dots of the "limits" list. Never the only signal of a state.

### Tertiary
- **Data states**: success (calm verdict icon), warning (attention verdict icon), danger (errors, search status), and the shared marker set from the app: marker-known (known obstacle, rounded square), marker-possible (possible issue, diamond), marker-positive (useful element, circle), marker-info (neutral info, outlined circle), marker-report (user report, teardrop pin). Each colour is bound to a shape in `src/markers.css`.

### Neutral
- **Daylight Canvas** (canvas): page background and the hero background on narrow screens.
- **Paper White** (surface): solid panels, features and footer sections, buttons, search field.
- **Soft Sage** (surface-soft): alternate band (benefits), screenshot frames, secondary button hover.
- **Ink** (ink): all primary text, nav links, headings.
- **Muted Ink** (ink-muted): secondary text, captions, lead copy, attributions. Lead copy inside the hero panel darkens further to `#4A4F55` for legibility over glass.
- **Hairline** (border): dividers, field and card strokes, list rules.
- **Focus Blue** (focus): the 3px focus outline and the search field focus ring.

### Named Rules
**The Two Blues Rule.** Route Blue draws the route; Action Blue carries white text. Never put white text on Route Blue.

**The Shape-and-Colour Rule.** Every data state pairs its colour with a shape, icon or word. A marker's colour is never its only meaning.

## Typography

**Display Font:** Atkinson Hyperlegible Next (with Atkinson Hyperlegible, system sans fallback)
**Body Font:** the same family
**Label/Mono Font:** the same family; numbers use `tabular-nums` where they align (verdict meta, alert distances)

**Character:** a single legibility-first humanist sans, set tight and heavy in headings (negative tracking, balanced wrapping) and open in body copy. `design_system.md` suggests Inter; the build follows PRODUCT.md's accessibility commitment to Atkinson Hyperlegible Next, which the spec permits when a family is already established.

### Hierarchy
- **Display** (700, 42 to 64px fluid, 1.04): hero headline, benefits title, closing title.
- **Headline** (700, 36 to 48px fluid, 1.08): section titles (problem, how it works, demo, project).
- **Title Large** (650, 28 to 36px fluid, 1.12): feature titles in the how-it-works list.
- **Statement** (500, 24 to 34px fluid, 1.32): the single large argument paragraph in the problem section.
- **Title** (650, 20px, 1.25): point, benefit and fact-group titles.
- **Lead** (400, 18 to 20px fluid, 1.55, max 58ch, muted): section intros.
- **Body** (400, 16px, 1.6): running text; secondary paragraphs capped at 56 to 60ch.
- **Label** (600, 16px, 1.2): buttons, field labels, links. Small buttons drop to 15px.
- **Caption** (400, 13px, 1.5, muted): sources, screenshot captions, footer credits.

### Named Rules
**The One Family Rule.** Every role is Atkinson Hyperlegible Next; hierarchy comes from size, weight and tracking, never from a second face.

**The No Small Caps Rule.** No uppercase labels or tracked-out kickers above headings; a section opens directly on its heading.

## Layout

A centred container of 1280px plus side gutters (20px mobile, 32px from 768px, 56px from 1200px). Sections use a 12-column grid with 32px gaps and fluid vertical spacing (72 to 136px; the closing band 80 to 152px). Compositions are asymmetric: a title in columns 1 to 5 (often sticky below the header) against content in columns 7 to 12, or a sticky index in columns 1 to 4 against a long list in 6 to 12. Bands alternate canvas, white, soft sage and a soft-blue closing band for rhythm without boxing every section.

The hero is the viewport (100svh, 720 to 1100px): the map fills it and a layer aligned to the container holds the glass panel (left, up to 580px or 46%) and the route card (right, 300px). Map controls sit bottom right, aligned to the container edge.

Responsive behaviour: below 1100px the hero becomes a stacked map (58svh) with the panel and card overlapping its bottom edge on a two-column grid, solid rather than glass for the card; sticky columns release and all grids go single column. Below 900px the nav collapses behind a menu button into a dropdown sheet. Below 768px the hero map shrinks to 52svh, panels stack in one column, buttons in an action row grow to share the width, and the demo stage stacks map over result.

**The Map Owns the Viewport Rule.** "Esplora la mappa" collapses the hero panel to its search field and hides the route card, handing the whole first viewport to the map; on narrow screens the map grows to 82svh.

## Elevation & Depth

Depth is soft and functional: shadows separate floating layers from the map and lift the demo stage and screenshots off the canvas, never decorate. Glass panels combine a translucent white fill (86% opacity), a 16px backdrop blur with 140% saturation, a white hairline border and an inset 1px ink hairline plus the panel shadow. Where backdrop-filter is unsupported or reduced transparency is requested, glass falls back to solid white.

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 4px 16px rgba(32, 33, 36, 0.06)`): solid header after scroll, demo stage, route card on narrow screens.
- **Panel** (`box-shadow: 0 8px 32px rgba(32, 33, 36, 0.10)`): glass panels, screenshot frames.
- **Float** (`box-shadow: 0 12px 40px rgba(32, 33, 36, 0.12)`): the mobile nav sheet.
- **Action** (`box-shadow: 0 2px 8px rgba(15, 99, 216, 0.24)`): primary buttons only.
- **Marker** (`box-shadow: 0 1px 2px rgba(0,0,0,0.28), 0 3px 8px rgba(0,0,0,0.14)`): map markers and numbered route points, shared with the app.

### Named Rules
**The Glass Over Map Rule.** Liquid Glass is reserved for elements floating over the map (header bar, hero panel, route card, map controls, explore bar). Every other surface is solid.

## Shapes

Two geometries. Anything pressed or typed into is a full pill (999px): buttons, search field, nav links, menu button, header bar, map control column, explore bar. Containers are rounded rectangles scaled to their size: 12px for scenario options and result rows, 20px for the route card, screenshots and mobile nav sheet, 28px for the hero panel and demo stage (24px on mobile). Strokes are 1px hairlines; dividers between list items are top rules rather than boxes. Map markers keep their own shape language (rounded square, diamond, circle, teardrop, numbered circle) from the shared marker sheet.

## Components

### Buttons
Confident and quiet: solid pill, short label, width from text.
- **Shape:** full pill (999px), 48px tall, 22px side padding; small variant 44px tall, 18px padding, 15px text.
- **Primary:** Action Blue fill, white 16px semibold label, Action shadow.
- **Hover / Focus:** fill deepens to Action Blue Deep over 180ms; press scales to 0.98; focus is the global 3px Focus Blue outline offset 3px. Disabled shows a progress cursor at 70% opacity.
- **Secondary:** white fill, ink label, hairline border; hover darkens the border to `#AEB3B8` and fills Soft Sage.
- **Text link:** Action Blue, semibold, 44px hit area, underline on hover.

### Inputs / Fields
- **Style:** the search field is a 56px white pill with a hairline border, a muted search icon, a 17px input and the submit button nested inside on the right. A visible semibold label sits above it.
- **Focus:** border turns Focus Blue with a 3px 18% Focus Blue halo; the input itself shows no outline.
- **Error:** status text in danger red below the field. Results appear as a scrolling list of 48px rows (12px radius), active row on Route Blue Soft.

### Chips / Choice cards (scenario picker)
- **Style:** white 12px-radius cards with a hairline border, semibold name over a muted hint.
- **State:** selected cards fill Route Blue Soft with a 2px Action Blue edge; keyboard focus draws the global outline around the card.

### Navigation
- **Style:** a floating glass pill header (60px, 16px from the top) with logo, centred links and a small primary CTA; it turns solid white with the Soft shadow after scroll. Links are 44px pills with a 6% ink hover wash.
- **Mobile:** below 900px links move into a white dropdown sheet (20px radius, Float shadow) behind a menu button; below 768px the menu button becomes a 44px icon-only circle with a visually hidden label.

### Hero panel and route card (signature)
The glass hero panel holds the headline, lead, labelled search and the two actions; in explore mode its intro and actions collapse with a grid-row transition (320ms). The route card states the example route, a verdict with a coloured status icon and tabular meta, and a legend that reuses the real map vocabulary (route swatch, dashed swatch for stretches without sidewalk, numbered point, inline markers), closed by a data caveat.

### Demo stage
A white 28px-radius stage split into a live map and a result column (hairline divider), listing numbered alerts with tabular distances and a primary button to open the app. Stacks map over result on mobile.

### The Living Line (hero signature)
The hero route is drawn by `LivingLine` (src/landing/LivingLine.tsx): Leaflet SVG polylines with `pathLength=1` animated through stroke-dashoffset, so the line stays aligned while zooming and panning. A start marker and a white-ringed blue head appear, the head travels along the real route geometry, at the fork with the most real OSM streets (`bestFork`, src/landing/livingLine.ts) 2–3 lighter branches open, slow and fade, the line reaches B, holds about 1.7 s, dissolves and loops (about 8 s per cycle). Branches are real street geometry but only animation, and the route card says so. Dragging, keyboard panning, double click or the zoom buttons stop it and show the static route, with a "Riproduci l'animazione" link; explore mode, a chosen search result and reduced motion also keep it static. It pauses off-screen and in hidden tabs.

### Blue depth (palette pass, 25/10/2026)
Ice, Soft Blue, Sky (from the logo's #1FB5FE) and Deep Blue tokens drive the depth: glass panels carry a faint ice-to-sky reflection and a Soft Blue hairline; a multiply halo tints the hero map's periphery; the opening's paper glows ice at the centre. Sections alternate warm canvas, white-to-ice and solid ice; statements are set in Deep Blue; the figures band runs Soft Blue to Ice with Deep numerals; the closing is a Deep-to-Mid-Blue gradient with white type and a white primary button. Blue stays reserved for actions, the route and emphasis.

### Opening (signature, inspired by apple.com/maps)
The word "OpenWay" (Atkinson 700) is cut out of a canvas-coloured sheet as an SVG mask over the live map, which shows through the letters tinted Route Blue (a multiply layer outside the overlay, so it blends with the map). On wide screens the hero pins for 90% of a viewport: the payoff fades, the sheet scales ×9 and fades, then panel, route card and controls rise in. Below 1100px there is no pin; the word sits on two lines over the map block and dissolves as it scrolls. Hidden without motion: content never depends on it, and focus inside the hero jumps past it.

### Drop pins and statements
84px Action Blue circles with a rotated-square tail and a 10px dot with a Primary Soft halo, carrying one line icon. Paired with two-line, centred statements (36–80px, 700). On entry the pin drops with a back-out ease, the dot pops, the lines rise from blur. Reused for the closing.

### Feature bento
A 12-column grid with dense flow: 7+5 and 5+7 spans, 28px radius cards tinted Primary Soft, warm #FFF3DF, teal #E3F1EF and Surface Soft. Each card carries a small rebuilt app interface (layer chips, report card, route verdict, dictation) with the app's real copy and states, captioned as rebuilt. Motion springs: cards lift 6px on hover, inner items stagger in from blur, and start complete under reduced motion.

### Section rail (inspired by applied-imagination)
From 1440px, a fixed left rail drawn as a route: 2px line that fills in Route Blue with reading progress and a stop per section (44px targets, label on hover or focus). Shown only between the first and last section.

### Inline pin in headings
A Primary Soft pill holding one icon inside a heading line ("Non tutte le strade [pin] sono…"), aria-hidden.

### FAQ
Native details/summary rows with hairlines, 64px rows, a rotating chevron; answers in muted ink at 62ch.

## Do's and Don'ts

### Do:
- **Do** put white text only on Action Blue (#0F63D8) or darker; keep Route Blue (#1677FF) for the route and graphic accents.
- **Do** reserve glass for layers floating over the map, with the solid-white fallback for no backdrop-filter and reduced transparency.
- **Do** reuse the shared marker sheet (`src/markers.css`) for any data state, so landing and app speak the same visual language.
- **Do** keep every interactive target at 44px or taller (48px for primary buttons and result rows).
- **Do** use the global 3px Focus Blue outline for keyboard focus and honour reduced motion.
- **Do** cap secondary text at 56 to 60ch and lead text at 58ch.

### Don't:
- **Don't** put white text on Route Blue (#1677FF); it measures 4.1:1.
- **Don't** spread glass onto solid page sections; `design_system.md` names it a selective treatment.
- **Don't** convey a state by colour alone; pair it with shape, icon or text.
- **Don't** add a second typeface.
- **Don't** add uppercase kickers or eyebrows above headings.
- **Don't** let map tiles compete with data: tiles stay grayscale (82%) and slightly lowered in contrast.
