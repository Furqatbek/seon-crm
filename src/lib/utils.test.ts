import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps a type-scale class next to a text colour", () => {
    expect(cn("text-caption", "text-success")).toBe("text-caption text-success");
    expect(cn("text-body font-medium", "text-bg")).toBe("text-body font-medium text-bg");
  });

  it("lets a later class override a token class of the same kind", () => {
    expect(cn("text-body", "text-footnote")).toBe("text-footnote");
    expect(cn("text-text", "text-danger")).toBe("text-danger");
    expect(cn("h-control", "h-10")).toBe("h-10");
    expect(cn("rounded-control", "rounded-full")).toBe("rounded-full");
    expect(cn("size-icon", "size-8")).toBe("size-8");
  });
});
