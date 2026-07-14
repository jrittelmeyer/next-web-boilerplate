import { ImageResponse } from "next/og";

// Generated Apple touch icon (auto-linked as <link rel="apple-touch-icon"> via the
// file convention). Same monogram as icon.tsx at the 180x180 home-screen size.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        fontSize: 110,
        fontWeight: 700,
        borderRadius: 36,
      }}
    >
      N
    </div>,
    { ...size },
  );
}
