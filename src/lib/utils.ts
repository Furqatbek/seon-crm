import { createCn } from "cn/config";

/**
 * Class merging that knows our token names from src/styles/tokens.css.
 * Without this, "text-caption text-success" would be read as two text
 * colours and the font size would be dropped.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ["large-title", "title", "headline", "body", "footnote", "caption"],
      radius: ["inner", "control", "card", "sheet"],
      shadow: ["float"],
      ease: ["fast", "sheet"],
      blur: ["frost"],
      spacing: ["sidebar", "sheet", "content", "control", "control-touch", "row", "icon"],
    },
  },
});
