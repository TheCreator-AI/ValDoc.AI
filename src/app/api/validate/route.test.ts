import { describe, it, expect } from "vitest";
import { POST } from "./route";

describe("POST /api/validate", () => {
  it("returns 400 for missing text", async () => {
    const request = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns a validation report", async () => {
    const request = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "# Title\n\n## Summary\nA summary.\n\n## Scope\nDetails.\n\n## Risks\nNone.\n\n## Data Sources\nInternal.\n\n" + "word ".repeat(220)
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe("pass");
    expect(payload.score).toBeGreaterThan(0);
  });
});
