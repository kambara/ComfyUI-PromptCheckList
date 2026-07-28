import hashlib
import os
import random


class PromptPalette:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": (
                    "STRING",
                    {"default": "", "multiline": True},
                ),
                "delimiter": (
                    ["comma", "space", "none"],
                    {"default": "comma"},
                ),
                "line_break": (
                    "BOOLEAN",
                    {"default": True},
                ),
                "mode": (
                    ["manual", "auto"],
                    {
                        "default": "manual",
                        "tooltip": "manual: pick lines with the checkboxes. "
                        "auto: pick 'count' random lines using 'seed'.",
                    },
                ),
                "count": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 1000,
                        "tooltip": "Auto mode only: how many lines to pick at random.",
                    },
                ),
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0xFFFFFFFFFFFFFFFF,
                        "control_after_generate": True,
                        "tooltip": "Auto mode only: random seed for the selection.",
                    },
                ),
            },
            "optional": {"prefix": ("STRING", {"forceInput": True})},
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "process"
    CATEGORY = "utils"

    def process(
        self,
        text,
        delimiter,
        line_break,
        mode="manual",
        count=1,
        seed=0,
        prefix=None,
        unique_id=None,
    ):
        lines = text.split("\n")

        if mode == "auto":
            phrases = self._collect_auto_phrases(lines, count, seed, unique_id)
        else:
            phrases = self._collect_manual_phrases(lines)

        # Add suffix based on delimiter setting
        suffix = ", " if delimiter == "comma" else " " if delimiter == "space" else ""
        phrases = [phrase + suffix for phrase in phrases]

        # Join lines based on line_break setting
        if line_break:
            result = "\n".join(phrases)
        else:
            result = "".join(phrases)

        # Add prefix if provided
        if prefix:
            if result:
                if line_break:
                    result = prefix + "\n" + result
                else:
                    result = prefix + result
            else:
                result = prefix

        # Expose the resolved selection to the frontend (shown in auto mode).
        return {"ui": {"selected": [result]}, "result": (result,)}

    def _collect_manual_phrases(self, lines):
        """Manual mode: keep every non-empty line that is not commented out."""
        phrases = []
        for line in lines:
            # Skip empty lines
            if not line.strip():
                continue
            # Skip commented lines
            if line.strip().startswith("//"):
                continue
            # Remove inline comments
            if "//" in line:
                line = line.split("//")[0].rstrip()
            phrases.append(line)
        return phrases

    def _collect_auto_phrases(self, lines, count, seed, unique_id):
        """Auto mode: pick `count` random lines. Comments are ignored, so every
        non-empty line is a candidate and the '//' markers are stripped out."""
        candidates = []
        for index, line in enumerate(lines):
            phrase = self._strip_comments(line)
            if phrase:
                # Keep the original index so the picked lines stay in text order.
                candidates.append((index, phrase))

        if not candidates:
            return []

        pick_count = min(max(count, 0), len(candidates))
        if pick_count <= 0:
            return []

        rng = random.Random(self._effective_seed(seed, unique_id))
        picked = rng.sample(candidates, pick_count)
        picked.sort(key=lambda item: item[0])
        return [phrase for _, phrase in picked]

    def _effective_seed(self, seed, unique_id):
        """Derive a per-node seed so that chaining several Prompt Palette nodes
        with the same 'seed' value doesn't correlate their picks: random.Random
        instances seeded identically consume the same underlying bit stream,
        which biases combos when nodes share a seed (e.g. two palettes wired to
        the same seed widget). Mixing in the node's unique_id keeps the result
        deterministic per node while decorrelating it from other nodes."""
        digest = hashlib.sha256(f"{seed}:{unique_id}".encode()).digest()
        return int.from_bytes(digest[:8], "big")

    def _strip_comments(self, line):
        """Remove a leading '// ' marker and any inline '//' comment."""
        stripped = line.strip()
        if stripped.startswith("//"):
            stripped = stripped[2:]
        if "//" in stripped:
            stripped = stripped.split("//")[0]
        return stripped.strip()


NODE_CLASS_MAPPINGS = {"PromptPalette": PromptPalette}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptPalette": "Prompt Palette"}
WEB_DIRECTORY = os.path.join(os.path.dirname(os.path.realpath(__file__)), "web")
