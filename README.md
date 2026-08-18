# Zen Folder Color Picker

Adds a **"Change Color…"** item to the right-click menu on sidebar folders in
Zen Browser, opening a color wheel so you can pick *any* custom color for
that folder — not just the built-in preset palette.

## How it works

- Zen's sidebar folders are `<zen-folder>` custom elements (an extension of
  Firefox's native tab-group element). Their label is wired to a context
  menu popup with `id="zenFolderActions"`.
- This mod listens for that popup opening, figures out which folder was
  right-clicked (`popup.triggerNode.closest("zen-folder")`), and injects a
  "Change Color…" menu item if one isn't already there.
- Clicking it opens a small panel with an HSV color wheel (hue + saturation
  by position, a brightness slider, and an editable hex field).
- The chosen color is stored in the hidden preference
  `extensions.zenfoldercolor.colors` as `{ "<folder id>": "#rrggbb" }`, and
  applied as CSS custom properties (`--zen-folder-color`,
  `--zen-folder-color-contrast`) directly on the folder element. The
  bundled `.css` file uses those variables to tint the label and icon.
- Colors are re-applied on browser start, session restore, and whenever new
  folders appear in the sidebar, so they persist across restarts as long as
  Zen keeps assigning the same folder its native id (which it does — that id
  is part of Firefox's own tab-group persistence).

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

- The icon-tinting CSS selectors (`.tab-group-folder-icon svg path`, etc.)
  are a best-effort match based on Zen's folder markup. Zen's internal HTML
  structure can change between releases. If the icon doesn't pick up the
  color after installing, right-click the folder icon → Inspect (via the
  Browser Toolbox, `Ctrl+Shift+Alt+I`) and adjust the selectors in
  `zen-folder-color-picker.css` to match what you see.
- Only the folder label/icon color is changed — this does not touch tab
  colors inside the folder.
- If Zen ever renames the `zenFolderActions` popup id or the `zen-folder`
  tag, the context-menu item simply won't appear (the script fails
  gracefully rather than throwing).
