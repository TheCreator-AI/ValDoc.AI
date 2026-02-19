import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ValDocApp from "./ValDocApp";

describe("ValDocApp", () => {
  it("submits text and renders report", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "pass",
        score: 92,
        summary: "Looks good.",
        issues: [],
        stats: { wordCount: 220, requiredSections: [], missingSections: [] }
      })
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<ValDocApp />);

    fireEvent.change(screen.getByLabelText(/document text/i), {
      target: { value: "# Title\n\n## Summary\nHello" }
    });

    fireEvent.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => {
      expect(screen.getByText(/validation report/i)).toBeInTheDocument();
      expect(screen.getByText(/score/i)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalled();
    });

    vi.unstubAllGlobals();
  });
});
