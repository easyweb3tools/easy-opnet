"use client";

import { useCallback, useEffect, useState } from "react";

interface CopyTextButtonProps {
  readonly text: string;
  readonly className?: string;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function CopyTextButton({ text, className = "" }: CopyTextButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status === "idle") return;

    const timer = window.setTimeout(() => setStatus("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const onCopy = useCallback(async () => {
    try {
      await copyToClipboard(text);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }, [text]);

  const label = status === "copied" ? "Copied" : status === "error" ? "Retry" : "Copy";

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`rounded-md border border-border px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-background hover:text-text-primary ${className}`}
      aria-label="Copy skill prompt"
      title="Copy prompt"
    >
      {label}
    </button>
  );
}
