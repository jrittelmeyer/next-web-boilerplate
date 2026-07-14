import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Table",
  component: Table,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

// A small users table — a header row + three body rows. The shape /admin/audit renders
// for real: <TableHead> column headers, then one <TableRow> per record.
export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Ada Lovelace</TableCell>
          <TableCell className="text-muted-foreground">ada@example.com</TableCell>
          <TableCell>admin</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Alan Turing</TableCell>
          <TableCell className="text-muted-foreground">alan@example.com</TableCell>
          <TableCell>user</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Grace Hopper</TableCell>
          <TableCell className="text-muted-foreground">grace@example.com</TableCell>
          <TableCell>user</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

// With a <TableCaption> and a right-aligned numeric column — align cells with utility
// classes on <TableHead>/<TableCell> (`text-right`), the shadcn convention.
export const WithCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">INV-001</TableCell>
          <TableCell>Paid</TableCell>
          <TableCell className="text-right">$250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">INV-002</TableCell>
          <TableCell>Pending</TableCell>
          <TableCell className="text-right">$150.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
