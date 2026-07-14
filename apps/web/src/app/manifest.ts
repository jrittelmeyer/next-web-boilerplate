import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

// Generates /manifest.webmanifest (auto-linked from <head> via the file
// convention). theme_color is slate-900 to match the shipped slate design tokens.
// The icons reference the generated /icon and /apple-icon routes — a real PWA
// should also add maskable 192x192 + 512x512 icons here for install prompts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: "NWB",
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
