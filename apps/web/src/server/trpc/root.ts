import { adminRouter } from "./routers/admin";
import { calendarRouter } from "./routers/calendar";
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
  calendar: calendarRouter,
});

export type AppRouter = typeof appRouter;
