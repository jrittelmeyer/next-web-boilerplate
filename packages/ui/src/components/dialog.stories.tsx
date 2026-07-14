import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stable keys for the filler paragraphs (avoids array-index keys).
const tosParagraphs = Array.from({ length: 30 }, (_, i) => ({
  id: `tos-${i + 1}`,
  n: i + 1,
}));

// The everyday case: a short modal that fits the viewport. Centered, with the
// enter/exit zoom+fade animation.
export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            A workspace you can invite teammates to. You&rsquo;ll be its owner.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Short dialogs like this have always centered correctly; the interesting case is the Tall
          Content story.
        </p>
        <DialogFooter showCloseButton>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

// The regression this primitive guards against: content taller than the viewport.
// Without a height cap the box centers at 50% and its top (title + close button)
// lands above the viewport edge, unreachable. `DialogContent`'s
// `max-h-[calc(100dvh-2rem)] overflow-y-auto` caps it to the viewport and scrolls
// the overflow *inside* the dialog, so the header and close button stay on screen.
// Shrink the Storybook preview viewport (or the browser window) to see it hold.
export const TallContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open tall dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terms of service</DialogTitle>
          <DialogDescription>Please review before continuing.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          {tosParagraphs.map((p) => (
            <p key={p.id}>
              {p.n}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.
            </p>
          ))}
        </div>
        <DialogFooter showCloseButton>
          <DialogClose asChild>
            <Button>Accept</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
