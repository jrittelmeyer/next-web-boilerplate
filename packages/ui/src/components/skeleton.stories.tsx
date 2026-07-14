import { Skeleton } from "@repo/ui/components/skeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

// A single line — the simplest placeholder (e.g. a count or a heading).
export const Line: Story = {
  render: () => <Skeleton className="h-4 w-48" />,
};

// A circle — override the rounding for an avatar placeholder.
export const Circle: Story = {
  render: () => <Skeleton className="size-12 rounded-full" />,
};

// Composed into the shape of a small card: an avatar + two text lines. The pattern a
// real fallback follows — mirror the layout of the content the skeleton stands in for.
export const Card: Story = {
  render: () => (
    <div className="flex w-72 items-center gap-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  ),
};
