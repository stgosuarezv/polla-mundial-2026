"use client";

import { useTheme } from "next-themes";

export function ExtraTimeBanner({ message }: { message: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const textColor = isDark ? "#93c5fd" : "#1d4ed8";
  const bgColor = isDark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)";
  const borderColor = isDark ? "rgba(59,130,246,0.30)" : "rgba(59,130,246,0.30)";

  return (
    <div
      className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
      style={{ color: textColor, backgroundColor: bgColor, borderColor }}
    >
      <span className="mt-0.5 shrink-0">ℹ️</span>
      <span>{message}</span>
    </div>
  );
}
