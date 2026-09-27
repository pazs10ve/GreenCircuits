import { ImageResponse } from "next/og"

export const alt = "GreenCircuits: research and strategy testing for Indian markets"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** The link preview for LinkedIn, X and Slack. */
export default function OpengraphImage() {
  const bars = [38, 52, 44, 61, 57, 73, 66, 84, 79, 96, 90, 112]
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0e1512",
          color: "#e8efe9",
          fontFamily: "sans-serif",
          backgroundImage:
            "linear-gradient(rgba(232,239,233,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(232,239,233,0.05) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect x="1" y="1" width="30" height="30" rx="8" fill="#13211b" stroke="#2f6b4f" strokeWidth="1" />
            <path d="M6 22 H12 L16 14 H20 L23 9" fill="none" stroke="#e0914a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="22" r="2.1" fill="#e0914a" />
            <circle cx="24" cy="8" r="3.4" fill="#3ecf8e" />
            <circle cx="24" cy="8" r="1.4" fill="#13211b" />
          </svg>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            Green<span style={{ color: "#3ecf8e" }}>Circuits</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 700 }}>
            <div style={{ display: "flex", flexWrap: "wrap", fontSize: 68, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>
              Indian markets, researched and&nbsp;<span style={{ color: "#e0914a" }}>backtested.</span>
            </div>
            <div style={{ fontSize: 26, color: "#9fb0a6" }}>
              Option chains with Greeks · screener · strategy lab · NSE, BSE, MCX
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ width: 16, height: h, borderRadius: 3, background: i % 4 === 2 ? "#e5484d" : "#3ecf8e", opacity: 0.85 }} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
