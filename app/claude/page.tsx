import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RevealToken } from "@/components/reveal-token";
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect Claude · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className={`${CARD} flex gap-4`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em]">{title}</h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed font-medium text-muted-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

export default async function ClaudePage() {
  const session = await requireUser();

  // The connector link is per-account, so there has to be an account. Arriving
  // through the Basic-auth back door has none.
  if (!session.ok) redirect("/login?next=%2Fclaude");

  const headerList = await headers();
  const host = headerList.get("host") ?? "";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const connector = session.user.api_token
    ? `${protocol}://${host}/api/mcp/${session.user.api_token}`
    : null;

  return (
    <>
      <SiteHeader active="stock" />

      <main className="mx-auto w-full max-w-[680px] px-5 py-8 pb-32 sm:px-9">
        <span className={LABEL}>Setup</span>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-[-0.02em] sm:text-[34px]">
          Connect Claude to your pantry
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed font-medium text-muted-foreground">
          Add one link to Claude and it gets tools for your kitchen: it can see
          what&apos;s on your shelves, suggest something to cook from it, and
          write the recipe back in. Takes a couple of minutes, once.
        </p>

        <ol className="mt-8 space-y-3">
          <Step number={1} title="Copy your connector link">
            <p>
              This link <em>is</em> the key — anyone who has it can read your
              pantry and write recipes into it. Don&apos;t paste it into a chat.
            </p>
            <RevealToken
              token={connector}
              empty="This account has no key yet — make one in settings and come back."
            />
          </Step>

          <Step number={2} title="Add it to Claude">
            <p>
              In Claude, open <strong className="text-foreground">Settings →
              Connectors</strong> and choose{" "}
              <strong className="text-foreground">Add custom connector</strong>.
              Paste the link and save. Leave the advanced OAuth fields empty —
              the link already identifies you.
            </p>
            <p className="text-sm">
              Connectors are set up on Claude on the web or desktop. Once added,
              they follow your account.
            </p>
          </Step>

          <Step number={3} title="Ask it something">
            <p>Claude will ask to use the pantry tools the first time.</p>
            <ul className="space-y-1.5">
              {[
                "What can I make tonight with what's in the pantry?",
                "I've got tofu going off on Thursday. Ideas?",
                "Write me a recipe for doenjang-jjigae and add it to my pantry.",
                "What have I got in the fridge?",
              ].map((prompt) => (
                <li
                  key={prompt}
                  className="rounded-[12px] bg-chip px-3.5 py-2.5 text-[15px] font-semibold text-foreground"
                >
                  &ldquo;{prompt}&rdquo;
                </li>
              ))}
            </ul>
          </Step>
        </ol>

        <section className={`${CARD} mt-8`}>
          <h2 className={LABEL}>What it can do</h2>
          <ul className="mt-3 space-y-2 text-[15px] font-medium text-muted-foreground">
            <li>
              <strong className="font-bold text-foreground">See</strong> your
              stock — quantities, categories, where things live, what&apos;s
              going off.
            </li>
            <li>
              <strong className="font-bold text-foreground">Read</strong> your
              recipes, and search them.
            </li>
            <li>
              <strong className="font-bold text-foreground">Write</strong> new
              recipes, saved private until you share them.
            </li>
            <li>
              It <strong className="font-bold text-foreground">cannot</strong>{" "}
              change your stock levels, cook anything, delete a recipe, or read
              your password.
            </li>
          </ul>
        </section>

        <section className={`${CARD} mt-3`}>
          <h2 className={LABEL}>If the connector isn&apos;t available to you</h2>
          <p className="mt-2 text-[15px] leading-relaxed font-medium text-muted-foreground">
            Recipes can also be pasted straight in — ask Claude for the recipe as
            JSON and paste it into{" "}
            <Link
              href="/recipes/new"
              className="font-bold text-primary underline underline-offset-2"
            >
              a new recipe
            </Link>
            . Nothing needs connecting for that.
          </p>
        </section>

        <p className="mt-6 text-sm font-semibold text-muted-foreground">
          Driving this from Claude Code or a terminal instead?{" "}
          <a
            href="/api/claude-guide"
            className="font-bold text-primary underline underline-offset-2"
          >
            The HTTP guide
          </a>{" "}
          covers the REST API and the recipe format.
        </p>

        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          <Link href="/settings" className="underline underline-offset-2">
            Rotate the key in settings
          </Link>{" "}
          if the link ever gets out — it stops the connector working immediately.
        </p>
      </main>
    </>
  );
}
