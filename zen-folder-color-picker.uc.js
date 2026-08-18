// ==UserScript==
// @name           Zen Folder Color Picker
// @description    Adds a "Change Color…" item to the sidebar folder context menu with separate
//                  color wheels for icon fill, icon outline, and label text, plus an outline
//                  thickness control. Never-customized folders open pre-filled with Zen's own
//                  current colors for that folder.
// @include        main
// ==/UserScript==

(function () {
  "use strict";

  const PREF_KEY = "extensions.zenfoldercolor.colors"; // JSON: { [folderId]: {fill, outline, text, width} }
  const MENU_ITEM_ID = "zen-folder-change-color-item";
  const MENU_SEP_ID = "zen-folder-change-color-sep";
  const PANEL_ID = "zen-folder-color-picker-panel";
  const CONTEXT_MENU_ID = "zenFolderActions"; // popup Zen wires to folder labels via context="..."
  const HTML_NS = "http://www.w3.org/1999/xhtml";

  function html(tag) {
    return document.createElementNS(HTML_NS, tag);
  }
  function xul(tag) {
    return document.createXULElement(tag);
  }

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  function loadColors() {
    try {
      return JSON.parse(Services.prefs.getStringPref(PREF_KEY, "{}"));
    } catch (e) {
      return {};
    }
  }

  function saveColors(map) {
    Services.prefs.setStringPref(PREF_KEY, JSON.stringify(map));
  }

  // Normalizes an entry, migrating older formats to the current shape:
  // { fill, outline, text, width }
  function normalizeEntry(entry) {
    if (!entry) return { fill: null, outline: null, text: null, width: 2 };
    if (typeof entry === "string") return { fill: entry, outline: null, text: null, width: 2 };
    return {
      fill: entry.fill || null,
      outline: entry.outline || null,
      text: entry.text || null,
      width: typeof entry.width === "number" ? entry.width : 2,
    };
  }

  function ensureFolderId(folder) {
    if (!folder.id) {
      folder.id = `zen-folder-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }
    return folder.id;
  }

  // ---------------------------------------------------------------------
  // Color helpers
  // ---------------------------------------------------------------------

  function hsvToHex(h, s, v) {
    let r, g, b;
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }

  const HEX_RE = /^#[0-9a-fA-F]{6}$/;

  function rgbStringToHex(rgbStr) {
    if (!rgbStr) return null;
    const m = rgbStr.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    const [r, g, b] = parts;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Reads a folder's *currently rendered* color for a given part, so a
  // never-customized folder's picker opens pre-filled with what Zen is
  // already showing (its native per-folder default) instead of a
  // hardcoded guess.
  function iconShapeEl(folder) {
    return folder.querySelector(
      ".tab-group-folder-icon svg path, .tab-group-folder-icon svg rect, .tab-group-folder-icon svg polygon"
    );
  }

  function labelEl(folder) {
    return folder.querySelector(".tab-group-label") || folder.querySelector(".tab-group-label-container");
  }

  function computedPrimaryColorHex(folder, fallback) {
    try {
      const raw = getComputedStyle(folder).getPropertyValue("--zen-primary-color").trim();
      if (!raw) return fallback;
      return rgbStringToHex(raw) || (HEX_RE.test(raw) ? raw : fallback);
    } catch (e) {
      return fallback;
    }
  }

  function computedStrokeHex(folder, fallback) {
    const el = iconShapeEl(folder);
    if (el) {
      try {
        const hex = rgbStringToHex(getComputedStyle(el).stroke);
        if (hex) return hex;
      } catch (e) {
        /* fall through */
      }
    }
    // A folder with no custom outline typically has no colored stroke to
    // read back (e.g. computed "stroke" comes back as "none"). In that
    // case, match it to the folder's own primary color — the same base
    // color Zen already uses for that folder's fill — rather than an
    // arbitrary fixed guess.
    return computedPrimaryColorHex(folder, fallback);
  }

  function computedStrokeWidth(folder, fallback) {
    const el = iconShapeEl(folder);
    if (!el) return fallback;
    try {
      const v = parseFloat(getComputedStyle(el).strokeWidth);
      return Number.isNaN(v) ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function computedTextHex(folder, fallback) {
    const el = labelEl(folder);
    if (!el) return fallback;
    try {
      return rgbStringToHex(getComputedStyle(el).color) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  // ---------------------------------------------------------------------
  // Applying colors to folders
  // ---------------------------------------------------------------------

  function applyColor(folder, entry) {
    const { fill, outline, text, width } = normalizeEntry(entry);

    if (fill) {
      // --zen-primary-color is Zen's OWN native variable. Its built-in
      // zen-folders.css derives the icon's background/fill via
      // --zen-folder-behind-bgcolor: light-dark(color-mix(in srgb,
      // var(--zen-primary-color) 60%, gray), color-mix(in srgb,
      // var(--zen-primary-color) 60%, #c1c1c1)) — i.e. it blends the
      // primary color with gray/light-gray depending on light/dark mode.
      // Setting --zen-primary-color (instead of forcing `fill:` directly,
      // like an earlier version of this mod did) lets that native
      // formula run as normal, so the icon keeps the same light/dark
      // blended variation Zen already gives every folder — just with a
      // custom base color instead of one of the presets.
      folder.style.setProperty("--zen-primary-color", fill);
    } else {
      folder.style.removeProperty("--zen-primary-color");
    }

    if (text) {
      folder.style.setProperty("--zen-folder-text-color", text);
    } else {
      folder.style.removeProperty("--zen-folder-text-color");
    }

    if (outline) {
      // --zen-folder-stroke is Zen's own native variable that its
      // zen-folders.css already binds to the folder icon's SVG stroke —
      // setting it here is enough to recolor the icon outline, no extra
      // CSS needed on our end. --zen-folder-stroke-width is our own
      // variable (Zen doesn't expose one), applied via our stylesheet.
      folder.style.setProperty("--zen-folder-stroke", outline);
      folder.style.setProperty("--zen-folder-stroke-width", `${width}px`);
    } else {
      folder.style.removeProperty("--zen-folder-stroke");
      folder.style.removeProperty("--zen-folder-stroke-width");
    }

    if (fill || outline || text) {
      folder.setAttribute("zen-custom-colored", "true");
    } else {
      folder.removeAttribute("zen-custom-colored");
    }
  }

  function applyStoredColors(root = document) {
    const colors = loadColors();
    root.querySelectorAll("zen-folder").forEach((folder) => {
      if (folder.id && colors[folder.id]) applyColor(folder, colors[folder.id]);
    });
  }

  // ---------------------------------------------------------------------
  // Reusable color wheel widget
  // ---------------------------------------------------------------------

  // Builds one wheel + value slider + hex field + a "Reset" button inside
  // `parent`, labeled with `label`. Returns { getHex, setHex, root, onReset }
  // — the caller assigns `onReset` to a function that restores this
  // wheel's "default" value (varies per property/folder), and the
  // button's command handler invokes whatever was assigned.
  function buildWheelWidget(parent, label) {
    const wrapper = xul("vbox");
    wrapper.style.gap = "4px";
    wrapper.style.alignItems = "center";

    const title = html("div");
    title.textContent = label;
    title.style.fontSize = "11px";
    title.style.opacity = "0.75";

    const canvas = html("canvas");
    canvas.width = 120;
    canvas.height = 120;
    canvas.style.cursor = "crosshair";
    canvas.style.borderRadius = "50%";
    const ctx = canvas.getContext("2d");

    const valueSlider = html("input");
    valueSlider.type = "range";
    valueSlider.min = "0";
    valueSlider.max = "100";
    valueSlider.value = "100";
    valueSlider.style.width = "120px";

    const row = xul("hbox");
    row.style.gap = "6px";
    row.style.alignItems = "center";

    const preview = html("div");
    preview.style.width = "18px";
    preview.style.height = "18px";
    preview.style.borderRadius = "50%";
    preview.style.border = "1px solid rgba(0,0,0,0.3)";
    preview.style.flexShrink = "0";

    const hexInput = html("input");
    hexInput.type = "text";
    hexInput.maxLength = 7;
    hexInput.style.width = "80px";
    hexInput.style.fontFamily = "monospace";

    const resetBtn = xul("button");
    resetBtn.setAttribute("label", "Reset");
    resetBtn.classList.add("zen-folder-color-wheel-reset");
    resetBtn.style.minWidth = "0";
    resetBtn.style.fontSize = "10px";
    resetBtn.style.padding = "0 4px";

    row.append(preview, hexInput, resetBtn);
    wrapper.append(title, canvas, valueSlider, row);
    parent.append(wrapper);

    let hue = 0, sat = 0;

    function draw() {
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2, radius = w / 2;
      const value = valueSlider.value / 100;
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx, dy = y - cy;
          const r = Math.sqrt(dx * dx + dy * dy);
          const idx = (y * w + x) * 4;
          if (r <= radius) {
            let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (angle < 0) angle += 360;
            const s = Math.min(r / radius, 1);
            const hex = hsvToHex(angle, s, value);
            img.data[idx] = parseInt(hex.slice(1, 3), 16);
            img.data[idx + 1] = parseInt(hex.slice(3, 5), 16);
            img.data[idx + 2] = parseInt(hex.slice(5, 7), 16);
            img.data[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    function syncFromWheelState() {
      const value = valueSlider.value / 100;
      const hex = hsvToHex(hue, sat, value);
      hexInput.value = hex;
      preview.style.background = hex;
    }

    function pickAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left, y = clientY - rect.top;
      const cx = canvas.width / 2, cy = canvas.height / 2, radius = canvas.width / 2;
      const dx = x - cx, dy = y - cy;
      const r = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      hue = angle;
      sat = r / radius;
      syncFromWheelState();
    }

    canvas.addEventListener("mousedown", (e) => {
      pickAt(e.clientX, e.clientY);
      const move = (ev) => pickAt(ev.clientX, ev.clientY);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    valueSlider.addEventListener("input", () => {
      draw();
      syncFromWheelState();
    });

    hexInput.addEventListener("change", () => {
      const v = hexInput.value.trim();
      if (HEX_RE.test(v)) {
        preview.style.background = v;
        const hsv = hexToHsv(v);
        hue = hsv.h;
        sat = hsv.s;
        valueSlider.value = Math.round(hsv.v * 100);
        draw();
      }
    });

    function setHex(hex) {
      const v = HEX_RE.test(hex) ? hex : "#8a8fff";
      const hsv = hexToHsv(v);
      hue = hsv.h;
      sat = hsv.s;
      valueSlider.value = Math.round(hsv.v * 100);
      hexInput.value = v;
      preview.style.background = v;
      draw();
    }

    function getHex() {
      const v = hexInput.value.trim();
      return HEX_RE.test(v) ? v : null;
    }

    // widgetApi.onReset is assigned by the caller (buildPanel), since the
    // "default" color to reset to depends on which folder/property this
    // particular wheel represents. The button just invokes whatever was
    // assigned.
    const widgetApi = { getHex, setHex, root: wrapper, onReset: null };
    resetBtn.addEventListener("command", () => {
      if (widgetApi.onReset) widgetApi.onReset();
    });

    return widgetApi;
  }

  // ---------------------------------------------------------------------
  // Panel: fill wheel + outline wheel + text wheel + thickness + buttons
  // ---------------------------------------------------------------------

  let panel, fillWidget, outlineWidget, textWidget;
  let widthSlider, widthNumber, widthLabel;
  let fillEnabledCheckbox, outlineEnabledCheckbox, textEnabledCheckbox;
  let activeFolder = null;

  function buildPanel() {
    panel = xul("panel");
    panel.id = PANEL_ID;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("noautofocus", "true");
    panel.setAttribute("flip", "both");

    const container = xul("vbox");
    container.style.padding = "12px";
    container.style.gap = "8px";

    const wheelsRow = xul("hbox");
    wheelsRow.style.gap = "14px";

    fillWidget = buildWheelWidget(wheelsRow, "Fill Color");
    outlineWidget = buildWheelWidget(wheelsRow, "Outline Color");
    textWidget = buildWheelWidget(wheelsRow, "Text Color");

    // Each wheel's Reset restores THAT property's default — read live
    // off the folder at click time — without touching the other two
    // wheels or the enable checkboxes.
    fillWidget.onReset = () => {
      if (!activeFolder) return;
      fillWidget.setHex(computedPrimaryColorHex(activeFolder, "#8a8fff"));
    };
    outlineWidget.onReset = () => {
      if (!activeFolder) return;
      outlineWidget.setHex(computedStrokeHex(activeFolder, "#2a2f6d"));
      const w = computedStrokeWidth(activeFolder, 2);
      widthSlider.value = String(Math.min(Math.max(w, 0), 8));
      widthNumber.value = String(w);
    };
    textWidget.onReset = () => {
      if (!activeFolder) return;
      textWidget.setHex(computedTextHex(activeFolder, "#ffffff"));
    };

    container.append(wheelsRow);

    // Enable toggles (fill + outline + text), side by side
    const togglesRow = xul("hbox");
    togglesRow.style.alignItems = "center";
    togglesRow.style.gap = "14px";
    togglesRow.style.marginTop = "4px";

    fillEnabledCheckbox = xul("checkbox");
    fillEnabledCheckbox.setAttribute("label", "Enable fill");
    fillEnabledCheckbox.addEventListener("command", () => {
      const enabled = fillEnabledCheckbox.checked;
      fillWidget.root.style.opacity = enabled ? "1" : "0.4";
      fillWidget.root.style.pointerEvents = enabled ? "auto" : "none";
    });

    outlineEnabledCheckbox = xul("checkbox");
    outlineEnabledCheckbox.setAttribute("label", "Enable outline");
    outlineEnabledCheckbox.addEventListener("command", () => {
      const enabled = outlineEnabledCheckbox.checked;
      outlineWidget.root.style.opacity = enabled ? "1" : "0.4";
      outlineWidget.root.style.pointerEvents = enabled ? "auto" : "none";
      widthSlider.disabled = !enabled;
      widthNumber.disabled = !enabled;
    });

    textEnabledCheckbox = xul("checkbox");
    textEnabledCheckbox.setAttribute("label", "Enable text");
    textEnabledCheckbox.addEventListener("command", () => {
      const enabled = textEnabledCheckbox.checked;
      textWidget.root.style.opacity = enabled ? "1" : "0.4";
      textWidget.root.style.pointerEvents = enabled ? "auto" : "none";
    });

    togglesRow.append(fillEnabledCheckbox, outlineEnabledCheckbox, textEnabledCheckbox);
    container.append(togglesRow);

    // Thickness: slider (decimals, down to 0) + a typeable number field
    const widthRow = xul("vbox");
    widthRow.style.gap = "2px";
    widthRow.style.marginTop = "4px";

    widthLabel = html("div");
    widthLabel.style.fontSize = "11px";
    widthLabel.style.opacity = "0.75";
    widthLabel.textContent = "Outline Thickness";

    const widthControls = xul("hbox");
    widthControls.style.alignItems = "center";
    widthControls.style.gap = "8px";

    widthSlider = html("input");
    widthSlider.type = "range";
    widthSlider.min = "0";
    widthSlider.max = "8";
    widthSlider.step = "0.1";
    widthSlider.value = "2";
    widthSlider.style.width = "300px";

    widthNumber = html("input");
    widthNumber.type = "number";
    widthNumber.min = "0";
    widthNumber.max = "20";
    widthNumber.step = "0.1";
    widthNumber.value = "2";
    widthNumber.style.width = "58px";

    widthSlider.addEventListener("input", () => {
      widthNumber.value = widthSlider.value;
    });
    widthNumber.addEventListener("input", () => {
      const v = parseFloat(widthNumber.value);
      if (!Number.isNaN(v)) {
        // keep the slider in sync when the typed value is within its range;
        // values above the slider's max still work, they just won't move it
        if (v >= parseFloat(widthSlider.min) && v <= parseFloat(widthSlider.max)) {
          widthSlider.value = String(v);
        }
      }
    });

    widthControls.append(widthSlider, widthNumber);
    widthRow.append(widthLabel, widthControls);
    container.append(widthRow);

    // Buttons
    const btnRow = xul("hbox");
    btnRow.style.gap = "6px";
    btnRow.style.marginTop = "8px";

    const applyBtn = xul("button");
    applyBtn.setAttribute("label", "Apply");
    applyBtn.addEventListener("command", commitColor);

    const resetBtn = xul("button");
    resetBtn.setAttribute("label", "Reset All");
    resetBtn.setAttribute("tooltiptext", "Clear all custom colors for this folder");
    resetBtn.addEventListener("command", resetColor);

    const cancelBtn = xul("button");
    cancelBtn.setAttribute("label", "Cancel");
    cancelBtn.addEventListener("command", () => panel.hidePopup());

    btnRow.append(applyBtn, resetBtn, cancelBtn);
    container.append(btnRow);

    panel.append(container);
    (document.getElementById("mainPopupSet") || document.documentElement).appendChild(panel);
  }

  function currentWidth() {
    // number field is the source of truth (it accepts values the slider
    // can't reach, e.g. above its max), fall back to the slider
    const n = parseFloat(widthNumber.value);
    if (!Number.isNaN(n)) return Math.max(0, n);
    const s = parseFloat(widthSlider.value);
    return Number.isNaN(s) ? 2 : s;
  }

  function commitColor() {
    if (!activeFolder) return;
    const fill = fillEnabledCheckbox.checked ? fillWidget.getHex() : null;
    const outline = outlineEnabledCheckbox.checked ? outlineWidget.getHex() : null;
    const text = textEnabledCheckbox.checked ? textWidget.getHex() : null;
    const width = currentWidth();

    const id = ensureFolderId(activeFolder);
    const colors = loadColors();
    colors[id] = { fill, outline, text, width };
    saveColors(colors);
    applyColor(activeFolder, colors[id]);
    panel.hidePopup();
  }

  function resetColor() {
    if (!activeFolder) return;
    const id = ensureFolderId(activeFolder);
    const colors = loadColors();
    delete colors[id];
    saveColors(colors);
    applyColor(activeFolder, null);
    panel.hidePopup();
  }

  function openPickerFor(folder, anchor) {
    if (!panel) buildPanel();
    activeFolder = folder;
    const id = ensureFolderId(folder);
    const colors = loadColors();
    const stored = colors[id];
    const hasStoredEntry = !!stored;
    const entry = normalizeEntry(stored);

    // For a folder that's never been customized, default every wheel to
    // ON and pre-filled with whatever Zen is already rendering for it
    // (its native default color) rather than an arbitrary guess. Once a
    // folder HAS a stored entry, respect exactly what was saved —
    // including any wheel the user deliberately turned off.
    const fillHex = entry.fill || computedPrimaryColorHex(folder, "#8a8fff");
    const outlineHex = entry.outline || computedStrokeHex(folder, "#2a2f6d");
    const textHex = entry.text || computedTextHex(folder, "#ffffff");
    const width = hasStoredEntry ? entry.width : computedStrokeWidth(folder, 2);

    fillWidget.setHex(fillHex);
    outlineWidget.setHex(outlineHex);
    textWidget.setHex(textHex);

    const hasFill = hasStoredEntry ? !!entry.fill : true;
    fillEnabledCheckbox.checked = hasFill;
    fillWidget.root.style.opacity = hasFill ? "1" : "0.4";
    fillWidget.root.style.pointerEvents = hasFill ? "auto" : "none";

    const hasOutline = hasStoredEntry ? !!entry.outline : true;
    outlineEnabledCheckbox.checked = hasOutline;
    outlineWidget.root.style.opacity = hasOutline ? "1" : "0.4";
    outlineWidget.root.style.pointerEvents = hasOutline ? "auto" : "none";

    const hasText = hasStoredEntry ? !!entry.text : true;
    textEnabledCheckbox.checked = hasText;
    textWidget.root.style.opacity = hasText ? "1" : "0.4";
    textWidget.root.style.pointerEvents = hasText ? "auto" : "none";

    widthSlider.value = String(Math.min(Math.max(width, 0), 8));
    widthNumber.value = String(width);
    widthSlider.disabled = !hasOutline;
    widthNumber.disabled = !hasOutline;

    panel.openPopup(anchor || folder, "bottomcenter topleft", 0, 4, false, false);
  }

  // ---------------------------------------------------------------------
  // Context menu injection
  // ---------------------------------------------------------------------

  let pendingFolder = null;
  let pendingAnchor = null;

  document.addEventListener(
    "popupshowing",
    (event) => {
      const popup = event.target;
      if (!popup || popup.id !== CONTEXT_MENU_ID) return;

      const triggerNode = popup.triggerNode;
      const folder = triggerNode ? triggerNode.closest("zen-folder") : null;
      if (!folder) return;

      pendingFolder = folder;
      pendingAnchor = triggerNode;

      if (!document.getElementById(MENU_ITEM_ID)) {
        const sep = xul("menuseparator");
        sep.id = MENU_SEP_ID;

        const item = xul("menuitem");
        item.id = MENU_ITEM_ID;
        item.setAttribute("label", "Change Color…");
        item.addEventListener("command", () => openPickerFor(pendingFolder, pendingAnchor));

        popup.append(sep, item);
      }
    },
    true
  );

  // ---------------------------------------------------------------------
  // Startup / persistence across new folders, restores, etc.
  // ---------------------------------------------------------------------

  function init() {
    applyStoredColors();

    const target = document.getElementById("tabbrowser-tabs") || document.documentElement;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          applyStoredColors();
          break;
        }
      }
    });
    observer.observe(target, { childList: true, subtree: true });

    window.addEventListener("SSWindowStateReady", () => applyStoredColors());
  }

  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init, { once: true });
  }
})();
