import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";
import "./tailwind.css";

// Dark mode is class-based (`@custom-variant dark (&:is(.dark *))` in the shared
// base.css). `withThemeByClassName` toggles a `dark` class on the preview <html>
// — the same mechanism next-themes drives at runtime in the app — so the toolbar
// switch flips every component's tokens. The iframe body picks up
// `bg-background`/`text-foreground` from base.css's base layer.
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
  ],
};

export default preview;
