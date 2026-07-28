import {
  findDelimiterWidget,
  findLineBreakWidget,
  findModeWidget,
  findTextWidget,
  hideWidget,
  showWidget,
  validateDelimiterValue,
  validateLineBreakValue,
} from "./ui_utils.js";
import { Line } from "./line.js";
import { TextLines } from "./text_lines.js";
import { SelectionDisplay } from "./selection_display.js";

const CONFIG = {
  lineHeight: 24,
  fontSize: 14,
  checkboxSize: 18,
  checkboxMarginRight: 8,
  weightButtonSize: 18,
  weightLabelWidth: 30,
};

const DOM_WIDGET_NAME = "promptpalette_ui";

const CSS_VAR = {
  textPrimary: "var(--text-primary)",
  widgetBackground: "var(--component-node-widget-background)",
  widgetBackgroundHovered: "var(--component-node-widget-background-hovered)",
};

const COLOR = {
  // Text
  defaultTextColor: CSS_VAR.textPrimary,
  inactiveTextColor: `color-mix(in srgb, ${CSS_VAR.textPrimary} 40%, transparent)`,

  // Checkbox
  checkboxBorderColor: CSS_VAR.textPrimary,
  checkboxBorderColorOff: `color-mix(in srgb, ${CSS_VAR.textPrimary} 50%, transparent)`,
  checkboxFillColor: CSS_VAR.textPrimary,
  checkboxSymbolColor: CSS_VAR.widgetBackground,

  // Weight button
  weightButtonFillColor: CSS_VAR.widgetBackground,
  weightButtonFillColorHovered: CSS_VAR.widgetBackgroundHovered,
  weightButtonSymbolColor: `color-mix(in srgb, ${CSS_VAR.textPrimary} 60%, transparent)`,

  // Toggle button
  toggleButtonFillColor: CSS_VAR.widgetBackground,
  toggleButtonFillColorHovered: CSS_VAR.widgetBackgroundHovered,
  toggleButtonTextColor: `color-mix(in srgb, ${CSS_VAR.textPrimary} 60%, transparent)`,

  // Empty message
  emptyMessageColor: `color-mix(in srgb, ${CSS_VAR.textPrimary} 60%, transparent)`,
};

export function setupDomUI(nodeType, app) {
  // Hook once per node type to avoid double-wrapping prototype methods.
  if (nodeType.prototype.__nodeTypeInitialized) {
    return;
  }
  nodeType.prototype.__nodeTypeInitialized = true;

  // Run the original handler to preserve other extensions.
  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    if (origOnNodeCreated) {
      origOnNodeCreated.apply(this, arguments);
    }
    if (this.__nodeInitialized) {
      return;
    }
    this.__nodeInitialized = true;
    const textWidget = findTextWidget(this);
    if (!textWidget) return;

    this.__promptPaletteDomUI = new PromptPaletteDomUI(this, textWidget, app);
  };

  const origOnConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (data) {
    if (origOnConfigure) {
      origOnConfigure.call(this, data);
    }
    validateDelimiterValue(findDelimiterWidget(this));
    validateLineBreakValue(findLineBreakWidget(this));
    this.__promptPaletteDomUI?.applyModeLayout();
    this.__promptPaletteDomUI?.requestRedraw();
  };

  const origOnExecuted = nodeType.prototype.onExecuted;
  nodeType.prototype.onExecuted = function (message) {
    if (origOnExecuted) {
      origOnExecuted.apply(this, arguments);
    }
    this.__promptPaletteDomUI?.updateSelection(message);
  };
}

class PromptPaletteDomUI {
  static MODE = Object.freeze({
    EDIT: "edit",
    DISPLAY: "display",
  });
  static EVENT = Object.freeze({
    TOGGLE_COMMENT: "toggle_comment",
    WEIGHT_PLUS: "weight_plus",
    WEIGHT_MINUS: "weight_minus",
  });

  #node;
  #textWidget;
  #delimiterWidget;
  #lineBreakWidget;
  #modeWidget;
  #app;
  #mode;
  #rootContainer;
  #rowsContainer;
  #emptyMessage;
  #toggleButton;
  #rootWidget;
  #selectionDisplay;

