"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown by the root layout itself. Renders its own document and
 * does NOT get the app's global styles or theme, so this UI is deliberately
 * plain and inline-styled.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#71717a" }}>
          Spotter hit an unexpected error.
          {error.digest ? ` Reference: ${error.digest}.` : ""}
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            height: "2.5rem",
            padding: "0 1rem",
            borderRadius: "0.375rem",
            border: 0,
            background: "#2563eb",
            color: "#fff",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
