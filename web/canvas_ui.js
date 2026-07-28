import { Line } from "./line.js";
import {
  calculateNodeHeight,
  findDelimiterWidget,
  findLineBreakWidget,
  findModeWidget,
  findTextWidget,
  hideWidget,
  hideWidgetAndKeepSpace,
  showWidget,
  validateDelimiterValue,
  validateLineBreakValue,
} from "./ui_utils.js";
import { TextLines } from "./text_lines.js";
import { SelectionDisplay } from "./selection_display.js";

const CONFIG = {
  minNodeHeight: 80,
  topNodePadding: 40,
  sideNodePadding: 14,
  lineHeight: 24,
  fontSize: 13,
  checkboxSize: 16,
  checkboxMarginRight: 6,
  weightLabelWidth: 34,
  weightLabelMarginRight: 2,
  weightButtonSize: 16,
  weightButtonGap: 4,
};

let colorCache = null;

export function setupCanvasUI(nodeType, app) {
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
    // Initialize Canvas UI for new nodes
    if (this.__nodeInitialized) {
      return;
    }
    this.__nodeInitialized = true;

    const textWidget = findTextWidget(this);
    if (textWidget) {
      this.__promptPaletteCanvasUI = new PromptPaletteCanvasUI(
        this,
        textWidget,
        app,
      );
    }
  };

  const origOnConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (data) {
    if (origOnConfigure) {
      origOnConfigure.call(this, data);
    }
    validateDelimiterValue(findDelimiterWidget(this));
    validateLineBreakValue(findLineBreakWidget(this));
    this.__promptPaletteCanvasUI?.applyModeLayout();
  };

  const origOnExecuted = nodeType.prototype.onExecuted;
  nodeType.prototype.onExecuted = function (message) {
    if (origOnExecuted) {
      origOnExecuted.apply(this, arguments);
    }
    this.__promptPaletteCanvasUI?.updateSelection(message);
  };

  const origOnDrawForeground = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    if (origOnDrawForeground) {
      origOnDrawForeground.call(this, ctx);
    }
    this.__promptPaletteCanvasUI?.draw(ctx);
  };
}

