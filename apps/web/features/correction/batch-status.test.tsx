import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BatchStatus } from "./batch-status";

const baseFile = {
  id: "file-1",
  file_name: "cartao.png",
  status: "failed",
  error_code: "qr_not_detected",
  error_message: null,
  confidence: null,
  algorithm_version: "opencv-v0.2",
  qr_status: "not_detected",
  qr_strategy: null,
  attempt_count: 1,
  processing_started_at: "2026-07-24T20:00:00.000Z",
  processed_at: "2026-07-24T20:00:05.000Z",
  answer_sheets: null,
};

describe("BatchStatus", () => {
  it("oferece reprocessamento para uma falha recuperável", () => {
    render(<BatchStatus batchId="batch-1" initialFiles={[baseFile]} manualCandidates={[]} />);

    expect(screen.getByRole("button", { name: "Reprocessar cartão" })).toBeInTheDocument();
    expect(screen.getByText(/O QR Code não foi localizado/)).toBeInTheDocument();
  });

  it("não oferece reprocessamento para resultado concluído", () => {
    render(
      <BatchStatus
        batchId="batch-1"
        initialFiles={[{ ...baseFile, status: "completed", error_code: null }]}
        manualCandidates={[]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Reprocessar cartão" })).not.toBeInTheDocument();
  });
});