  constructor(node, textWidget, app) {
    this.#node = node;
    this.#textWidget = textWidget;
    this.#delimiterWidget = findDelimiterWidget(node);
    this.#lineBreakWidget = findLineBreakWidget(node);
    this.#modeWidget = findModeWidget(node);
    this.#app = app;
    this.#mode = PromptPaletteDomUI.MODE.DISPLAY;

    this.#rootContainer = this.#createRootContainer();
    this.#rowsContainer = this.#createRowsContainer();
    this.#emptyMessage = this.#createEmptyMessage();
    this.#toggleButton = this.#createToggleButton();
    const buttonContainer = this.#createButtonContainer();
    buttonContainer.append(this.#toggleButton);

    this.#rootContainer.append(
      this.#rowsContainer,
      this.#emptyMessage,
      buttonContainer,
    );
    this.#rootWidget = this.#registerRootWidget();
    this.#rowsContainer.addEventListener(
      PromptPaletteDomUI.EVENT.TOGGLE_COMMENT,
      (event) => this.#handleRowToggleEvent(event),
    );
    this.#rowsContainer.addEventListener(
      PromptPaletteDomUI.EVENT.WEIGHT_PLUS,
      (event) => this.#handleRowWeightPlusEvent(event),
    );
    this.#rowsContainer.addEventListener(
      PromptPaletteDomUI.EVENT.WEIGHT_MINUS,
      (event) => this.#handleRowWeightMinusEvent(event),
    );
    this.#selectionDisplay = new SelectionDisplay(this.#node);
    this.#attachCollapseHook();
    this.#updateRootWidgetVisibility();
    hideWidget(this.#textWidget);
    hideWidget(this.#delimiterWidget);
    hideWidget(this.#lineBreakWidget);
    this.#bindModeWidget();
    this.applyModeLayout();
  }

  // Called after widget values are restored (workflow load, copy/paste).
  requestRedraw() {
    if (this.#isAutoMode()) {
      return;
    }
    if (this.#mode === PromptPaletteDomUI.MODE.DISPLAY) {
      this.#buildDisplayRows();
    }
  }

  // ========================================
  // Selection Mode (manual / auto)
  // ========================================
  #isAutoMode() {
    return this.#modeWidget ? this.#modeWidget.value === "auto" : false;
  }

  #bindModeWidget() {
    if (!this.#modeWidget) return;
    const origCallback = this.#modeWidget.callback;
    this.#modeWidget.callback = (value, ...rest) => {
      if (origCallback) {
        origCallback.call(this.#modeWidget, value, ...rest);
      }
      this.applyModeLayout();
    };
  }

  // Reconfigure the UI for the current selection mode.
  applyModeLayout() {
    if (this.#isAutoMode()) {
      // Auto mode: hide the checkbox palette, show the plain widgets so the
      // pool can be edited, and reveal the selection readout.
      this.#rootContainer.style.display = "none";
      if (this.#rootWidget) {
        this.#rootWidget.hidden = true;
        if (this.#rootWidget.options) {
          this.#rootWidget.options.hidden = true;
        }
      }
      showWidget(this.#textWidget);
      showWidget(this.#delimiterWidget);
      showWidget(this.#lineBreakWidget);
      this.#selectionDisplay.setVisible(true);
    } else {
      // Manual mode: back to the display palette (Edit/Save toggle + rows).
      this.#mode = PromptPaletteDomUI.MODE.DISPLAY;
      this.#toggleButton.textContent = "Edit";
      hideWidget(this.#textWidget);
      hideWidget(this.#delimiterWidget);
      hideWidget(this.#lineBreakWidget);
      this.#selectionDisplay.setVisible(false);
      this.#updateRootWidgetVisibility();
      this.#buildDisplayRows();
    }
    this.#refreshNodeWidgets();
    this.#app.graph.setDirtyCanvas(true);
  }

  updateSelection(message) {
    const selected = message?.selected;
    const text = Array.isArray(selected) ? selected[0] : selected;
    this.#selectionDisplay.setText(text);
  }

  // ========================================
  // DOM Element Creation
  // ========================================
  #createRootContainer() {
    const rootContainer = document.createElement("div");
    rootContainer.style.width = "100%";
    rootContainer.style.display = "flex";
    rootContainer.style.flexDirection = "column";
    rootContainer.style.gap = "2px";
    rootContainer.style.boxSizing = "border-box";
    rootContainer.style.height = "100%";
    rootContainer.style.fontSize = `${CONFIG.fontSize}px`;
    rootContainer.style.color = COLOR.defaultTextColor;
    return rootContainer;
  }

  #createRowsContainer() {
    const rowsContainer = document.createElement("div");
    rowsContainer.style.display = "none";
    rowsContainer.style.flexDirection = "column";
    rowsContainer.style.gap = "4px";
    rowsContainer.style.flex = "1 1 auto";
    rowsContainer.style.minHeight = "0";
    return rowsContainer;
  }

  #createEmptyMessage() {
    const emptyMessage = document.createElement("div");
    emptyMessage.textContent = "No Text";
    emptyMessage.style.display = "none";
    emptyMessage.style.alignItems = "center";
    emptyMessage.style.justifyContent = "center";
    emptyMessage.style.flex = "1";
    emptyMessage.style.color = COLOR.emptyMessageColor;
    return emptyMessage;
  }

  #createButtonContainer() {
    const buttonContainer = document.createElement("div");
    buttonContainer.style.marginTop = "auto";
    buttonContainer.style.paddingTop = "6px";

    return buttonContainer;
  }

  #createToggleButton() {
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.textContent = "Edit";
    toggleButton.style.width = "100%";
    toggleButton.style.border = "0";
    toggleButton.style.borderRadius = "6px";
    toggleButton.style.padding = "6px 8px";
    toggleButton.style.background = COLOR.toggleButtonFillColor;
    toggleButton.style.color = COLOR.toggleButtonTextColor;
    toggleButton.style.fontSize = `${CONFIG.fontSize}px`;
    toggleButton.style.cursor = "pointer";

    toggleButton.addEventListener("click", () => {
      this.#changeMode(
        this.#mode === PromptPaletteDomUI.MODE.EDIT
          ? PromptPaletteDomUI.MODE.DISPLAY
          : PromptPaletteDomUI.MODE.EDIT,
      );
    });
    toggleButton.addEventListener("mouseenter", () => {
      toggleButton.style.background = COLOR.toggleButtonFillColorHovered;
    });
    toggleButton.addEventListener("mouseleave", () => {
      toggleButton.style.background = COLOR.toggleButtonFillColor;
    });

    return toggleButton;
  }

  #registerRootWidget() {
    const rootWidget = this.#node.addDOMWidget(
      DOM_WIDGET_NAME,
      "promptpalette",
      this.#rootContainer,
      {},
    );
    rootWidget.serialize = false;
    rootWidget.options.margin = 0;
    return rootWidget;
  }

  // ========================================
  // Mode Management
  // ========================================
  #changeMode(mode) {
    this.#mode = mode;

    if (mode === PromptPaletteDomUI.MODE.EDIT) {
      // Switch to Edit mode
      showWidget(this.#textWidget);
      showWidget(this.#delimiterWidget);
      showWidget(this.#lineBreakWidget);
      this.#rowsContainer.style.display = "none";
      this.#emptyMessage.style.display = "none";
      this.#toggleButton.textContent = "Save";
      this.#app.graph.setDirtyCanvas(true);
    } else {
      // Switch to Display mode
      hideWidget(this.#textWidget);
      hideWidget(this.#delimiterWidget);
      hideWidget(this.#lineBreakWidget);
      this.#buildDisplayRows();
      this.#toggleButton.textContent = "Edit";
    }

    this.#refreshNodeWidgets();
    this.#callTextWidgetCallback();
  }

  #refreshNodeWidgets() {
    if (!this.#node?.widgets) return;
    this.#node.widgets = [...this.#node.widgets];
  }

  #callTextWidgetCallback() {
    if (!this.#textWidget || typeof this.#textWidget.callback !== "function") {
      return;
    }
    this.#textWidget.callback(this.#textWidget.value);
  }

  // ========================================
  // Collapse Handling
  // ========================================
  #attachCollapseHook() {
    const origCollapse = this.#node.collapse;
    this.#node.collapse = function () {
      const result = origCollapse
        ? origCollapse.apply(this, arguments)
        : undefined;
      this.__promptPaletteDomUI?.#updateRootWidgetVisibility();
      return result;
    };
  }

  #updateRootWidgetVisibility() {
    const isCollapsed = !!(this.#node.flags && this.#node.flags.collapsed);
    const shouldShow = !isCollapsed;
    this.#rootContainer.style.display = shouldShow ? "" : "none";
    if (this.#rootWidget) {
      this.#rootWidget.hidden = !shouldShow;
      if (this.#rootWidget.options) {
        this.#rootWidget.options.hidden = !shouldShow;
      }
    }
  }

  // ========================================
  // Display UI Building
  // ========================================
  #buildDisplayRows() {
    const text = this.#textWidget.value || "";
    this.#rowsContainer.replaceChildren();
    if (!text.trim()) {
      // Empty text: show the empty-state message
      this.#rowsContainer.style.display = "none";
      this.#emptyMessage.style.display = "flex";
      return;
    }
    // Non-empty: show rows
    this.#rowsContainer.style.display = "flex";
    this.#emptyMessage.style.display = "none";
    // Build row elements
    text.split("\n").forEach((line, index) => {
      const row = new PromptPaletteRow(line, index);
      this.#rowsContainer.append(row.element);
    });
    this.#app.graph.setDirtyCanvas(true);
  }

  // ========================================
  // Data Operations
  // ========================================
  #toggleLineComment(lineIndex) {
    if (this.#mode === PromptPaletteDomUI.MODE.EDIT) return;
    const textLines = new TextLines(this.#textWidget.value);
    textLines.toggleCommentAt(lineIndex);
    this.#textWidget.value = textLines.toString();
    this.#buildDisplayRows();
  }

  #adjustLineWeight(lineIndex, delta) {
    if (this.#mode === PromptPaletteDomUI.MODE.EDIT) return;
    const textLines = new TextLines(this.#textWidget.value);
    textLines.adjustWeightAt(lineIndex, delta);
    this.#textWidget.value = textLines.toString();
    this.#buildDisplayRows();
  }

  // ========================================
  // Event Handling
  // ========================================
  #handleRowToggleEvent(event) {
    const lineIndex = event?.detail?.index;
    this.#toggleLineComment(lineIndex);
  }

  #handleRowWeightPlusEvent(event) {
    const lineIndex = event?.detail?.index;
    this.#adjustLineWeight(lineIndex, 0.1);
  }

  #handleRowWeightMinusEvent(event) {
    const lineIndex = event?.detail?.index;
    this.#adjustLineWeight(lineIndex, -0.1);
  }
}

