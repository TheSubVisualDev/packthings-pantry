import { redirect } from "next/navigation";

// "/" is never rendered - /tonight is the front door (phase 6). It used to
// be /pantry; "what to cook" is the question the app answers first, and the
// shelves are now a place you go to on purpose, from the tab bar.
export default function Home() {
  redirect("/tonight");
}
