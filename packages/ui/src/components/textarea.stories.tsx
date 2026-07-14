import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { placeholder: "Type your message here." },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <Textarea {...args} className="w-72" />,
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="message">Message</Label>
      <Textarea {...args} id="message" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, value: "This field is disabled." },
  render: (args) => <Textarea {...args} className="w-72" />,
};
