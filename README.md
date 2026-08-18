# Zen Folder Color Picker

Adds a **"Change Color…"** item to the right-click menu on sidebar folders in
Zen Browser, opening a panel with three independent color wheels — **icon
fill**, **icon outline**, and **label text** — plus a decimal-capable
outline thickness control and a screen-wide eyedropper on every wheel.

## How it works

- Zen's sidebar folders are `<zen-folder>` custom elements (an extension of
  Firefox's native tab-group element). Their label is wired to a context
  menu popup with `id="zenFolderActions"`.
- This mod listens for that popup opening, figures out which folder was
  right-clicked (`popup.triggerNode.closest("zen-folder")`), and injects a
  "Change Color…" menu item if one isn't already there.
- Clicking it opens a panel with:
  - a **Fill Color** wheel — recolors the folder icon's fill
  - an **Outline Color** wheel — recolors the folder icon's outline
  - a **Text Color** wheel — recolors the folder's label text,
    independently of the fill color
  - each of the three has its own "Enable ___" checkbox, its own **🎨
    eyedropper button** (see below), and its own small **Reset** button
    that snaps just that one wheel back to the folder's current native
    default color, without touching the other two wheels
  - an **Outline Thickness** control: a slider (0–8, in 0.1 steps) paired
    with a number field you can type an exact value into directly
    (including values above 8, and down to 0)
  - a **"Reset All"** button at the bottom clears every custom color for
    the folder at once (equivalent to never having customized it)

### Screen-wide color picker

Every wheel's 🎨 button lets you sample a color from **anywhere on your
screen**. Firefox generally doesn't expose the standard Web `EyeDropper`
API to chrome-privileged windows like `browser.xhtml` (only to regular web
content), even on an up-to-date build — so the button tries it first in
case that ever changes, then falls back to a hidden native
`<input type="color">`. Clicking that opens Firefox's own OS-native
color-picker dialog, and on Windows, macOS, and Linux that dialog has its
own built-in eyedropper/loupe tool that can sample any pixel anywhere on
your screen — same practical result, just routed through a mechanism that
actually works from this context. Whatever color you land on becomes that
wheel's color as soon as you pick it.

### Fill goes through Zen's own variable, not a flat override

Zen already gives every folder icon a background derived from a formula
roughly like:

```css
--zen-folder-behind-bgcolor: light-dark(
  color-mix(in srgb, var(--zen-primary-color) 60%, gray),
  color-mix(in srgb, var(--zen-primary-color) 60%, #c1c1c1)
);
```

i.e. it blends a base `--zen-primary-color` with gray (dark mode) or light
gray (light mode) to get the actual rendered icon color. This mod sets
**`--zen-primary-color`** itself and lets Zen's own CSS compute the final
blended color — so a custom fill color from the wheel gets the same
light/dark adaptive treatment as Zen's built-in preset colors, not a flat
override.

### Outline also goes through Zen's own formula, not a flat override

The outline works the same way, using Zen's own default formula for
`--zen-folder-stroke`:

```css
--zen-folder-stroke: light-dark(
  color-mix(in srgb, var(--zen-primary-color) 50%, black),
  color-mix(in srgb, var(--zen-colors-primary) 15%, #ebebeb)
);
```

i.e. Zen blends its base color toward black in dark mode, and toward a
near-white gray (`#ebebeb`) in light mode, so the outline stays visible in
both themes. When you enable a custom outline, the script substitutes your
chosen color into that exact same formula shape (on both the dark- and
light-mode branches) rather than writing a single flat color — so your
custom outline keeps that same light/dark blending Zen's own colors get.

### First time you open a folder's picker

If a folder has never been customized with this mod, all three wheels open
**enabled by default**, pre-filled with whatever Zen is *already* rendering
for that folder:
- Fill starts from the folder's current computed `--zen-primary-color`.
- Outline starts by reproducing the formula above (reading
  `--zen-primary-color` / `--zen-colors-primary` and computing the same
  color-mix blend in JS), so it matches Zen's actual default outline
  color rather than an approximation. If that can't be computed for some
  reason, it falls back to whatever's actually rendered on the icon, then
  to the folder's primary color as a last resort.
- Text starts from the label's current computed text color.

The per-wheel **Reset** buttons use this exact same live lookup — clicking
"Reset" on the Outline wheel, for example, redoes that same formula-based
calculation (and resets the stroke width to its current native value) and
snaps just that wheel back to it, whether or not you've saved anything yet.

