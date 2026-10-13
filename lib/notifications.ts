import "server-only";

import { z } from "zod";
import db from "@/db/drizzle";
import { notification } from "@/db/schema";
import { emitToUser } from "@/lib/realtime";

const notificationSchema = z.object({
  userId: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2_000),
  link: z.string().trim().max(500).optional(),
});

/** Internal server helper. It is intentionally not exposed as a Server Action. */
export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const data = notificationSchema.parse(input);
  const [created] = await db
    .insert(notification)
    .values({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link ?? null,
    })
    .returning();

  if (!created) throw new Error("Notification was not created.");

  emitToUser(data.userId, "notification", {
    id: created.id,
    type: created.type,
    title: created.title,
    message: created.message,
    link: created.link,
  });
  return created;
}
