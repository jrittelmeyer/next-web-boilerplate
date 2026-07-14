"use client";

import { signOut } from "@repo/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";

// Account dropdown for the dashboard header. The signed-in user is passed down from
// the layout (a Server Component) rather than fetched here — keeps this island thin
// and follows the "don't fetch in Client Components" convention. Sign-out clears the
// session via the auth client, then navigates to /login and refreshes so Server
// Components re-read the now-anonymous session.
export function UserMenu({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image: string | null;
}) {
  const t = useTranslations("Dashboard.userMenu");
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const initial = (name.trim()[0] ?? email[0] ?? "?").toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("menuLabel")}
          className="rounded-full p-0"
        >
          <Avatar className="size-9">
            {image ? <AvatarImage src={image} alt="" /> : null}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium">{name}</span>
          <span className="text-xs font-normal text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">{t("account")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onSelect={(event) => {
            // Keep the menu from closing before the async sign-out resolves.
            event.preventDefault();
            void handleSignOut();
          }}
        >
          {signingOut ? t("signingOut") : t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
