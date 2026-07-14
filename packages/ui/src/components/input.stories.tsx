import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Input",
  component: Input,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { placeholder: "you@example.com" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <Input {...args} className="w-72" />,
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="email">Email</Label>
      <Input {...args} id="email" type="email" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, value: "you@example.com" },
  render: (args) => <Input {...args} className="w-72" />,
};

export const Invalid: Story = {
  args: { "aria-invalid": true, value: "not-an-email" },
  render: (args) => <Input {...args} className="w-72" />,
};
