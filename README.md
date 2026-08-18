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
  - a **Fill Color** wheel — tints only the folder *icon's* fill, not the
    label bar background
  - an **Outline Color** wheel — tints the folder icon's outline
  - a **Text Color** wheel — tints the folder's label text, independently
    of the fill color
  - each of the three has its own "Enable ___" checkbox
  - an **Outline Thickness** control: a slider (0–8, in 0.1 steps) paired
    with a number field you can type an exact value into directly
    (including values above 8, and down to 0)

### First time you open a folder's picker

If a folder has never been customized with this mod, all three wheels open
**enabled by default**, pre-filled with whatever Zen is *already* rendering
for that folder — its native default icon fill, outline, and text color —
by reading the actual computed styles off the folder's icon/label at the
moment you open the picker. So the picker starts by matching what you
currently see, and you're just nudging it from there, rather than starting
from some arbitrary placeholder color.

Once you've applied a custom value for a folder, reopening the picker later
respects exactly what you saved, including any wheel you deliberately
switched off.

- The chosen values are stored in the hidden preference
  `extensions.zenfoldercolor.colors` as
  `{ "<folder id>": { "fill": "#rrggbb"|null, "outline": "#rrggbb"|null, "text": "#rrggbb"|null, "width": n } }`,
  and applied as CSS custom properties directly on the folder element:
  - `--zen-folder-color` — our own variable, used by the bundled CSS to
    tint **only** the icon's SVG fill.
  - `--zen-folder-text-color` — our own variable, used by the bundled CSS
    to color the label text, independent of the fill.
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

- The icon-tinting/stroking CSS selectors (`.tab-group-folder-icon svg
  path`, etc.) are a best-effort match based on Zen's folder markup. Zen's
  internal HTML structure can change between releases. If the icon doesn't
  pick up a value after installing, right-click the folder icon → Inspect
  (via the Browser Toolbox, `Ctrl+Shift+Alt+I`) and adjust the selectors in
  `zen-folder-color-picker.css` to match what you see.
- The "current color" the picker pre-fills with on first open is read via
  `getComputedStyle` on the folder's icon path and label at the moment you
  right-click, so it reflects whatever theme/mod is currently painting the
  folder — including this mod's own previous output if you'd already
  customized a *different* property on that same folder.
- Only the folder's own icon fill/outline and label text are changed — this
  does not touch tab colors inside the folder, and it does not touch the
  label bar's background.
- If Zen ever renames the `zenFolderActions` popup id or the `zen-folder`
  tag, the context-menu item simply won't appear (the script fails
  gracefully rather than throwing).
