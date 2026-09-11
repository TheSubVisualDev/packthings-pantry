import { redirect } from "next/navigation";

/**
 * Kept only so an old link or bookmark lands somewhere sensible. First-run now
 * happens on /login itself, which doesn't need a session to reach - the reason
 * this page existed was also the reason it couldn't work.
 */
export default function SetupPage() {
  redirect("/login");
}
