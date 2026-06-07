"use client";

import { Button } from "@/components/ui/button";

interface PdfButtonProps {
  label: string;
}

export function PdfButton({ label }: PdfButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      {label}
    </Button>
  );
}
