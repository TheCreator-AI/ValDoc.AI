import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnterpriseWorkspace from "./EnterpriseWorkspace";

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );

describe("EnterpriseWorkspace facts folder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse({
          id: "u1",
          email: "andrew@qa.org",
          fullName: "Andrew",
          role: "ADMIN",
          organization: { id: "org1", name: "QA Org" }
        });
      }
      if (url.endsWith("/api/auth/organizations")) {
        return jsonResponse([{ id: "org1", name: "QA Org" }]);
      }
      if (url.endsWith("/api/machines")) {
        return jsonResponse([
          { id: "m1", name: "Freezer", modelNumber: "TSX2320FA20", manufacturer: "Thermo" }
        ]);
      }
      if (url.endsWith("/api/jobs")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/templates")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/machines/m1/units")) {
        return jsonResponse([
          { id: "u1", unitCode: "TSX-1", status: "ACTIVE" },
          { id: "u2", unitCode: "TSX-2", status: "ACTIVE" }
        ]);
      }
      if (url.endsWith("/api/machines/m1/unit-groups")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/machines/m1/documents")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/machines/m1/facts")) {
        return jsonResponse([
          {
            id: "f1",
            factType: "RANGE",
            key: "temperature_range",
            value: "120 +/- 10%",
            units: "V",
            sourceRef: "manual p.12",
            confidence: 0.95,
            createdAt: "2026-02-17T00:00:00.000Z"
          }
        ]);
      }
      if (url.endsWith("/api/machines/m1/uploads")) {
        return jsonResponse([
          {
            id: "sd1",
            title: "TSX2320 User Manual",
            version: "v2.1",
            uploadedAt: "2026-02-17T00:00:00.000Z"
          }
        ]);
      }
      if (url.includes("/api/audit-events")) {
        return jsonResponse([
          {
            id: "ae1",
            timestamp: "2026-02-18T10:00:00.000Z",
            action: "template.create",
            entityType: "DocumentTemplate",
            entityId: "tpl_01",
            actor: { email: "andrew@qa.org", fullName: "Andrew", role: "ADMIN" }
          }
        ]);
      }
      if (url.endsWith("/api/admin/system-time-status")) {
        return jsonResponse({
          serverTimeUtc: "2026-02-18T00:00:00.000Z",
          appTimezone: "UTC",
          ntp: {
            status: "ASSUMED_HOST_MANAGED",
            lastSyncUtc: null,
            assumption: "NTP is managed by deployment host."
          }
        });
      }
      return jsonResponse({ error: "Not found" }, 404);
    });
  });

  it("shows saved facts in a collapsible facts folder", async () => {
    render(<EnterpriseWorkspace />);

    await waitFor(() => {
      expect(screen.getByText("Folder: Setpoints")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("m1");
    });
    expect(screen.getByText("2. Units and Governing Documents")).toBeInTheDocument();
    expect(screen.getByText("3. Unit Records and Documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Template Generator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Equipment and Units" })).toBeInTheDocument();
    expect(screen.getByText("Organization: QA Org | User: Andrew (ADMIN)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equipment Setpoints (MVP Manual Entry)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Equipment Setpoints (MVP Manual Entry)" }));
    expect(await screen.findByRole("button", { name: "Add Fact" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Equipment Setpoints (MVP Manual Entry)" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Add Fact" })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Equipment Setpoints (MVP Manual Entry)" }));
    expect(await screen.findByRole("button", { name: "Add Fact" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Import Facts JSON" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Source ref (page/section)")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Confidence 0-1")).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "m1" } });
    await screen.findByText("RANGE");
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "u1" } });
    expect(await screen.findByRole("button", { name: "Unit Details (TSX-1)" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Serial Number (S/N)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unit Details (TSX-1)" }));
    expect(await screen.findByText("Serial Number (S/N):")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Unit Details" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Unit Details" }));
    expect(await screen.findByPlaceholderText("Serial Number (S/N)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unit Details (TSX-1)" }));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Serial Number (S/N)")).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("cell", { name: "temperature_range" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Folder: Setpoints" }));

    expect(await screen.findByRole("cell", { name: "temperature_range" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "120 V +/- 10%" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Folder: Document Uploads" }));
    expect(await screen.findByRole("cell", { name: "TSX2320 User Manual" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "v2.1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Manage Documents" }));
    expect(await screen.findByText("2. Drag-and-Drop Upload")).toBeInTheDocument();
    expect(screen.queryByText("Template Builder")).not.toBeInTheDocument();
    expect(screen.queryByText("Generate Pre-Execution (URS to IOQ)")).not.toBeInTheDocument();
    expect(screen.getByText("Generate Post-Execution Summaries")).toBeInTheDocument();
    const documentSelects = screen.getAllByRole("combobox");
    const sourceTypeSelect = documentSelects[1];
    fireEvent.change(sourceTypeSelect, { target: { value: "EXECUTED_IOQ" } });
    expect(await screen.findByLabelText("Executed IOQ Unit")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "TSX-1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Template Generator" }));
    expect(await screen.findByText("Template Builder")).toBeInTheDocument();
    expect(screen.getByText("Review and Export")).toBeInTheDocument();
    expect(screen.queryByText("1. Equipment Scope")).not.toBeInTheDocument();
    expect(screen.queryByText("2. Units and Governing Documents")).not.toBeInTheDocument();
    expect(screen.queryByText("3. Unit Records and Documents")).not.toBeInTheDocument();
  }, 15000);

  it("shows session loading screen before auth check completes", async () => {
    let resolveSession: () => void = () => undefined;
    const sessionPromise = new Promise<Response>((resolve) => {
      resolveSession = () =>
        resolve(
          new Response(
            JSON.stringify({
              id: "u1",
              email: "andrew@qa.org",
              fullName: "Andrew",
              role: "ADMIN",
              organization: { id: "org1", name: "QA Org" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
    });

    vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/auth/organizations")) {
        return jsonResponse([{ id: "org1", name: "QA Org" }]);
      }
      if (url.endsWith("/api/auth/me")) {
        return sessionPromise;
      }
      if (url.endsWith("/api/machines") || url.endsWith("/api/jobs") || url.endsWith("/api/templates")) {
        return jsonResponse([]);
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<EnterpriseWorkspace />);
    expect(screen.getByText("Checking session...")).toBeInTheDocument();

    resolveSession();
    await screen.findByRole("button", { name: "View Equipment and Units" });
  });

  it("shows organization selector on login screen", async () => {
    vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/auth/organizations")) {
        return jsonResponse([{ id: "org-amnion", name: "Amnion" }]);
      }
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse({ error: "Not authenticated" }, 401);
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<EnterpriseWorkspace />);
    expect(await screen.findByRole("combobox", { name: "Organization" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Amnion" })).toBeInTheDocument();
  });

  it("renders Export Configuration as a button left of Refresh and navigates in same tab", async () => {
    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: assignMock }
    });

    try {
      render(<EnterpriseWorkspace />);
      const exportButtons = await screen.findAllByRole("button", { name: "Export Configuration" });
      const exportButton = exportButtons[exportButtons.length - 1];
      const controlsRow = exportButton.parentElement as HTMLElement;
      const refreshButton = controlsRow?.querySelector("button:nth-of-type(2)") as HTMLButtonElement;

      expect(exportButton.tagName).toBe("BUTTON");
      expect(refreshButton?.textContent).toBe("Refresh");
      expect(exportButton.className).toContain("topBarAction");
      expect(refreshButton.className).toContain("topBarAction");
      expect(controlsRow.className).toContain("topBarControls");
      expect(exportButton.compareDocumentPosition(refreshButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      fireEvent.click(exportButton);
      expect(assignMock).toHaveBeenCalledWith("/export-configuration");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation
      });
    }
  });
});


