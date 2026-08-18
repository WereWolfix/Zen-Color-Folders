// ==UserScript==
// @name           Zen Folder Color Picker
// @description    Adds a "Change Color…" item to the sidebar folder context menu and lets you
//                  pick any custom color for that folder from a color wheel.
// @include        main
// ==/UserScript==

(function () {
  "use strict";

  const PREF_KEY = "extensions.zenfoldercolor.colors"; // JSON: { [folderId]: "#rrggbb" }
  const MENU_ITEM_ID = "zen-folder-change-color-item";
  const MENU_SEP_ID = "zen-folder-change-color-sep";
  const PANEL_ID = "zen-folder-color-picker-panel";
  const CONTEXT_MENU_ID = "zenFolderActions"; // the popup Zen wires to folder labels via context="..."
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

  function contrastText(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  }

  // ---------------------------------------------------------------------
  // Applying colors to folders
  // ---------------------------------------------------------------------

  function applyColor(folder, hex) {
    if (hex) {
      folder.style.setProperty("--zen-folder-color", hex);
      folder.style.setProperty("--zen-folder-color-contrast", contrastText(hex));
      folder.setAttribute("zen-custom-colored", "true");
    } else {
      folder.style.removeProperty("--zen-folder-color");
      folder.style.removeProperty("--zen-folder-color-contrast");
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
  // Color wheel panel
  // ---------------------------------------------------------------------

  let panel, canvas, ctx, valueSlider, hexInput, preview;
  let activeFolder = null;
  let wheelHue = 0, wheelSat = 0;

  function buildPanel() {
    panel = xul("panel");
    panel.id = PANEL_ID;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("noautofocus", "true");
    panel.setAttribute("flip", "both");

    const container = xul("vbox");
    container.style.padding = "12px";
    container.style.gap = "8px";
    container.style.alignItems = "center";

    canvas = html("canvas");
    canvas.width = 180;
    canvas.height = 180;
    canvas.style.cursor = "crosshair";
    canvas.style.borderRadius = "50%";
    ctx = canvas.getContext("2d");

    valueSlider = html("input");
    valueSlider.type = "range";
    valueSlider.min = "0";
    valueSlider.max = "100";
    valueSlider.value = "100";
    valueSlider.style.width = "180px";

    const row = xul("hbox");
    row.style.gap = "6px";
    row.style.alignItems = "center";

    preview = html("div");
    preview.style.width = "22px";
    preview.style.height = "22px";
    preview.style.borderRadius = "50%";
    preview.style.border = "1px solid rgba(0,0,0,0.3)";
    preview.style.flexShrink = "0";

    hexInput = html("input");
    hexInput.type = "text";
    hexInput.maxLength = 7;
    hexInput.style.width = "90px";
    hexInput.style.fontFamily = "monospace";

    row.append(preview, hexInput);

    const btnRow = xul("hbox");
    btnRow.style.gap = "6px";
    btnRow.style.marginTop = "6px";

    const applyBtn = xul("button");
    applyBtn.setAttribute("label", "Apply");
    applyBtn.addEventListener("command", commitColor);

    const resetBtn = xul("button");
    resetBtn.setAttribute("label", "Reset");
    resetBtn.addEventListener("command", resetColor);

    const cancelBtn = xul("button");
    cancelBtn.setAttribute("label", "Cancel");
    cancelBtn.addEventListener("command", () => panel.hidePopup());

    btnRow.append(applyBtn, resetBtn, cancelBtn);
    container.append(canvas, valueSlider, row, btnRow);
    panel.append(container);

    (document.getElementById("mainPopupSet") || document.documentElement).appendChild(panel);

    canvas.addEventListener("mousedown", startPick);
    valueSlider.addEventListener("input", () => {
      drawWheel();
      syncFromWheelState();
    });
    hexInput.addEventListener("change", () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        preview.style.background = v;
        const hsv = hexToHsv(v);
        wheelHue = hsv.h;
        wheelSat = hsv.s;
        valueSlider.value = Math.round(hsv.v * 100);
        drawWheel();
      }
    });

    drawWheel();
  }

  function drawWheel() {
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

  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const cx = canvas.width / 2, cy = canvas.height / 2, radius = canvas.width / 2;
    const dx = x - cx, dy = y - cy;
    const r = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    wheelHue = angle;
    wheelSat = r / radius;
    syncFromWheelState();
  }

  function startPick(e) {
    pickAt(e.clientX, e.clientY);
    const move = (ev) => pickAt(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function syncFromWheelState() {
    const value = valueSlider.value / 100;
    const hex = hsvToHex(wheelHue, wheelSat, value);
    hexInput.value = hex;
    preview.style.background = hex;
  }

  function commitColor() {
    if (!activeFolder) return;
    const hex = hexInput.value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const id = ensureFolderId(activeFolder);
    const colors = loadColors();
    colors[id] = hex;
    saveColors(colors);
    applyColor(activeFolder, hex);
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
    const current = colors[id] || "#8a8fff";

    const hsv = hexToHsv(current);
    wheelHue = hsv.h;
    wheelSat = hsv.s;
    valueSlider.value = Math.round(hsv.v * 100);
    hexInput.value = current;
    preview.style.background = current;
    drawWheel();

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