class PromptPaletteCanvasUI {
  static MODE = Object.freeze({
    EDIT: "edit",
    DISPLAY: "display",
  });
  static ACTION = Object.freeze({
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
  #clickableAreas;
  #toggleButton;
  #selectionDisplay;

  constructor(node, textWidget, app) {
    this.#node = node;
    this.#textWidget = textWidget;
    this.#delimiterWidget = findDelimiterWidget(node);
    this.#lineBreakWidget = findLineBreakWidget(node);
    this.#modeWidget = findModeWidget(node);
    this.#app = app;
    this.#mode = PromptPaletteCanvasUI.MODE.DISPLAY;
    this.#clickableAreas = [];
    this.#toggleButton = null;

    hideWidgetAndKeepSpace(this.#textWidget);
    hideWidget(this.#delimiterWidget);
    hideWidget(this.#lineBreakWidget);
    this.#addToggleButton();
    this.#selectionDisplay = new SelectionDisplay(node);
    this.#attachClickHandler();
    this.#bindModeWidget();
    this.applyModeLayout();
  }

  draw(ctx) {
    // The checkbox palette only exists in manual mode.
    if (this.#isAutoMode()) {
      return;
    }
    if (this.#mode !== PromptPaletteCanvasUI.MODE.DISPLAY) {
      return;
    }
    this.#drawCheckboxList(ctx);
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

  // Reconfigure which widgets are visible for the current selection mode.
  applyModeLayout() {
    if (this.#isAutoMode()) {
      // Auto mode: no checkbox palette. Show the plain widgets so the pool can
      // be edited, hide the Edit/Save toggle, and show the selection readout.
      hideWidget(this.#toggleButton);
      showWidget(this.#textWidget);
      showWidget(this.#delimiterWidget);
      showWidget(this.#lineBreakWidget);
      this.#selectionDisplay.setVisible(true);
    } else {
      showWidget(this.#toggleButton);
      this.#selectionDisplay.setVisible(false);
      this.#updateWidgetVisibility();
    }
    this.#app.graph.setDirtyCanvas(true);
  }

  updateSelection(message) {
    const selected = message?.selected;
    const text = Array.isArray(selected) ? selected[0] : selected;
    this.#selectionDisplay.setText(text);
  }

  // ========================================
  // Mode Management
  // ========================================
  #changeMode(mode) {
    this.#mode = mode;
    this.#updateWidgetVisibility();
    this.#updateToggleButtonLabel();
    this.#app.graph.setDirtyCanvas(true);
  }

  #updateWidgetVisibility() {
    if (this.#mode === PromptPaletteCanvasUI.MODE.EDIT) {
      if (this.#textWidget) showWidget(this.#textWidget);
      if (this.#delimiterWidget) showWidget(this.#delimiterWidget);
      if (this.#lineBreakWidget) showWidget(this.#lineBreakWidget);
    } else {
      if (this.#textWidget) hideWidgetAndKeepSpace(this.#textWidget);
      if (this.#delimiterWidget) hideWidget(this.#delimiterWidget);
      if (this.#lineBreakWidget) hideWidget(this.#lineBreakWidget);
    }
  }

  #updateToggleButtonLabel() {
    if (!this.#toggleButton) return;
    this.#toggleButton.name =
      this.#mode === PromptPaletteCanvasUI.MODE.EDIT ? "Save" : "Edit";
  }

  // ========================================
  // Widget Management
  // ========================================
  #addToggleButton() {
    this.#toggleButton = this.#node.addWidget(
      "button",
      "Edit",
      "edit_text",
      () => {
        this.#changeMode(
          this.#mode === PromptPaletteCanvasUI.MODE.EDIT
            ? PromptPaletteCanvasUI.MODE.DISPLAY
            : PromptPaletteCanvasUI.MODE.EDIT,
        );
      },
    );
    this.#toggleButton.serialize = false;

    const spacer = this.#node.addWidget("text", "", "");
    spacer.computeSize = () => [0, 6];
    spacer.draw = () => {};
    spacer.serialize = false;
  }

  // ========================================
  // Click Handling
  // ========================================
  #attachClickHandler() {
    const self = this;
    this.#node.onMouseDown = function (e, pos) {
      self.#handleMouseDown(pos);
    };
  }

  #handleMouseDown(pos) {
    if (this.#mode === PromptPaletteCanvasUI.MODE.EDIT) {
      return;
    }
    const clickedArea = this.#findClickedArea(pos);
    if (clickedArea) {
      this.#handleClickableAreaAction(clickedArea);
    }
  }

  #findClickedArea(pos) {
    const [x, y] = pos;
    for (const area of this.#clickableAreas) {
      if (
        x >= area.x &&
        x <= area.x + area.w &&
        y >= area.y &&
        y <= area.y + area.h
      ) {
        return area;
      }
    }
    return null;
  }

  #handleClickableAreaAction(area) {
    switch (area.action) {
      case PromptPaletteCanvasUI.ACTION.TOGGLE_COMMENT:
        this.#toggleLineComment(area.lineIndex);
        break;
      case PromptPaletteCanvasUI.ACTION.WEIGHT_PLUS:
        this.#adjustLineWeight(area.lineIndex, 0.1);
        break;
      case PromptPaletteCanvasUI.ACTION.WEIGHT_MINUS:
        this.#adjustLineWeight(area.lineIndex, -0.1);
        break;
    }
  }

  // ========================================
  // Data Operations
  // ========================================
  #toggleLineComment(lineIndex) {
    const textLines = new TextLines(this.#textWidget.value);
    textLines.toggleCommentAt(lineIndex);
    this.#textWidget.value = textLines.toString();
    this.#app.graph.setDirtyCanvas(true);
  }

  #adjustLineWeight(lineIndex, delta) {
    const textLines = new TextLines(this.#textWidget.value);
    textLines.adjustWeightAt(lineIndex, delta);
    this.#textWidget.value = textLines.toString();
    this.#app.graph.setDirtyCanvas(true);
  }

  // ========================================
  // Drawing
  // ========================================
  #drawCheckboxList(ctx) {
    if (this.#node.flags && this.#node.flags.collapsed) {
      return;
    }

    const text = this.#textWidget.value || "";
    const lines = text.split("\n");
    const textHeight = calculateNodeHeight(lines.length, CONFIG);

    if (this.#node.size[1] < textHeight) {
      this.#node.size[1] = textHeight;
      this.#app.graph.setDirtyCanvas(true);
    }

    if (text.trim() !== "") {
      this.#drawCheckboxItems(ctx, lines);
    } else {
      this.#drawEmptyMessage(ctx);
    }
  }

  #drawEmptyMessage(ctx) {
    ctx.fillStyle = getColors().inactiveTextColor;
    ctx.font = `${CONFIG.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("No Text", this.#node.size[0] / 2, this.#node.size[1] / 2);
  }

  #drawCheckboxItems(ctx, lines) {
    this.#clickableAreas = [];

    lines.forEach((lineText, index) => {
      const line = new Line(lineText);
      if (!line.hasPhraseText()) return;

      const y = CONFIG.topNodePadding + index * CONFIG.lineHeight;

      this.#drawCheckbox(ctx, line, y, index);
      this.#drawDisplayText(ctx, line, y);
      this.#drawWeightControls(ctx, line, y, index);
    });
  }

  #drawCheckbox(ctx, line, y, index) {
    const checkboxX = CONFIG.sideNodePadding;
    const checkboxY = y;
    const checkboxW = CONFIG.checkboxSize;
    const checkboxH = CONFIG.checkboxSize;

    this.#clickableAreas.push({
      x: checkboxX,
      y: checkboxY,
      w: checkboxW,
      h: checkboxH,
      lineIndex: index,
      action: PromptPaletteCanvasUI.ACTION.TOGGLE_COMMENT,
    });

    if (line.commentedOut) {
      ctx.strokeStyle = getColors().checkboxBorderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(checkboxX, checkboxY, checkboxW, checkboxH, 4);
      ctx.stroke();
    } else {
      ctx.fillStyle = getColors().checkboxFillColor;
      ctx.beginPath();
      ctx.roundRect(checkboxX, checkboxY, checkboxW, checkboxH, 4);
      ctx.fill();

      ctx.strokeStyle = getColors().checkboxSymbolColor;
      ctx.lineWidth = 2;
      const centerX = checkboxX + checkboxW / 2;
      const centerY = checkboxY + checkboxH / 2;
      const checkSize = checkboxW * 0.4;
      ctx.beginPath();
      ctx.moveTo(centerX - checkSize * 0.7, centerY + checkSize * 0.0);
      ctx.lineTo(centerX - checkSize * 0.3, centerY + checkSize * 0.5);
      ctx.lineTo(centerX + checkSize * 0.7, centerY - checkSize * 0.5);
      ctx.stroke();
    }
  }

  #drawDisplayText(ctx, line, y) {
    const colors = getColors();
    ctx.fillStyle = line.commentedOut
      ? colors.inactiveTextColor
      : colors.defaultTextColor;
    ctx.textAlign = "left";

    const isBold = line.weight !== 1.0;

    ctx.font = isBold
      ? `bold ${CONFIG.fontSize}px sans-serif`
      : `${CONFIG.fontSize}px sans-serif`;

    const checkboxCenter = y + CONFIG.checkboxSize / 2;
    const textBaseline = checkboxCenter + CONFIG.fontSize * 0.35;

    const textX =
      CONFIG.sideNodePadding + CONFIG.checkboxSize + CONFIG.checkboxMarginRight;

    // Calculate width of right-side elements
    const rightElementsWidth =
      CONFIG.weightLabelWidth +
      CONFIG.weightLabelMarginRight +
      CONFIG.weightButtonSize +
      CONFIG.weightButtonGap +
      CONFIG.weightButtonSize +
      CONFIG.sideNodePadding;
    const availableWidth = this.#node.size[0] - textX - rightElementsWidth;

    // Clip text to available width
    ctx.save();
    ctx.beginPath();
    ctx.rect(textX, y, availableWidth, CONFIG.lineHeight);
    ctx.clip();

    ctx.fillText(line.displayText, textX, textBaseline);

    ctx.restore();
  }

  #drawWeightControls(ctx, line, y, index) {
    const nodeWidth = this.#node.size[0];
    if (!line.hasPhraseText()) return;

    const weightText = line.weightText;
    const checkboxCenter = y + CONFIG.checkboxSize / 2;

    let currentX = nodeWidth - CONFIG.sideNodePadding;

    const plusButtonX = currentX - CONFIG.weightButtonSize;
    const plusButtonY = y;
    this.#drawWeightButton(
      ctx,
      plusButtonX,
      plusButtonY,
      "+",
      index,
      PromptPaletteCanvasUI.ACTION.WEIGHT_PLUS,
    );
    currentX = plusButtonX - CONFIG.weightButtonGap;

    const minusButtonX = currentX - CONFIG.weightButtonSize;
    const minusButtonY = y;
    this.#drawWeightButton(
      ctx,
      minusButtonX,
      minusButtonY,
      "-",
      index,
      PromptPaletteCanvasUI.ACTION.WEIGHT_MINUS,
    );
    currentX = minusButtonX - CONFIG.weightButtonGap;

    if (line.weight !== 1.0) {
      const textColors = getColors();
      ctx.fillStyle = line.commentedOut
        ? textColors.inactiveTextColor
        : textColors.defaultTextColor;
      ctx.textAlign = "right";
      ctx.font = `${CONFIG.fontSize}px sans-serif`;
      const textBaseline = checkboxCenter + CONFIG.fontSize * 0.35;
      ctx.fillText(
        weightText,
        currentX - CONFIG.weightLabelMarginRight,
        textBaseline,
      );
      ctx.textAlign = "left";
    }
  }

  #drawWeightButton(ctx, x, y, symbol, lineIndex, action) {
    const buttonSize = CONFIG.weightButtonSize;

    this.#clickableAreas.push({
      x: x,
      y: y,
      w: buttonSize,
      h: buttonSize,
      lineIndex: lineIndex,
      action: action,
    });

    ctx.fillStyle = getColors().weightButtonFillColor;
    ctx.beginPath();
    ctx.roundRect(x, y, buttonSize, buttonSize, 4);
    ctx.fill();

    ctx.strokeStyle = getColors().weightButtonSymbolColor;
    ctx.lineWidth = 2;
    const centerX = x + buttonSize / 2;
    const centerY = y + buttonSize / 2;
    const symbolSize = 6;

    ctx.beginPath();
    if (symbol === "+") {
      ctx.moveTo(centerX - symbolSize / 2, centerY);
      ctx.lineTo(centerX + symbolSize / 2, centerY);
      ctx.moveTo(centerX, centerY - symbolSize / 2);
      ctx.lineTo(centerX, centerY + symbolSize / 2);
    } else if (symbol === "-") {
      ctx.moveTo(centerX - symbolSize / 2, centerY);
      ctx.lineTo(centerX + symbolSize / 2, centerY);
    }
    ctx.stroke();
  }
}

// ========================================
// Color
// ========================================

function getColors() {
  // Cache theme-derived colors for performance.
  if (colorCache) {
    return colorCache;
  }
  const themeColors = getComfyUIThemeColors();
  colorCache = {
    defaultTextColor: themeColors.inputText,
    inactiveTextColor: themeColors.inputText + "66",
    checkboxBorderColor: themeColors.inputText + "80",
    checkboxFillColor: themeColors.inputText,
    checkboxSymbolColor: themeColors.comfyInputBg,
    weightButtonFillColor: themeColors.comfyInputBg,
    weightButtonSymbolColor: themeColors.inputText + "99",
  };
  return colorCache;
}

function getComfyUIThemeColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    comfyInputBg:
      expandHexColor(style.getPropertyValue("--comfy-input-bg").trim()) ||
      "#222222",
    inputText:
      expandHexColor(style.getPropertyValue("--input-text").trim()) ||
      "#dddddd",
  };
}

function expandHexColor(color) {
  if (!color || !color.startsWith("#")) return color;
  if (color.length === 4) {
    return (
      "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
    );
  }
  return color;
}
