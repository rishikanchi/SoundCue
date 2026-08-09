"use client";

import { Printer } from "lucide-react";

export function PrintReportButton() {
  return (
    <button className="button button--secondary" type="button" onClick={() => window.print()}>
      <Printer aria-hidden="true" size={20} /> Print report
    </button>
  );
}
