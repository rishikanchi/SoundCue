// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClinicianReportShareButton } from "./ClinicianReportShareButton";

describe("clinician report sharing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the authenticated trend PDF and opens the native file share menu", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const fetchReport = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF-test"], { type: "application/pdf" }),
    });
    vi.stubGlobal("fetch", fetchReport);
    Object.defineProperties(navigator, {
      canShare: { configurable: true, value: () => true },
      share: { configurable: true, value: share },
    });

    render(<ClinicianReportShareButton pdfUrl="/api/reports/clinician-trends/pdf" />);
    fireEvent.click(screen.getByRole("button", { name: "Share report" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(fetchReport).toHaveBeenCalledWith(
      "/api/reports/clinician-trends/pdf",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(share.mock.calls[0][0].files[0]).toMatchObject({
      name: "soundcue-parkinsons-trend-report.pdf",
      type: "application/pdf",
    });
  });
});
