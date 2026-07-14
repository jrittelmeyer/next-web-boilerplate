import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Self-contained data-URI image so the story needs no network.
const sampleImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%234f46e5'/%3E%3Ctext x='50%25' y='54%25' font-size='40' fill='white' text-anchor='middle' font-family='sans-serif'%3EJ%3C/text%3E%3C/svg%3E";

export const WithImage: Story = {
  render: () => (
    <Avatar className="size-12">
      <AvatarImage src={sampleImage} alt="Jane" />
      <AvatarFallback>JA</AvatarFallback>
    </Avatar>
  ),
};

// No/failed src → the fallback initials render instead of a broken image.
export const Fallback: Story = {
  render: () => (
    <Avatar className="size-12">
      <AvatarImage src="" alt="" />
      <AvatarFallback>JA</AvatarFallback>
    </Avatar>
  ),
};
