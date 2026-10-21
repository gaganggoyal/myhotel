"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { userActor } from "@/lib/audit";
import { requireHotel } from "@/lib/auth";
import { HotelError, publishDraft, restoreVersion, setSiteOnline } from "@/lib/hotel";

export async function publishAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("manager");
  if (!ctx.user.emailVerifiedAt) return fail("Verify your email address before publishing (see the banner above).");
  try {
    const { version } = await publishDraft(ctx.hotel, userActor(ctx.user), str(fd, "note", 200));
    revalidatePath("/dashboard", "layout");
    return ok(`Published version ${version}. Guests now see your changes.`);
  } catch (err) {
    if (err instanceof HotelError) return fail(err.message);
    throw err;
  }
}

export async function restoreAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("manager");
  try {
    const { version } = await restoreVersion(ctx.hotel, str(fd, "versionId"), userActor(ctx.user));
    revalidatePath("/dashboard", "layout");
    return ok(`Restored and published as version ${version}. Your draft now matches it.`);
  } catch (err) {
    if (err instanceof HotelError) return fail(err.message);
    throw err;
  }
}

export async function onlineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireHotel("owner");
  const online = str(fd, "online") === "1";
  try {
    await setSiteOnline(ctx.hotel, online, userActor(ctx.user));
  } catch (err) {
    if (err instanceof HotelError) return fail(err.message);
    throw err;
  }
  revalidatePath("/dashboard", "layout");
  return ok(online ? "Your website is back online." : "Your website now shows a maintenance page.");
}
