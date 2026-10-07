import { describe, expect, it } from "vitest";
import { hasMinimumImageResolution } from "./config";

describe("hasMinimumImageResolution", () => {
  it("tolera uma diferença de um pixel em cada dimensão", () => {
    expect(hasMinimumImageResolution(899, 1200)).toBe(true);
    expect(hasMinimumImageResolution(900, 1199)).toBe(true);
    expect(hasMinimumImageResolution(899, 1199)).toBe(true);
  });

  it("continua rejeitando imagens mais de um pixel abaixo do mínimo", () => {
    expect(hasMinimumImageResolution(898, 1200)).toBe(false);
    expect(hasMinimumImageResolution(900, 1198)).toBe(false);
    expect(hasMinimumImageResolution(899, 1198)).toBe(false);
  });
});
