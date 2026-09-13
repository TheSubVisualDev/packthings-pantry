import { redirect } from "next/navigation";

/**
 * Kept only so an old link or bookmark lands somewhere sensible.
 *
 * It used to send people to /login, back when first-run meant "there are no
 * accounts yet". There is a first-run for a PERSON now, which is what this
 * name always suggested, so it points there instead - and /welcome sends
 * anybody who has already been shown round straight on to their shelves.
 */
export default function SetupPage() {
  redirect("/welcome");
}