class PromptPaletteRow {
  #line;
  #index;

  // ========================================
  // Constructor
  // ========================================
  constructor(lineText, index) {
    this.#line = new Line(lineText);
    this.#index = index;
    this.element = this.#createElement();
  }

  // ========================================
  // DOM Element Creation
  // ========================================
  #createElement() {
    if (!this.#line.hasPhraseText()) {
      return this.#createEmptyRow();
    }
    const row = document.createElement("div");
    row.style.height = `${CONFIG.lineHeight}px`;
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = `${CONFIG.checkboxMarginRight}px`;

    // Build Checkbox + Display Text.
    row.append(this.#createCheckbox());
    const displayTextElement = this.#createDisplayText();
    if (this.#line.weight !== 1.0) {
      displayTextElement.style.fontWeight = "bold";
    }
    row.append(displayTextElement);

    const weightButtonsContainer = this.#createWeightButtonsContainer();
    if (this.#line.weight !== 1.0) {
      weightButtonsContainer.append(
        this.#createWeightLabel(this.#line.weightText),
      );
    }
    weightButtonsContainer.append(
      this.#createWeightButton("-", () => this.#onWeightMinusClick()),
      this.#createWeightButton("+", () => this.#onWeightPlusClick()),
    );
    row.append(weightButtonsContainer);

    return row;
  }

