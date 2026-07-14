import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileQuestion, Inbox } from "lucide-react";

const meta = {
  title: "Components/EmptyState",
  component: EmptyState,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    title: "No posts yet",
    description: "Create your first post to see it listed here.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIconAndAction: Story = {
  args: {
    icon: <Inbox className="size-12" />,
    action: <Button>New post</Button>,
  },
};

export const NotFound: Story = {
  args: {
    icon: <FileQuestion className="size-12" />,
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
    action: (
      <Button variant="outline" asChild>
        <a href="/">Go home</a>
      </Button>
    ),
  },
};
