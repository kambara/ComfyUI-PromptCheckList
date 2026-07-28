export function findTextWidget(node) {
  return findWidgetByName(node, "text");
}

export function findDelimiterWidget(node) {
  return findWidgetByName(node, "delimiter");
}

export function findLineBreakWidget(node) {
  return findWidgetByName(node, "line_break");
}

export function findModeWidget(node) {
  return findWidgetByName(node, "mode");
}

export function isAutoMode(node) {
  const modeWidget = findModeWidget(node);
  return modeWidget ? modeWidget.value === "auto" : false;
}

function findWidgetByName(node, name) {
  if (!node || !node.widgets) return null;
  for (const w of node.widgets) {
    if (w.name === name) {
      return w;
    }
  }
  return null;
}

export const VALID_DELIMITERS = ["comma", "space", "none"];

export const DEFAULT_DELIMITER = VALID_DELIMITERS[0];

export function validateDelimiterValue(delimiterWidget) {
  if (!delimiterWidget) return;
  if (!VALID_DELIMITERS.includes(delimiterWidget.value)) {
    delimiterWidget.value = DEFAULT_DELIMITER;
  }
}

export function validateLineBreakValue(lineBreakWidget) {
  if (!lineBreakWidget) return;
  if (typeof lineBreakWidget.value !== "boolean") {
    lineBreakWidget.value = true;
  }
}

export function showWidget(widget) {
  applyWidgetVisibility(widget, true, false);
}

export function hideWidget(widget) {
  applyWidgetVisibility(widget, false, false);
}

export function hideWidgetAndKeepSpace(widget) {
  applyWidgetVisibility(widget, false, true);
}

function applyWidgetVisibility(widget, visible, keepSpace) {
  if (!widget) return;
  setWidgetHiddenFlag(widget, !visible, keepSpace);
  setWidgetDisabled(widget, !visible);
  setWidgetElementDisplay(widget, visible);
}

function setWidgetHiddenFlag(widget, hidden, keepSpace) {
  const hiddenValue = keepSpace ? false : hidden;
  widget.hidden = hiddenValue;
  if (widget.options) {
    widget.options.hidden = hiddenValue;
  }
}

function setWidgetDisabled(widget, disabled) {
  // Prevent hidden widgets from receiving input or focus.
  // Without this, canvas UI elements become unclickable when preserving layout.
  widget.disabled = disabled;
  widget.computedDisabled = disabled;
}

function setWidgetElementDisplay(widget, visible) {
  const el = widget.element || widget.inputEl;
  if (!el || !el.style) return;
  el.style.display = visible ? "" : "none";
  el.style.pointerEvents = visible ? "" : "none";
}

export function calculateNodeHeight(lineCount, config) {
  return Math.max(
    config.minNodeHeight,
    config.topNodePadding + lineCount * config.lineHeight + 10,
  );
}
