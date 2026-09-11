import type { Metadata } from "next";
import Link from "next/link";
import { RevealToken } from "@/components/reveal-token";
import { SiteHeader } from "@/components/site-header";

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

export default function ClaudePage() {
  // Safe to read here: this page sits behind the same gate as the rest of the
  // app, so anyone who can load it can already read the pantry.
  const token = process.env.PANTRY_API_TOKEN ?? null;

  return (
    <>
      <SiteHeader active="stock" />

      <main className="mx-auto w-full max-w-[680px] px-5 py-8 pb-32 sm:px-9">
        <span className={LABEL}>Setup</span>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-[-0.02em] sm:text-[34px]">
          Connect Claude to your pantry
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed font-medium text-muted-foreground">
          Give a Claude session the key below and it can see what&apos;s actually
          in your kitchen — then suggest something to cook from it, and write the
          recipe straight back in. Takes about five minutes to set up, once.
        </p>

        <ol className="mt-8 space-y-3">
          <Step number={1} title="Download the guide">
            <p>
              A single markdown file telling Claude how your pantry works: the
              units it accepts, how to name ingredients so they match your stock,
              and how to post a recipe back.
            </p>
            <a
              href="/api/claude-guide"
              className="inline-block rounded-[14px] bg-ink px-5 py-3 text-sm font-extrabold text-background"
            >
              ↓ pantry-for-claude.md
            </a>
          </Step>

          <Step number={2} title="Make a Claude Project">
            <p>
              Go to{" "}
              <a
                href="https://claude.ai/projects"
                target="_blank"
                rel="noreferrer noopener"
                className="font-bold text-primary underline underline-offset-2"
              >
                claude.ai/projects
              </a>
              , create one called something like <em>Pantry</em>, and add the file
              you just downloaded to its project knowledge.
            </p>
            <p>
              A Project rather than a one-off chat, so every conversation starts
              already knowing the rules and you never paste the file again.
            </p>
          </Step>

          <Step number={3} title="Give it your key">
            <p>
              Paste this into the project&apos;s custom instructions, or into the
              chat when Claude asks for it.
            </p>
            <RevealToken token={token} />
            <p className="text-sm">
              This key is read <em>and write</em> access to your kitchen. Treat it
              like the password — anyone holding it can change your stock.
            </p>
          </Step>

          <Step number={4} title="Ask it something">
            <p>Try one of these:</p>
            <ul className="space-y-1.5">
              {[
                "What can I make tonight with what's in the pantry?",
                "I've got tofu going off on Thursday. Ideas?",
                "Write me a recipe for doenjang-jjigae and add it to my pantry.",
                "Halve the chilli in my jjigae recipe.",
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
          <h2 className={LABEL}>What it can reach</h2>
          <ul className="mt-3 space-y-2 text-[15px] font-medium text-muted-foreground">
            <li>
              <strong className="font-bold text-foreground">Reads</strong> your
              stock, with quantities, categories, locations and expiry dates.
            </li>
            <li>
              <strong className="font-bold text-foreground">Reads</strong> your
              recipes, in full.
            </li>
            <li>
              <strong className="font-bold text-foreground">Writes</strong> new
              recipes, and edits or deletes existing ones.
            </li>
            <li>
              It <strong className="font-bold text-foreground">cannot</strong>{" "}
              change your stock levels, cook anything, or read your password.
            </li>
          </ul>
        </section>

        <p className="mt-6 text-sm font-semibold text-muted-foreground">
          <Link href="/pantry" className="underline underline-offset-2">
            ← Back to the pantry
          </Link>
        </p>
      </main>
    </>
  );
}
