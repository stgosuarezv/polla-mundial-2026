"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface StatusColumnsToggleProps {
  label: string;
  children: ReactNode;
}

// Shows/hides the two status columns (next-round completion and podio) in the
// server-rendered table below: cells carry data-status-col and globals.css
// hides them inside .hide-status-cols.
export function StatusColumnsToggle({
  label,
  children,
}: StatusColumnsToggleProps) {
  const [show, setShow] = useState(true);

  return (
    <div className="space-y-2">
      <div className="flex justify-end print:hidden">
        <Button
          size="sm"
          variant={show ? "default" : "outline"}
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
        >
          {label}
        </Button>
      </div>
      <div className={show ? undefined : "hide-status-cols"}>{children}</div>
    </div>
  );
}
