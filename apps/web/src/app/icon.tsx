import { ImageResponse } from "next/og";

// Generated favicon (auto-linked as <link rel="icon"> via the file convention).
// A slate-900 rounded tile with an "N" monogram — swap in a real favicon.ico /
// brand mark for production. Dependency-free (next/og default font).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0f172a",
        color: "#f8fafc",
        fontSize: 22,
        fontWeight: 700,
        borderRadius: 6,
      }}
    >
      N
    </div>,
    { ...size },
  );
}
