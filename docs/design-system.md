# Ije

Ije means journey in Igbo. The product is a calm, well reasoned itinerary: day by day cards, each with a reason and a named source. This system is how it looks and sounds. It is the same source the app builds from: `frontend/src/styles/tokens.json` and `frontend/src/styles/components.css` in the Ije repository.

## Principles

1. **The canvas is the product.** The itinerary is the main surface; chat is a side channel that can be hidden. Never design a screen around a chat window.
2. **Calm over clever.** One action colour, generous space, soft shadows. Nothing glows, pulses or competes.
3. **Separate with tone, not lines.** Cards never have borders. They lift off `paper` with `surface` and `shadow-card`, or recede with `inset`.
4. **Legible for everyone.** Ije collects accessibility needs, so the interface must already meet them: hyperlegible text, 4.5:1 contrast, 48px touch targets, a visible focus ring.

## Content fundamentals

- **Voice:** a well travelled friend, not a brochure. Plain, warm, specific. "A quiet morning with the story of Lisbon tiles", not "Experience the magic of Lisbon!"
- **Every recommendation explains itself.** A card's reason ties the pick to the person ("Your love of art, at a slow pace"), and its source is named.
- **No em dashes anywhere in UI copy.** Use a colon, a comma or a new sentence.
- **Sentence case** for headings, buttons and labels. Capitals only in the `overline` style (slot names).
- **Say what happens with data.** Diet and access needs can be health information; every place that asks for them says why, and links the privacy policy.

## Visual foundations

### Colour

`paper` is the ground, `surface` raises, `inset` recedes. `ink` and `ink-muted` are the only text colours on those three. `primary` (Lagoon) is the single action colour: buttons, selected chips, links, focus rings, slider thumbs. `laterite` means local and appears only in small doses (the Local pick badge). `danger` is for errors and deleting an account, never for emphasis.

Colours that must be told apart also differ in lightness: the Local pick badge (`local-soft` with `on-local-soft`) and the Well known badge (`inset` with `ink`) read apart in greyscale.

Every text pair is 5.5:1 or more, most above 7:1, in both palettes.

**Ije is light only for now.** The app ignores the operating system's dark setting (`color.followSystem: false` in `tokens.json`). The dark palette is kept as a design record and applies only with an explicit `data-theme="dark"`, so it can return later as an opt-in.

### Type

- **Display: Newsreader** (Production Type, commissioned by Google Fonts). A screen first serif with optical sizes, so 48px headlines and 22px card titles each get the right contrast. Places, days and headings only: `display`, `heading`, `title`.
- **Text and UI: Atkinson Hyperlegible Next** (Applied Design Works with the Braille Institute). Drawn for low vision readers, with deliberately distinct letterforms. Everything you read as a sentence or act on: `body-lg`, `body`, `label`, `caption`, `overline`.
- Numbers use tabular figures so budgets and times line up.
- Both faces are OFL licensed and self-hosted. Ije never loads fonts from a third party at runtime.

Considered and set aside: Fraunces (its soft, wonky axes read playful, not calm) and Literata (an excellent reading face, but Ije's body copy is UI, and Newsreader's display cuts suit headings better).

### Space and shape

The 8px scale is the only scale: `space-8` to `space-64`. Cards use `radius-24`, inputs and panels `radius-16`, buttons and chips `radius-pill`. Controls are at least 48px tall (`space-48`).

### Elevation

`shadow-card` for every card on paper: soft and tight, never wide. `shadow-raised` for a small control sitting on `inset` (the selected segment). In the dark palette, tone does most of the work and shadows are nearly invisible by design.

## Iconography

Inline stroke icons at 16px or 24px, 2px stroke, round caps, drawn in `currentColor` so they take the text colour. No emoji. Icon only buttons always carry an `aria-label`. There is no logo yet: the wordmark is "Ije" set in Newsreader at weight 600.

## Using the components

The components are plain CSS classes over the tokens (`components/bundle.css`), so they work in React, server components and the PDF export alike. Use real elements: `<button>` for actions, `<a href>` for navigation, `<input>` with a `<label>`. Toggles (chips, segments) use `aria-pressed`, never a styled checkbox.
