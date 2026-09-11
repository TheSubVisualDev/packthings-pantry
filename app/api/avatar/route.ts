import { NextResponse } from "next/server";
import { forgetPhoto, storePhoto } from "@/lib/photos";
import { requireUser } from "@/lib/session";
import { setAvatar } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Your own picture. Separate from /api/photo because that one's authorisation
 * question is "is this your recipe", and this one's is "are you signed in" -
 * which is a different check, not a parameter of the same one.
 */
export async function POST(request: Request) {
  const session = await requireUser();
  if (!session.ok) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file." }, { status: 400 });
  }

  const stored = await storePhoto(file, "avatar", `avatars/${session.user.id}`);
  if (!stored.ok || !stored.url) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }

  await forgetPhoto(session.user.avatar_url);
  await setAvatar(session.user.id, stored.url);

  return NextResponse.json({ url: stored.url });
}

export async function DELETE() {
  const session = await requireUser();
  if (!session.ok) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  await setAvatar(session.user.id, null);
  await forgetPhoto(session.user.avatar_url);

  return new NextResponse(null, { status: 204 });
}
