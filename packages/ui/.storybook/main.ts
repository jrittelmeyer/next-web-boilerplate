import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

// @repo/ui is a standalone React component library (zero Next.js dependency —
// it imports `next-themes`, a plain React context, and nothing from `next/*`),
// so the lighter `@storybook/react-vite` framework is the right fit. Tailwind v4
// is processed by the official `@tailwindcss/vite` plugin, added via `viteFinal`;
// the shared slate tokens load through `.storybook/tailwind.css` (see preview.ts).
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-themes"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // Privacy-respecting default for a template — adopters' gallery runs don't phone home.
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => {
    viteConfig.plugins ??= [];
    viteConfig.plugins.push(tailwindcss());
    return viteConfig;
  },
};

export default config;
