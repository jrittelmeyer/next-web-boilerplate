import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { ThemeToggle } from "@repo/ui/components/theme-toggle";
import type { Meta, StoryObj } from "@storybook/react-vite";

// ThemeToggle calls next-themes' `useTheme`, so the story mounts the same
// `ThemeProvider` the app uses in its root layout. Clicking a menu item drives
// dark mode for real (it toggles the `dark` class on <html>, the same class the
// toolbar switch uses) — this is the one interactive story in the gallery.
// Explicit annotation (not `satisfies`): a decorator function in `meta` makes the
// inferred type non-portable (TS2883), and this story carries no args to preserve.
const meta: Meta<typeof ThemeToggle> = {
  title: "Components/ThemeToggle",
  component: ThemeToggle,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
