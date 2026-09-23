import { describe, expect, it } from "vitest";
import { cn, getInitials } from "@/lib/utils";

describe("cn", () => {
  it("combina classes e mantém a última regra Tailwind conflitante", () => {
    expect(cn("px-2 text-sm", false, "px-4")).toBe("text-sm px-4");
  });
});

describe("getInitials", () => {
  it("usa no máximo os dois primeiros nomes", () => {
    expect(getInitials("  davi pereira silva ")).toBe("DP");
  });

  it("trata valor vazio sem lançar erro", () => {
    expect(getInitials("   ")).toBe("");
  });
});
