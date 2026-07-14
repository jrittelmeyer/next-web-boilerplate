import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

// Dynamically generated 1200x630 social card (also reused for the Twitter card —
// see twitter-image.tsx). Rendered with next/og's ImageResponse (Satori) using
// its built-in default font, so there's no font file to ship — cross-platform and
// dependency-free. Colors are the slate theme (slate-900 bg / slate-50 + slate-400
// text). A real project would swap in brand artwork here.
export const alt = siteConfig.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        backgroundColor: "#0f172a",
        padding: "80px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 96,
          height: 96,
          borderRadius: 20,
          backgroundColor: "#f8fafc",
          color: "#0f172a",
          fontSize: 60,
          fontWeight: 700,
          marginBottom: 40,
        }}
      >
        N
      </div>
      <div style={{ fontSize: 72, fontWeight: 700, color: "#f8fafc", lineHeight: 1.1 }}>
        {siteConfig.name}
      </div>
      <div style={{ fontSize: 32, color: "#94a3b8", marginTop: 24, maxWidth: 900 }}>
        {siteConfig.description}
      </div>
    </div>,
    { ...size },
  );
}
