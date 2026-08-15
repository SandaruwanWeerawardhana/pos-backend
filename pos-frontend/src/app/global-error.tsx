"use client";

// Catches errors thrown by the root layout itself, where `error.tsx` cannot
// run. It must render its own <html>/<body> because the failing layout never
// produced one.
export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "32px",
          textAlign: "center",
          margin: 0,
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>
          The application failed to start
        </h1>
        <p style={{ fontSize: "14px", color: "#52525b", maxWidth: "28rem" }}>
          Reload the page to try again. Sales saved on this device are stored in
          local storage and are not affected.
        </p>
        {error.digest && (
          <p style={{ fontSize: "12px", color: "#71717a" }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: "44px",
            padding: "0 20px",
            borderRadius: "8px",
            border: "none",
            background: "#0058be",
            color: "#fff",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
