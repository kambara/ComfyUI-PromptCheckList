// Read-only area that shows the phrases picked in auto mode.
// Implemented as a DOM widget so it works in both Nodes 1.0 (Canvas) and
// Nodes 2.0 (DOM) rendering modes.

const DISPLAY_WIDGET_NAME = "promptpalette_selection";

const PLACEHOLDER = "(run the prompt to see the auto selection)";

export class SelectionDisplay {
  #element;
  #widget;

  constructor(node) {
    this.#element = this.#createElement();
    this.#widget = node.addDOMWidget(
      DISPLAY_WIDGET_NAME,
      "promptpalette_selection",
      this.#element,
      {},
    );
    this.#widget.serialize = false;
    if (this.#widget.options) {
      this.#widget.options.margin = 0;
    }
    this.setVisible(false);
  }

  #createElement() {
    const element = document.createElement("div");
    const style = element.style;
    style.width = "100%";
    style.boxSizing = "border-box";
    style.whiteSpace = "pre-wrap";
    style.wordBreak = "break-word";
    style.fontSize = "12px";
    style.lineHeight = "1.4";
    style.padding = "6px 8px";
    style.borderRadius = "6px";
    style.background =
      "var(--comfy-input-bg, var(--component-node-widget-background, #222))";
    style.color = "var(--input-text, var(--text-primary, #ddd))";
    style.opacity = "0.85";
    style.minHeight = "1.4em";
    element.textContent = PLACEHOLDER;
    return element;
  }

  setText(text) {
    this.#element.textContent = text && text.length ? text : PLACEHOLDER;
  }

  setVisible(visible) {
    this.#widget.hidden = !visible;
    if (this.#widget.options) {
      this.#widget.options.hidden = !visible;
    }
    this.#element.style.display = visible ? "" : "none";
  }
}
