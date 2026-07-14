import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import type { ReactNode } from "react";

// Shared presentational shell for the (auth) forms — a fixed-width card with a
// title/description, the form body, and an optional footer (the cross-links between
// sign in / sign up). No client state of its own; the form components own that.
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
      {footer ? (
        <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
