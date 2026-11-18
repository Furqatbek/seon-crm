import { describe, expect, it } from "vitest";

import { MIN_CONTRAST, contrastRatio, darken, hasEnoughContrast, isHexColour, luminance } from "./contrast";
import { HISTORY_LIMIT, MERGE_WINDOW_MS, canRedo, canUndo, commit, createHistory, redo, undo } from "./history";

describe("undo and redo", () => {
  const typed = (values: string[]) => values.reduce((history, value) => commit(history, value), createHistory("start"));

  it("undo goes back one change at a time and redo comes forward again", () => {
    let history = typed(["a", "b", "c"]);
    expect(history.present).toBe("c");
    history = undo(history);
    expect(history.present).toBe("b");
    history = undo(undo(history));
    expect(history.present).toBe("start");
    expect(canUndo(history)).toBe(false);
    expect(undo(history)).toBe(history);

    history = redo(history);
    expect(history.present).toBe("a");
    history = redo(redo(history));
    expect(history.present).toBe("c");
    expect(canRedo(history)).toBe(false);
    expect(redo(history)).toBe(history);
  });

  it("a new change after an undo forgets what was undone", () => {
    let history = undo(typed(["a", "b"]));
    expect(canRedo(history)).toBe(true);
    history = commit(history, "x");
    expect(canRedo(history)).toBe(false);
    expect(undo(history).present).toBe("a");
  });

  it("keeps the last 50 changes and no more", () => {
    let history = typed(Array.from({ length: 60 }, (_, n) => `v${n + 1}`));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    for (let n = 0; n < HISTORY_LIMIT; n += 1) history = undo(history);
    // Fifty steps back from v60 is v10: the first ten are gone.
    expect(history.present).toBe("v10");
    expect(canUndo(history)).toBe(false);
    for (let n = 0; n < HISTORY_LIMIT; n += 1) history = redo(history);
    expect(history.present).toBe("v60");
  });

  it("the same state again is not a change", () => {
    const history = typed(["a"]);
    expect(commit(history, "a")).toBe(history);
  });

  it("typing in one input is one step; another input, or a pause, starts a new one", () => {
    let history = createHistory("");
    history = commit(history, "S", { key: "title", at: 1_000 });
    history = commit(history, "Sa", { key: "title", at: 1_200 });
    history = commit(history, "Sal", { key: "title", at: 1_500 });
    expect(history.past).toEqual([""]);
    expect(undo(history).present).toBe("");

    history = commit(history, "Sal!", { key: "subtitle", at: 1_600 });
    expect(history.past).toEqual(["", "Sal"]);
    history = commit(history, "Sal!?", { key: "subtitle", at: 1_600 + MERGE_WINDOW_MS });
    expect(history.past).toEqual(["", "Sal", "Sal!"]);
    // A change without a key never merges.
    history = commit(commit(history, "one", { at: 5_000 }), "two", { at: 5_001 });
    expect(undo(history).present).toBe("one");
  });

  it("typing straight after an undo starts a new step", () => {
    let history = commit(createHistory("a"), "ab", { key: "title", at: 100 });
    history = undo(history);
    history = commit(history, "ax", { key: "title", at: 200 });
    expect(undo(history).present).toBe("a");
  });
});

describe("the contrast function", () => {
  it("is 21 for black on white, 1 for the same colour, and the same both ways round", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#F7941D", "#F7941D")).toBe(1);
    expect(contrastRatio("#1D1D1F", "#F7941D")).toBe(contrastRatio("#F7941D", "#1D1D1F"));
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("matches known pairs", () => {
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#FF0000", "#FFFFFF")).toBeCloseTo(4.0, 1);
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 10);
  });

  it("warns below 4.5:1 and not from 4.5:1 up", () => {
    expect(MIN_CONTRAST).toBe(4.5);
    expect(hasEnoughContrast("#767676", "#FFFFFF")).toBe(true);
    expect(hasEnoughContrast("#777777", "#FFFFFF")).toBe(false);
    // The brand orange: dark text passes on it, white text does not.
    expect(hasEnoughContrast("#1D1D1F", "#F7941D")).toBe(true);
    expect(hasEnoughContrast("#FFFFFF", "#F7941D")).toBe(false);
  });

  it("does not judge a colour that is still being typed", () => {
    expect(isHexColour("#F7941D")).toBe(true);
    for (const unfinished of ["#F79", "F7941D", "#F7941G", ""]) {
      expect(isHexColour(unfinished)).toBe(false);
      expect(hasEnoughContrast(unfinished, "#FFFFFF")).toBe(true);
    }
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow(RangeError);
  });

  it("darkens a background by its overlay", () => {
    expect(darken("#FFFFFF", 0)).toBe("#FFFFFF");
    expect(darken("#FFFFFF", 50)).toBe("#808080");
    expect(darken("#F7941D", 80)).toBe("#311E06");
    expect(darken("#FFFFFF", 100)).toBe("#000000");
  });
});
