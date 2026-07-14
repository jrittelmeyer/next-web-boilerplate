import { adminRouter } from "./routers/admin";
import { notificationRouter } from "./routers/notification";
import { postRouter } from "./routers/post";
import { searchRouter } from "./routers/search";
import { userRouter } from "./routers/user";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  user: userRouter,
  post: postRouter,
  search: searchRouter,
  admin: adminRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