So the picker starts by matching what you currently see, and you're
nudging it from there (or eyedropping an entirely different color) rather
than starting from an arbitrary placeholder.

Once you've applied a custom value for a folder, reopening the picker later
respects exactly what you saved, including any wheel you deliberately
switched off.

- The chosen values are stored in the hidden preference
  `extensions.zenfoldercolor.colors` as
  `{ "<folder id>": { "fill": "#rrggbb"|null, "outline": "#rrggbb"|null, "text": "#rrggbb"|null, "width": n } }`,
  and applied as CSS custom properties directly on the folder element:
  - `--zen-primary-color` — **Zen's own native variable**, drives the
    icon fill via Zen's own light/dark-aware blend formula (see above).
  - `--zen-folder-text-color` — our own variable, used by the bundled CSS
    to color the label text.
  - `--zen-folder-stroke` — **Zen's own native variable**, set to a CSS
    `light-dark(color-mix(...), color-mix(...))` expression built from
    your chosen outline color, reproducing Zen's own default formula
    shape instead of a flat override.
  - `--zen-folder-stroke-width` — our own variable (Zen doesn't expose a
    native width variable), used by the bundled CSS to set the icon's
    `stroke-width`.
- Colors are re-applied on browser start, session restore, and whenever new
  folders appear in the sidebar, so they persist across restarts as long as
  Zen keeps assigning the same folder its native id (which it does — that id
  is part of Firefox's own tab-group persistence).
- If you had colors saved from an earlier version of this mod, they're read
  fine — older formats are auto-migrated (missing `text` becomes `null`,
  a bare hex string becomes `{ fill: <hex>, outline: null, text: null,
  width: 2 }`) the first time they're read.

## Installing

This mod is built for **Sine** (a.k.a. Cosine, the in-development v2 of
Sine that adds broader Firefox-fork support) — the community mod manager for
Zen and other Firefox-based browsers.

1. Install Sine if you haven't already: https://github.com/CosmoCreeper/Sine
2. In Zen, open Sine's settings page (it injects into the settings UI).
3. Use the "add an unpublished mod" field and point it at the folder/repo
   containing these three files (`theme.json`,
   `zen-folder-color-picker.uc.js`, `zen-folder-color-picker.css`) — e.g.
   push this folder to a GitHub repo and paste `you/your-repo`.
4. Sine will install the script and stylesheet and restart the browser UI.

You can also install manually via `fx-autoconfig` by dropping the `.uc.js`
file into your profile's `chrome/JS/` folder and the `.css` rules into
`chrome/userChrome.css`, if you'd rather not use Sine.

## Notes / things that may need tweaking

- The exact formulas behind `--zen-folder-behind-bgcolor` and the default
  `--zen-folder-stroke` were read off computed styles/devtools rather than
  Zen's source, so the *precise* mix percentages/colors could differ
  slightly by Zen version. If a future Zen release changes them, the fill
  path is unaffected either way (we just feed `--zen-primary-color` into
  whatever Zen currently does with it), while the outline formula is
  hardcoded as a literal string in the script — update the `strokeExpr`
  line in `applyColor()` if Zen ever changes its percentages or blend
  colors.
- The outline-stroke CSS selectors (`.tab-group-folder-icon svg path`,
  etc.) are a best-effort match based on Zen's folder markup and could
  need adjusting on a different Zen version — use the Browser Toolbox
  (`Ctrl+Shift+Alt+I`) to check if something doesn't pick up.
- The eyedropper tries the standard `EyeDropper` Window API first, but
  that's typically unavailable in chrome-privileged windows regardless of
  Firefox version — the real path is the native OS color-picker dialog
  (via a hidden `<input type="color">`), whose own eyedropper/loupe tool
  does the actual screen-sampling. If a platform's native color dialog
  doesn't have an eyedropper of its own, this mod can't add one — that's
  an OS-level limitation, not something CSS/JS in the browser can work
  around.
- Only the folder's own icon fill/outline and label text are changed — this
  does not touch tab colors inside the folder, and it does not touch the
  label bar's background.
- If Zen ever renames the `zenFolderActions` popup id, the
  `--zen-primary-color` / `--zen-colors-primary` / `--zen-folder-stroke`
  variables, or the `zen-folder` tag, the affected part of this mod simply
  stops having an effect rather than throwing.
