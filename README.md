# ComfyUI PromptPalette

A custom node for ComfyUI that makes prompt editing easier by allowing phrase switching with just mouse operations

![Example](examples/prompt-palette.png)

## Features

- **Enable/disable phrases** with checkboxes (manual mode)
- **Randomly pick phrases** with a seed (auto mode)
- **Adjust prompt weights** using +/- buttons
- **Combine with other prompts** using prefix input
- **Customize output format** with delimiter and line break options

## Modes

The `mode` widget switches between two ways of selecting phrases:

- **manual** (default): the original behaviour. Use the checkboxes to enable or
  disable each phrase; every enabled line is included in the output.
- **auto**: the checkboxes are hidden. On each run, `count` lines are picked at
  random from the text (using `seed`), and the selection is shown at the bottom
  of the node. `//` comment markers are ignored in this mode, so every non-empty
  line is a candidate. The `count` and `seed` widgets stay visible in both modes
  so `seed` can be connected to an external input.

## Installation

1. Clone into the `custom_nodes` directory of ComfyUI
2. Restart ComfyUI

## Usage

1. **Add node**: Find `Prompt Palette` in the node menu
2. **Edit phrases**:
   - Click the **Edit** button to switch to edit mode
   - Enter one phrase per line<br />
     <img src="examples/edit-phrases.png" alt="Edit phrases" width="320px" />
   - Click the **Save** button to complete editing
3. **Toggle phrases and adjust weights**:
   - **Toggle checkboxes** to enable/disable phrases
   - **Adjust prompt weights** using +/- buttons<br />
     <img src="examples/toggle-and-weight.png" alt="Toggle checkboxes and adjust prompt weights" width="320px" />
4. **Output**:
   - By default, selected phrases are output as comma-separated prompt text<br />
     <img src="examples/output.png" alt="Output" width="540px" />
   - Delimiter and line break settings can be changed in edit mode<br />
     <img src="examples/output-format.png" alt="Output Format" width="400px" />

## Changelog

### v1.4.0
- Added `mode` widget with `manual` (checkboxes) and `auto` (random pick) modes
- Added `count` and `seed` widgets for the auto mode random selection
- The resolved selection is shown at the bottom of the node in auto mode

### v1.3.0
- Added delimiter widget to separate phrases with comma, space, or nothing
- Added line_break widget to output as single line or multiple lines

### v1.2.0
- Support for ComfyUI Nodes 2.0
- Major code refactoring

### v1.1.0
- Updated UI style
