import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Label",
  component: Label,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { children: "Email" },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <Label {...args} htmlFor="label-default" />,
};

export const WithControl: Story = {
  render: (args) => (
    <div className="flex w-72 flex-col gap-2">
      <Label {...args} htmlFor="label-input" />
      <Input id="label-input" placeholder="you@example.com" />
    </div>
  ),
};