  #createCheckbox() {
    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.style.width = `${CONFIG.checkboxSize}px`;
    checkbox.style.height = `${CONFIG.checkboxSize}px`;
    checkbox.style.borderRadius = "4px";
    checkbox.style.background = "transparent";
    checkbox.style.color = COLOR.checkboxSymbolColor;
    checkbox.style.lineHeight = "1";
    checkbox.style.padding = "0";
    checkbox.style.display = "inline-flex";
    checkbox.style.alignItems = "center";
    checkbox.style.justifyContent = "center";
    checkbox.style.cursor = "pointer";
    if (this.#line.commentedOut) {
      checkbox.style.border = `1px solid ${COLOR.checkboxBorderColorOff}`;
    } else {
      checkbox.style.border = `1px solid ${COLOR.checkboxBorderColor}`;
      checkbox.textContent = "\u2713";
      checkbox.style.background = COLOR.checkboxFillColor;
      checkbox.style.fontSize = "16px";
      checkbox.style.fontWeight = "bold";
    }
    checkbox.addEventListener("click", () => {
      this.#onToggleClick();
    });
    return checkbox;
  }

  #createDisplayText() {
    const displayTextElement = document.createElement("span");
    displayTextElement.textContent = this.#line.displayText;
    displayTextElement.style.flex = "1";
    displayTextElement.style.overflow = "hidden";
    displayTextElement.style.textOverflow = "ellipsis";
    displayTextElement.style.whiteSpace = "pre";
    if (this.#line.commentedOut) {
      displayTextElement.style.opacity = "0.4";
    }
    return displayTextElement;
  }

  #createWeightButtonsContainer() {
    const weightButtonsContainer = document.createElement("div");
    weightButtonsContainer.style.display = "inline-flex";
    weightButtonsContainer.style.alignItems = "center";
    weightButtonsContainer.style.gap = "4px";
    weightButtonsContainer.style.marginLeft = "auto";
    return weightButtonsContainer;
  }

  #createWeightLabel(weightText) {
    const label = document.createElement("span");
    label.textContent = weightText;
    label.style.width = `${CONFIG.weightLabelWidth}px`;
    label.style.textAlign = "right";
    return label;
  }

  #createWeightButton(symbol, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = symbol;
    button.style.width = `${CONFIG.weightButtonSize}px`;
    button.style.height = `${CONFIG.weightButtonSize}px`;
    button.style.borderRadius = "4px";
    button.style.border = "0";
    button.style.background = COLOR.weightButtonFillColor;
    button.style.color = COLOR.weightButtonSymbolColor;
    button.style.fontSize = "16px";
    button.style.lineHeight = "1";
    button.style.padding = "0";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.cursor = "pointer";
    button.addEventListener("click", onClick);
    button.addEventListener("mouseenter", () => {
      button.style.background = COLOR.weightButtonFillColorHovered;
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = COLOR.weightButtonFillColor;
    });
    return button;
  }

  #createEmptyRow() {
    const emptyRow = document.createElement("div");
    emptyRow.style.height = `${CONFIG.lineHeight}px`;
    emptyRow.style.display = "flex";
    emptyRow.style.alignItems = "center";
    emptyRow.style.gap = `${CONFIG.checkboxMarginRight}px`;
    emptyRow.style.pointerEvents = "none";
    return emptyRow;
  }

  // ========================================
  // Event Handling
  // ========================================
  #onToggleClick() {
    this.#dispatchEvent(PromptPaletteDomUI.EVENT.TOGGLE_COMMENT);
  }

  #onWeightPlusClick() {
    this.#dispatchEvent(PromptPaletteDomUI.EVENT.WEIGHT_PLUS);
  }

  #onWeightMinusClick() {
    this.#dispatchEvent(PromptPaletteDomUI.EVENT.WEIGHT_MINUS);
  }

  #dispatchEvent(type) {
    this.element.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        detail: { index: this.#index },
      }),
    );
  }
}
