import { redirect } from "next/navigation";

// "/" is never rendered - the cookbook is the front door. It was /pantry, then
// /tonight (phase 6); v2 removed stock tracking on 18 Oct 2026 and both went
// with it, because each answered from what was on the shelves.
export default function Home() {
  redirect("/recipes");
}
