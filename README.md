# Zen Folder Color Picker

Adds a **"Change Color…"** item to the right-click menu on sidebar folders in
Zen Browser, opening a panel with three independent color wheels — **icon
fill**, **icon outline**, and **label text** — plus a decimal-capable
outline thickness control.

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
  - each of the three has its own "Enable ___" checkbox **and its own
    small "Reset" button** next to the hex field, which snaps just that
    one wheel back to the folder's current native default color (read
    live off the folder when clicked) without touching the other two
    wheels
  - an **Outline Thickness** control: a slider (0–8, in 0.1 steps) paired
    with a number field you can type an exact value into directly
    (including values above 8, and down to 0)
  - a **"Reset All"** button at the bottom clears every custom color for
    the folder at once (equivalent to never having customized it)

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
gray (light mode) to get the actual rendered icon color. An earlier version
of this mod set its own `fill: ...` directly, which bypassed that formula
and gave a flat, un-blended color. This version instead sets
**`--zen-primary-color`** itself and lets Zen's own CSS compute the final
blended color — so a custom color from the wheel gets the same light/dark
adaptive treatment as Zen's built-in preset colors, not a flat override.

### First time you open a folder's picker

If a folder has never been customized with this mod, all three wheels open
**enabled by default**, pre-filled with whatever Zen is *already* rendering
for that folder:
- Fill starts from the folder's current computed `--zen-primary-color`.
- Outline starts from the icon's current computed stroke color — and if
  the folder has no colored stroke to read back (the common case, since
  most folders don't have a custom outline), it falls back to that same
  `--zen-primary-color` rather than an arbitrary fixed color, so it starts
  from a color that actually belongs to that folder.
- Text starts from the label's current computed text color.

The per-wheel **Reset** buttons use this exact same live lookup — clicking
"Reset" on the Outline wheel, for example, re-reads the folder's current
native stroke color (or its primary color, per the fallback above) and its
current stroke width, and snaps just that wheel back to it, whether or not
you've saved anything yet.

So the picker starts by matching what you currently see, and you're
nudging it from there rather than starting from an arbitrary placeholder.

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
  - `--zen-folder-stroke` — **Zen's own native variable.** Its built-in
    `zen-folders.css` already binds the folder icon's SVG stroke to this
    variable, so setting it is enough to recolor the icon's outline — no
    extra CSS rule needed on our end for the color itself.
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

- The exact formula behind `--zen-folder-behind-bgcolor` was read off your
  browser's computed styles rather than Zen's source, so the *precise*
  mix percentages/colors may differ slightly by Zen version — but since we
  don't reimplement the formula ourselves (we just feed
  `--zen-primary-color` into whatever Zen currently does with it), this
  mod stays correct even if Zen tweaks those exact numbers later.
- The outline-stroke CSS selectors (`.tab-group-folder-icon svg path`,
  etc.) are a best-effort match based on Zen's folder markup and could
  need adjusting on a different Zen version — use the Browser Toolbox
  (`Ctrl+Shift+Alt+I`) to check if something doesn't pick up.
- Only the folder's own icon fill/outline and label text are changed — this
  does not touch tab colors inside the folder, and it does not touch the
  label bar's background.
- If Zen ever renames the `zenFolderActions` popup id, the `--zen-primary-color`
  / `--zen-folder-stroke` variables, or the `zen-folder` tag, the affected
  part of this mod simply stops having an effect rather than throwing.
