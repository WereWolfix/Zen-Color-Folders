# Zen Folder Color Picker

Adds a **"Change Color…"** item to the right-click menu on sidebar folders in
Zen Browser, opening a panel with three independent color wheels — **icon
fill**, **icon outline**, and **label text** — plus a decimal-capable
outline thickness control and a full-screen eyedropper with a live preview
on every wheel.

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

### The eyedropper works on your whole screen, with a live preview

Every wheel's 🎨 button is a real eyedropper: click it, move your cursor
anywhere — including over other applications, not just the browser — and
a small magnifier follows your cursor showing the color under it as a hex
code, live-updating that wheel's preview swatch and hex field as you move.
Click to commit to that pixel, or press <kbd>Esc</kbd> to cancel (which
restores whatever color the wheel had before you started picking).

To reach pixels outside the browser window, this uses Firefox's own
screen-sharing capture path (`getUserMedia({video: {mediaSource:
"screen"}})`) — the same mechanism behind "Share Screen". **The first
time you use it, Firefox will show its native "choose what to share"
dialog** — pick **Entire Screen** and allow it. That grants a live video
feed of your whole display, which gets drawn into a temporary, borderless,
full-screen overlay window so you can click any pixel on it — including
ones belonging to other applications, since you're literally clicking on
a live mirror of your screen. The overlay and the underlying capture are
torn down as soon as you pick a color or cancel.

If screen capture isn't available or you decline the prompt, the
eyedropper automatically falls back to the previous, more limited method —
sampling only pixels within the current browser window itself via the
chrome-only `drawWindow()` method — so the button still does *something*
useful either way, it just won't be able to reach outside the browser in
that case.

**Known caveats:**
- Multi-monitor setups: the overlay is currently sized to your *primary*
  display (`window.screen.width/height`), so on a multi-monitor setup it
  may not cover secondary displays. Let me know if you want that
  extended — it needs enumerating all screens and unioning their bounds,
  which I kept out for now to keep the implementation simpler.
- You'll see Firefox's screen-share picker each time you use the
  eyedropper (there's no way to skip that prompt — it's part of Firefox's
  permission model, not something this mod controls).
- The overlay briefly shows a live mirror of your screen rendered inside
  it — moving your cursor over that mirror is what the magnifier is
  reading from, so there's a very slight (one-frame) lag between the real
  cursor position and what the magnifier reflects, same as any live video
  feed.

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

### Outline is a direct, flat override

Unlike fill, the outline is applied as a plain flat color: the script sets
`--zen-folder-stroke` directly to whatever hex you pick. Zen's own
`zen-folders.css` already binds the folder icon's SVG stroke to that
variable, so no extra CSS rule is needed here for the color itself —
just the variable.

(An earlier version of this mod tried reproducing Zen's own
`light-dark(color-mix(...))` formula for the outline's default too, the
same way fill does. That's been reverted back to the simpler flat
override on request.)

### First time you open a folder's picker

If a folder has never been customized with this mod, all three wheels open
**enabled by default**, pre-filled with whatever Zen is *already* rendering
for that folder:
- Fill starts from the folder's current computed `--zen-primary-color`.
- Outline starts from the icon's current computed stroke color — and if
  the folder has no colored stroke to read back (the common case, since
  most folders don't have a custom outline), it falls back to that same
  `--zen-primary-color` rather than an arbitrary fixed color.
- Text starts from the label's current computed text color.

The per-wheel **Reset** buttons use this exact same live lookup — clicking
"Reset" on the Outline wheel, for example, re-reads the folder's current
native stroke color (or its primary color, per the fallback above) and its
current stroke width, and snaps just that wheel back to it, whether or not
you've saved anything yet.

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
  - `--zen-folder-stroke` — **Zen's own native variable**, set directly to
    your chosen outline color.
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

- The exact formula behind `--zen-folder-behind-bgcolor` was read off
  computed styles rather than Zen's source, so the *precise* mix
  percentages/colors could differ slightly by Zen version — but since the
  script doesn't reimplement that formula itself (it just feeds
  `--zen-primary-color` into whatever Zen currently does with it), the
  fill behavior stays correct even if Zen tweaks those numbers later.
- The outline-stroke CSS selectors (`.tab-group-folder-icon svg path`,
  etc.) are a best-effort match based on Zen's folder markup and could
  need adjusting on a different Zen version — use the Browser Toolbox
  (`Ctrl+Shift+Alt+I`) to check if something doesn't pick up.
- The eyedropper's full-screen mode needs the `getUserMedia`/screen-share
  APIs to be available and permitted; if that path fails for any reason
  it silently falls back to the browser-window-only method (see above) —
  see the "Known caveats" list above for the multi-monitor and prompt
  details.
- Only the folder's own icon fill/outline and label text are changed — this
  does not touch tab colors inside the folder, and it does not touch the
  label bar's background.
- If Zen ever renames the `zenFolderActions` popup id, the
  `--zen-primary-color` / `--zen-folder-stroke` variables, or the
  `zen-folder` tag, the affected part of this mod simply stops having an
  effect rather than throwing.
