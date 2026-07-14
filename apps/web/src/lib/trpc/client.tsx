"use client";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { type ReactNode, useState } from "react";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/root";
import { makeQueryClient } from "./query-client";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // Server: always a fresh client (no cross-request leakage).
  if (typeof window === "undefined") return makeQueryClient();
  // Browser: reuse one client so React state survives suspense/re-renders.
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

function getUrl() {
  // Relative on the client; absolute during SSR where there's no origin.
  const base =
    typeof window !== "undefined" ? "" : (process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
  return `${base}/api/trpc`;
}

export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: getUrl(), transformer: superjson })],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
