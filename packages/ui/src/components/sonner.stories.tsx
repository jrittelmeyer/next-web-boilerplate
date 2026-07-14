import { Button } from "@repo/ui/components/button";
import { Toaster, toast } from "@repo/ui/components/sonner";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Toaster",
  component: Toaster,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

// Toasts are imperative, so the story renders trigger buttons alongside the Toaster
// itself — the fired notifications need somewhere to land in the gallery. Flip the
// addon-themes toolbar to see them follow light/dark via next-themes.
export const Default: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={() => toast.success("Photo removed.")}>
        Success toast
      </Button>
      <Button variant="outline" onClick={() => toast.error("Could not save your changes.")}>
        Error toast
      </Button>
      <Button
        variant="outline"
        onClick={() => toast("Heads up", { description: "A neutral message with detail." })}
      >
        Message toast
      </Button>
      <Toaster />
    </div>
  ),
};
