/**
 * A recipe off a video, without asking a model to write it.
 *
 * Reported as "a lot of times I find recipes on youtube" - and the honest
 * version of that is not transcription, it is fetching. A cooking video almost
 * always has the recipe written down next to it: YouTube's description, a
 * reel's caption. Where it does not, the auto-captions are the words somebody
 * said out loud, which is a worse source and still a real one.
 *
 * So this does no understanding at all. It finds the best written text
 * attached to a link, says which of the three it found, and hands it to
 * `readRecipeText` - the same reader a paste goes through, with the same rule
 * that an amount it cannot read is refused rather than invented. The reader
 * was already the thing that turns prose into a draft; this only gets the
 * prose.
 *
 * Nothing here is a private API. YouTube's player endpoint and Instagram's
 * page both answer an anonymous request, and the text they return is the text
 * a viewer is shown. Nothing signs in as anybody and nothing is scraped that a
 * reader cannot see.
 */

/** Where a link points, once it has been recognised. */
export type VideoSource =
  | { host: "youtube"; id: string }
  /**
   * Instagram carries the whole link rather than a code.
   *
   * Reconstructing `/reel/<code>/` from a parsed id looked tidier and was
   * wrong: the share sheet produces `/share/reel/<something>`, where that
   * something is not a shortcode at all but a token Instagram redirects. Built
   * back into a /reel/ URL it becomes a link to a post that does not exist,
   * and the answer is a login wall - which is the same thing the code says
   * when Instagram is refusing outright, so the failure lied about its own
   * cause. Fetching what was pasted and following the redirect handles the
   * share link, the profile-scoped link and the plain one with no cases.
   */
  | { host: "instagram"; url: string }
  /**
   * An ordinary web page, which is where a lot of cooking videos keep the
   * actual recipe.
   *
   * The video that made this necessary has a 330-character description - two
   * sentences about the dish and a link to the cook's own site - and no
   * captions at all, so there was nothing to read and nothing to fall back to.
   * The page behind that link had the recipe in schema.org markup: fourteen
   * ingredients, nine steps, exact. Reached by following a link in a
   * description, or pasted straight into the box.
   */
  | { host: "page"; url: string };

/**
 * Which of the three kinds of text a draft was built from.
 *
 * Carried all the way to the screen, because they are not equally
 * trustworthy and the person checking the draft needs to know which one they
 * are checking. A written ingredient list is somebody's own words; a
 * transcript is a machine's guess at speech, where "two teaspoons" and "two
 * tablespoons" sound similar and an amount is often never said at all.
 */
export type FoundIn = "description" | "caption" | "transcript" | "page";

export interface Found {
  ok: boolean;
  error?: string;
  /** The text to read, already assembled with the title on the first line. */
  text?: string;
  from?: FoundIn;
  title?: string;
  author?: string;
  /** The canonical link, for the recipe's source field. */
  url?: string;
  /**
   * Text that was found but has no ingredient list in it.
   *
   * A reel captioned "now making - butter halloumi curry, recipe by
   * @somebody" produced a draft with one ingredient called "Recipe by
   * @somebody", which is worse than nothing: it looks like the import worked.
   * The words are still handed over - they are what there is, and the box is
   * editable - but the screen says plainly that no amounts were in them.
   */
  thin?: boolean;
}

/* -------------------------------------------------------------------------
   Recognising a link
   ------------------------------------------------------------------------- */

/**
 * A video id is 11 characters of base64url and nothing else.
 *
 * Checked rather than trusted because it is about to be put in a request:
 * `?v=` can hold anything somebody pastes.
 */
const YOUTUBE_ID = /^[\w-]{11}$/;
/** A shortcode is what Instagram calls the part of the URL that names a post. */
const INSTAGRAM_CODE = /^[\w-]{5,32}$/;

export function identifyVideo(input: string): VideoSource | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m)\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return YOUTUBE_ID.test(id) ? { host: "youtube", id } : null;
  }

  if (host === "youtube.com" || host === "music.youtube.com") {
    const watching = url.searchParams.get("v");
    if (watching && YOUTUBE_ID.test(watching)) {
      return { host: "youtube", id: watching };
    }
    // /shorts/ID, /embed/ID, /live/ID - a short is where most of the
    // shortform asked about actually lives.
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      ["shorts", "embed", "live", "v"].includes(parts[0]) &&
      YOUTUBE_ID.test(parts[1])
    ) {
      return { host: "youtube", id: parts[1] };
    }
    return null;
  }

  if (host === "instagram.com" || host === "ddinstagram.com") {
    // /reel/CODE, /reels/CODE, /p/CODE, the same three under a profile
    // (/someone/reel/CODE), and /share/reel/TOKEN from the share sheet. What
    // is checked is that this names a post at all - which one it is, is
    // Instagram's business to resolve.
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.some((part) => ["reel", "reels", "p", "tv", "share"].includes(part))) {
      return null;
    }

    /**
     * The last segment, not the one after the keyword.
     *
     * A share link is /share/reel/<token>, so "the segment after the first
     * keyword" is the word "reel" - which is four characters, fails the
     * shortcode test, and made every share link look like something this
     * cannot read.
     */
    const named = parts[parts.length - 1];
    if (!INSTAGRAM_CODE.test(named)) return null;

    // Rebuilt to instagram.com so a mirror domain cannot send the fetch
    // somewhere else, but with the path as pasted so a share link still
    // resolves.
    return { host: "instagram", url: `https://www.instagram.com${url.pathname}` };
  }

  // Anything else public is treated as a page that might have a recipe marked
  // up in it - which is what "Get the recipe here" points at, and is also
  // worth accepting when somebody pastes the link straight in.
  return isPublic(url) ? { host: "page", url: url.toString() } : null;
}

/* -------------------------------------------------------------------------
   Reading what comes back
   ------------------------------------------------------------------------- */

/**
 * The json3 caption format, as spoken text.
 *
 * Auto-captions roll: a line is shown, then shown again with the next word
 * added, so a naive join says everything three times. The repeats arrive as
 * events marked `aAppend`, which carry only the newline that scrolls the
 * window - dropping those leaves each phrase exactly once.
 */
export function textFromJson3(body: string): string {
  let parsed: { events?: Json3Event[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return "";
  }

  const chunks: string[] = [];
  for (const event of parsed.events ?? []) {
    if (event.aAppend === 1) continue;
    const said = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (said) chunks.push(said);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

interface Json3Event {
  aAppend?: number;
  segs?: { utf8?: string }[];
}

/**
 * The older XML caption format, for a track that answers in it anyway.
 *
 * Two shapes have been served over the years - `<text start=…>` and `<p t=…>`
 * with `<s>` word spans inside - and which one arrives depends on the client
 * that asked. Both are stripped the same way.
 */
export function textFromTimedText(body: string): string {
  const parts = [...body.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g)]
    .map((match) =>
      decodeEntities(match[1].replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  // Consecutive duplicates are the rolling window again, in the format that
  // has no flag for it.
  const said: string[] = [];
  for (const part of parts) {
    if (part !== said[said.length - 1]) said.push(part);
  }
  return said.join(" ").replace(/\s+/g, " ").trim();
}

/** The handful of entities these two sources actually produce. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    // Instagram writes every emoji and every curly apostrophe as a hex
    // reference: &#x1f35b; for the curry and &#x2019; for "don't". Left
    // undecoded they are sixteen literal characters in the middle of a word.
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

/**
 * A reel's caption, out of the page's own preview metadata.
 *
 * Instagram puts the caption in og:description with a count of likes and
 * comments welded to the front - "13K likes, 118 comments - someone on June
 * 7, 2023: "…"" - which would otherwise become the first line of the recipe
 * and therefore its name.
 */
export function captionFromPage(html: string): { caption: string; author: string | null } {
  const described = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
  );
  const titled = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
  );

  let caption = described ? decodeEntities(described[1]) : "";
  const author = titled
    ? decodeEntities(titled[1]).split(/\s+on Instagram/i)[0].trim() || null
    : null;

  /**
   * The label Instagram welds to the front of the caption, which is written
   * two ways.
   *
   * On one post it is "13K likes, 118 comments - someone on June 7, 2023:" and
   * on the next it is only "someone on May 28, 2025:". Matching the first
   * shape alone left the second one intact, so the recipe's name came out as
   * "baboon.amsterdam on May 28, 2025: "Craving comfort?". Stripped in two
   * passes, because the counts are optional and the byline is not.
   *
   * [\s\S] rather than the s flag throughout: a caption is many lines and the
   * build targets a JavaScript older than dotAll.
   */
  caption = caption.replace(
    /^[\d.,KkMm]+\s+likes?,\s*[\d.,KkMm]+\s+comments?\s*[-–—]\s*/,
    "",
  );
  const byline = caption.match(
    /^[^:\n]{1,120}\s+on\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}:\s*([\s\S]*)$/,
  );
  if (byline) caption = byline[1];

  /**
   * The caption itself is then quoted, and the closing quote is not the last
   * thing on the line - Instagram writes `…30minutemeals". ` with a full stop
   * and a space after it. Matching both ends at once is what makes this safe:
   * a caption that genuinely opens with a quotation mark and does not close
   * with one keeps its character.
   */
  caption = caption.trim();
  const quoted = caption.match(/^"([\s\S]*)"[\s.]*$/);
  if (quoted) caption = quoted[1];

  return { caption: caption.trim(), author };
}

/* -------------------------------------------------------------------------
   Choosing between what was found
   ------------------------------------------------------------------------- */

/** A line that states an amount, which is what an ingredient list is made of. */
const AMOUNT_LINE =
  /^[-*••\s]*(?:\d+[\d.,/\s]*|½|¼|¾|⅓|⅔|a|an|one|two|three|four)\s*(?:x\s*)?[a-z]/i;

/**
 * A line that is there to sell something rather than to say how to cook.
 *
 * A real description is mostly this. The one that made the rule had its
 * ingredients on lines 23 to 36 of sixty, with a cookbook, two payment links,
 * an online course and a Facebook group around them - and read whole it
 * produced two ingredients and fifty-five steps, which is not a recipe, it is
 * an advert with a recipe in it.
 */
const NOISE = [
  /https?:\/\/|www\./i,
  /^\s*\d{1,2}:\d{2}(:\d{2})?\b/, // a chapter marker, which reads as a step
  /^[\s\p{Extended_Pictographic}\p{P}\p{S}]+$/u, // arrows and emoji on their own
  /^\s*#[\w-￿]+(\s+#[\w-￿]+)*\s*$/, // a line of hashtags
  /\b(subscribe|patreon|merch|discount code|promo code|affiliate|sponsored|my cookbook|e-?book|follow me|link in bio|check out (my|the)|shop my|use code)\b/i,
];

/**
 * Whether a line carries an amount, which is what an ingredient list is made
 * of - and the one thing never thrown away, whatever else a line looks like.
 */
function statesAnAmount(line: string): boolean {
  return AMOUNT_LINE.test(line);
}

/**
 * A line shouted rather than written.
 *
 * Below an ingredient list, capitals are how a channel advertises - the course,
 * the cookbook, the Facebook group. A step is written like a sentence. This is
 * only ever asked about lines after the ingredients, where getting it wrong
 * costs a step somebody retypes; the list itself is chosen by its amounts and
 * never by its case, because plenty of people do write their ingredients in
 * capitals.
 */
function isShouting(line: string): boolean {
  const letters = line.replace(/[^\p{L}]/gu, "");
  if (letters.length < 12) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length > 0.8;
}

function isNoise(line: string): boolean {
  if (statesAnAmount(line)) return false; // "2 tbsp oil, see link below" stays
  return NOISE.some((pattern) => pattern.test(line));
}

/** Drops the selling, keeps the cooking. Used on every written source. */
export function stripNoise(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isNoise(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The recipe cut out of a description, or null when there is not one in there.
 *
 * Stripping the obvious noise is not enough on its own: what is left is still
 * a paragraph about the channel, then the ingredients, then a paragraph about
 * a course, and the reader has no way to know which is which - everything
 * after the ingredients latches into the method and the advert becomes
 * fifty-five steps.
 *
 * So the ingredient list is found rather than hoped for: the longest run of
 * lines that state an amount, a blank line allowed inside it. Anything above
 * it is preamble and goes. What follows it is kept only while it keeps
 * reading like a method, and the two halves are handed over under headings the
 * reader already understands, so nothing is left to shape alone.
 *
 * Three lines is the floor. Two could be a sentence with a number in it.
 */
export function carveFromDescription(text: string): string | null {
  const lines = stripNoise(text).split(/\r?\n/);

  let bestFrom = -1;
  let bestTo = -1;
  let from = -1;
  let last = -1;

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at].trim();
    if (statesAnAmount(line)) {
      if (from === -1) from = at;
      last = at;
      continue;
    }
    // One blank line inside a list is a list; anything else ends it.
    if (line === "" && from !== -1 && at - last <= 1) continue;
    if (from !== -1 && last - from > bestTo - bestFrom) {
      bestFrom = from;
      bestTo = last;
    }
    from = -1;
  }
  if (from !== -1 && last - from > bestTo - bestFrom) {
    bestFrom = from;
    bestTo = last;
  }

  if (bestFrom === -1) return null;
  const ingredients = lines
    .slice(bestFrom, bestTo + 1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (ingredients.length < 3) return null;

  /**
   * The method, while it still reads like one.
   *
   * A numbered line or a sentence is a step; a blank line is a pause. Two
   * things end it: a line that was only there to sell something, and a run of
   * short fragments, which is how the sign-off at the bottom of a description
   * reads. Keeping less of a real method costs a line somebody retypes;
   * keeping more of an advert costs the recipe.
   */
  const method: string[] = [];
  for (let at = bestTo + 1; at < lines.length; at += 1) {
    const line = lines[at].trim();
    if (!line) continue;
    // Its own heading is not a step, and it is written half a dozen ways. The
    // heading in the output is this file's, so whichever one arrives is
    // dropped here.
    if (/^(method|instructions?|directions?|steps?|preparation|how to)\b[:\s]*$/i.test(line)) {
      continue;
    }
    if (isNoise(line)) break;
    // A question is not an instruction. "HAVE YOU HEARD ABOUT THE COURSE?" is
    // the line that follows an ingredient list more often than a method does.
    if (line.endsWith("?")) break;
    if (isShouting(line)) break;
    const numbered = /^(step\s*)?\d+[.)]/i.test(line);
    if (!numbered && line.length < 25) break;
    method.push(line);
  }

  return [
    "Ingredients",
    ...ingredients,
    ...(method.length > 0 ? ["", "Method", ...method] : []),
  ].join("\n");
}

/**
 * The text a draft is built from, with the title as its first line.
 *
 * The reader takes the first line as the recipe's name, so the video's title
 * goes there rather than being thrown away - "Deddy's Jamaican Curry Chicken"
 * is a better name than whatever the first sentence of a description happens
 * to be.
 */
export function assemble(found: {
  title?: string | null;
  description?: string | null;
  transcript?: string | null;
  caption?: string | null;
}): { text: string; from: FoundIn } | null {
  const title = (found.title ?? "").trim();
  const head = title ? `${title}\n\n` : "";

  // A caption is taken whole, minus the selling. It is one person typing a
  // recipe into a box, so it has no preamble to carve away - and hashtags at
  // the bottom are the only thing in it that is not the recipe.
  const caption = stripNoise(found.caption ?? "").trim();
  if (caption) return { text: head + caption, from: "caption" };

  const description = (found.description ?? "").trim();
  const carved = description ? carveFromDescription(description) : null;
  if (carved) return { text: head + carved, from: "description" };

  const transcript = (found.transcript ?? "").trim();
  if (transcript) {
    // Sentence breaks, because a transcript arrives as one unbroken line and
    // the reader works in lines. This is not punctuation it can be trusted to
    // have - it is the only structure there is.
    const broken = transcript.replace(/([.!?])\s+/g, "$1\n");
    return { text: head + broken, from: "transcript" };
  }

  // A description with no amounts in it is still better than nothing, and the
  // screen says where it came from.
  const remains = stripNoise(description).trim();
  if (remains) return { text: head + remains, from: "description" };

  return null;
}

/* -------------------------------------------------------------------------
   The recipe on a page, in the markup search engines read
   ------------------------------------------------------------------------- */

interface JsonLdRecipe {
  name?: string;
  recipeYield?: unknown;
  recipeIngredient?: unknown;
  recipeInstructions?: unknown;
  description?: string;
}

/** Tags out, entities decoded: JSON-LD carries HTML inside its strings. */
function plain(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    // A tag is replaced with a space so words either side do not run together,
    // which leaves "golden ." wherever the emphasis ended a sentence.
    .replace(/\s+([.,;:!?])/g, "$1")
    // WordPress's recipe plugin doubles its brackets - "1 onion ((1½ cups))" -
    // and the reader takes the outer pair as the note and leaves the inner one
    // welded to the name: "Thai red curry paste )". One pair is what was meant.
    .replace(/\(\(/g, "(")
    .replace(/\)\)/g, ")")
    .trim();
}

/**
 * Steps, however the site chose to write them.
 *
 * Three shapes are all legal and all common: a bare string, a HowToStep with
 * the words in `text`, and a HowToSection holding a list of steps under a
 * heading. A reader that handles only the first gets an empty method from half
 * the internet.
 */
function stepsFrom(value: unknown, depth = 0): string[] {
  if (depth > 3 || !value) return [];
  if (typeof value === "string") {
    const text = plain(value);
    return text ? [text] : [];
  }
  if (Array.isArray(value)) return value.flatMap((each) => stepsFrom(each, depth + 1));

  const node = value as { "@type"?: unknown; text?: unknown; name?: unknown; itemListElement?: unknown };
  if (node.itemListElement) return stepsFrom(node.itemListElement, depth + 1);
  const text = plain(node.text) || plain(node.name);
  return text ? [text] : [];
}

/** Every Recipe node in a page, wherever the site buried it. */
function recipesIn(html: string): JsonLdRecipe[] {
  const found: JsonLdRecipe[] = [];

  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      // One unparseable block is not a reason to abandon the page: sites
      // routinely ship several and only one of them is the recipe.
      continue;
    }

    const queue = [parsed];
    // @graph is how most plugins publish, with the recipe as one node among a
    // dozen describing the site, the author and the breadcrumbs.
    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (!node || typeof node !== "object") continue;

      const record = node as Record<string, unknown>;
      if (Array.isArray(record["@graph"])) queue.push(...record["@graph"]);

      const type = record["@type"];
      const named = Array.isArray(type) ? type.join(" ") : String(type ?? "");
      if (/\brecipe\b/i.test(named)) found.push(record as JsonLdRecipe);
    }
  }

  return found;
}

/**
 * A recipe page turned back into the plain text the reader takes.
 *
 * Deliberately not parsed into a document here. schema.org gives amounts as
 * the strings a person typed - "2½ tablespoons grapeseed oil, divided" - which
 * is exactly what `readRecipeText` already reads, including the half symbol,
 * the note in brackets and the refusal to invent an amount that is not there.
 * Building a document directly would be a second reader, and the count of bugs
 * caused by second copies is the thing AGENTS.md keeps.
 */
/**
 * A page as the words on it, in the order they are read.
 *
 * The fallback for a site whose markup is a shell. Squarespace publishes a
 * Recipe node with an empty `recipeIngredient` - the type is declared, the
 * ingredients are typed into the page body as ordinary paragraphs - and a
 * reader that trusts the markup finds a recipe with nothing in it and gives
 * up, which is how a burger recipe with twenty amounts in plain sight came
 * back as "no ingredient list in it".
 *
 * Block tags become newlines because the carve works in lines, and a page
 * flattened to one line has no ingredient list in it by definition.
 */
export function textFromHtmlBody(html: string): string {
  return decodeEntities(
    html
      // The parts of a page that are never the recipe and are full of words
      // that look like one - a nav full of "Recipes", a footer, a comment form.
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Where a recipe stops and the page's furniture starts again. */
const AFTER_THE_RECIPE =
  /^(comments?|ratings?|reviews?|related|you (might|may) also|more (recipes|like)|nutrition|leave a|sign in|log in|subscribe|newsletter|shop|about the author|previous|next)\b/i;

const INGREDIENTS_HEADING = /^ingredients?\b[:\s]*$/i;
const METHOD_HEADING =
  /^(directions?|methods?|instructions?|steps?|preparation|how to make)\b[:\s]*$/i;

/**
 * A recipe page carved by its own headings.
 *
 * `carveFromDescription` takes the longest single run of amount lines, which
 * is right for a description and wrong here: a real recipe page has the
 * pickles, then the sauce, then the burger, each under its own sub-heading,
 * and the longest run is one of the three. The burger recipe came back with
 * nine ingredients and no method because of exactly that.
 *
 * A page says where its list starts, though. "Ingredients" and "Directions"
 * are on the page as headings, so everything between them is the list -
 * sub-headings included, which the reader already groups - and everything
 * after the second one is the method, until the page turns back into comments
 * and related posts.
 */
export function carveFromPage(text: string): string | null {
  const lines = text.split("\n");

  const start = lines.findIndex((line) => INGREDIENTS_HEADING.test(line.trim()));
  if (start === -1) return null;

  let method = -1;
  let end = lines.length;
  for (let at = start + 1; at < lines.length; at += 1) {
    const line = lines[at].trim();
    if (method === -1 && METHOD_HEADING.test(line)) {
      method = at;
      continue;
    }
    if (AFTER_THE_RECIPE.test(line)) {
      end = at;
      break;
    }
  }

  const ingredients = lines
    .slice(start + 1, method === -1 ? end : method)
    .map((line) => line.trim())
    .filter((line) => line && !isNoise(line));

  // Three amounts, the same floor as everywhere else: a page can have the word
  // Ingredients on it and no list under it - a category page, or a card that
  // loads its list with JavaScript this never runs.
  if (ingredients.filter(statesAnAmount).length < 3) return null;

  const steps =
    method === -1
      ? []
      : lines
          .slice(method + 1, end)
          .map((line) => line.trim())
          .filter((line) => line && !isNoise(line));

  return [
    "Ingredients",
    ...ingredients,
    ...(steps.length > 0 ? ["", "Method", ...steps] : []),
  ].join("\n");
}

export function recipeTextFromPage(html: string): string | null {
  for (const recipe of recipesIn(html)) {
    const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [])
      .map(plain)
      .filter(Boolean);
    if (ingredients.length === 0) continue;

    const steps = stepsFrom(recipe.recipeInstructions);
    const name = plain(recipe.name);

    // recipeYield is "4", ["4"], "4 servings" or ["2", "2 Servings"] depending
    // on the plugin. The first number in it is the only part worth keeping.
    const yields = Array.isArray(recipe.recipeYield)
      ? recipe.recipeYield.map(plain).join(" ")
      : plain(recipe.recipeYield);
    const serves = yields.match(/\d+/)?.[0];

    return [
      ...(name ? [name, ""] : []),
      ...(serves ? [`Serves ${serves}`, ""] : []),
      "Ingredients",
      ...ingredients,
      ...(steps.length > 0 ? ["", "Method", ...steps] : []),
    ].join("\n");
  }

  /**
   * No usable markup, so the page itself - carved exactly the way a YouTube
   * description is, because the problem is the same one. A blog post is a
   * recipe wrapped in a story about the recipe, a nav, a comment form and
   * four adverts, and the ingredient list is still the longest run of lines
   * that state an amount.
   */
  const body = textFromHtmlBody(html);
  const carved = carveFromPage(body) ?? carveFromDescription(body);
  if (!carved) return null;

  // The page's own title, since the markup that named the recipe was the part
  // that let us down.
  const titled = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const name = titled
    ? decodeEntities(titled[1]).replace(/\s+/g, " ").split(/\s+[|—-]\s+/)[0].trim()
    : "";

  return name ? `${name}\n\n${carved}` : carved;
}

/**
 * The links in a description that might be the recipe.
 *
 * A description is mostly links and almost none of them are it: the channel,
 * a playlist, three socials, an Amazon shelf. What is left after those is
 * usually the cook's own site, which is where "Get the recipe here" points -
 * and that page is the best source there is, better than the description and
 * far better than a transcript, because it is the recipe written out to be
 * followed.
 */
const NOT_THE_RECIPE =
  /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.me|twitter\.com|x\.com|tiktok\.com|threads\.net|pinterest\.[a-z.]+|patreon\.com|amazon\.[a-z.]+|amzn\.to|payhip\.com|linktr\.ee|ko-fi\.com|buymeacoffee\.com|spotify\.com|discord\.gg|bit\.ly|reddit\.com)$/i;

export function recipeLinksIn(description: string): string[] {
  const links: string[] = [];

  for (const match of description.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    // Trailing punctuation belongs to the sentence, not the address.
    const raw = match[0].replace(/[.,;:!?]+$/, "");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (NOT_THE_RECIPE.test(url.hostname.replace(/^www\./, ""))) continue;
    if (!isPublic(url)) continue;
    if (!links.includes(url.toString())) links.push(url.toString());
  }

  return links;
}

/**
 * Whether an address is somewhere on the internet rather than inside this
 * network.
 *
 * This fetches a URL that arrived from outside - out of a description, or
 * typed into the box - which is the shape of request that gets used to make a
 * server read things only the server can reach. Nothing here needs to talk to
 * anything private, so nothing private is allowed.
 */
export function isPublic(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return false;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return false;
  if (!host.includes(".")) return false; // a bare machine name is on this network

  const four = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (four) {
    const [a, b] = four.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // the cloud metadata address
  }

  return true;
}

/* -------------------------------------------------------------------------
   Fetching
   ------------------------------------------------------------------------- */

/**
 * How long to wait before giving up on either site.
 *
 * Somebody is standing in front of this having pasted a link, so the failure
 * has to arrive while they are still watching. Eight seconds is longer than
 * either request has ever taken and short enough to say "that didn't work"
 * rather than hang.
 */
const PATIENCE = 8000;

/**
 * YouTube's own player endpoint, asked as a phone.
 *
 * The web page will hand over the description happily, but the caption URLs it
 * carries answer every request with 200 and an empty body - they now want a
 * token the browser mints in JavaScript. The mobile clients are not asked for
 * one, and their caption URLs return the whole transcript. This is the same
 * public endpoint the site itself calls; the key below is a constant that
 * ships in YouTube's own page source, not a credential belonging to anybody.
 */
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const CLIENTS = [
  {
    clientName: "IOS",
    clientVersion: "20.10.4",
    deviceModel: "iPhone16,2",
    hl: "en",
    gl: "GB",
  },
  {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    androidSdkVersion: 34,
    hl: "en",
    gl: "GB",
  },
];

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string; shortDescription?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
  };
}

/**
 * Which caption track to read.
 *
 * A track somebody typed beats one a machine guessed, and English beats a
 * language this app cannot read anyway - but an auto-generated track is still
 * taken when it is all there is, because a rough transcript of the right video
 * is worth more than nothing.
 */
export function chooseTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const english = tracks.filter((track) => track.languageCode?.startsWith("en"));
  const pool = english.length > 0 ? english : tracks;
  return pool.find((track) => track.kind !== "asr") ?? pool[0] ?? null;
}

/** What a route came back with, and what to say if none of them did. */
interface Asked {
  player: PlayerResponse | null;
  /** YouTube's own words for the refusal, kept for the message on screen. */
  refusal: string | null;
}

async function askYouTube(id: string): Promise<Asked> {
  let refusal: string | null = null;

  for (const client of CLIENTS) {
    try {
      const response = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            videoId: id,
            context: { client },
            contentCheckOk: true,
            racyCheckOk: true,
          }),
          signal: AbortSignal.timeout(PATIENCE),
        },
      );
      if (!response.ok) continue;
      const player = (await response.json()) as PlayerResponse;
      if (player.playabilityStatus?.status === "OK") return { player, refusal: null };
      refusal ??= player.playabilityStatus?.reason ?? null;
    } catch {
      // Either client may be the one that is refused today. Falling through to
      // the next is the whole reason there are two.
    }
  }

  /**
   * The page itself, asked for as a link preview.
   *
   * This is the route that matters in production and the reason the first two
   * are not enough. The player endpoint answers a laptop at home and refuses
   * the same request from a datacentre - which is where this app runs - with
   * "Sign in to confirm you're not a bot". A crawler asking for the watch page
   * is the request every chat app makes to draw a link preview, it is answered
   * from anywhere, and the page it returns still carries the full description
   * in the same blob the player would have given.
   */
  const fromPage = await watchPage(id);
  if (fromPage) return { player: fromPage, refusal: null };

  return { player: null, refusal };
}

/** The description out of the watch page, which survives where the API does not. */
async function watchPage(id: string): Promise<PlayerResponse | null> {
  try {
    const response = await fetch(
      // bpctr and has_verified are what get past the "are you sure" interstitial
      // rather than a page about it.
      `https://www.youtube.com/watch?v=${id}&bpctr=9999999999&has_verified=1`,
      {
        headers: {
          "user-agent": "facebookexternalhit/1.1",
          "accept-language": "en-GB,en;q=0.9",
        },
        signal: AbortSignal.timeout(PATIENCE),
      },
    );
    if (!response.ok) return null;
    const html = await response.text();

    const blob = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var|const|let|<\/script>)/,
    );
    if (blob) {
      try {
        const player = JSON.parse(blob[1]) as PlayerResponse;
        if (player.videoDetails?.title) return player;
      } catch {
        // A truncated blob is not a reason to give up on the page - the
        // preview tags below say less, but they say it reliably.
      }
    }

    // Failing that, the preview metadata: a title and the first paragraph or
    // so of the description. Short, and enough for a reel-length recipe.
    const described = html.match(
      /<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']*)["']/i,
    );
    const titled = html.match(
      /<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']*)["']/i,
    );
    if (!titled) return null;

    return {
      videoDetails: {
        title: decodeEntities(titled[1]),
        shortDescription: described ? decodeEntities(described[1]) : "",
      },
    };
  } catch {
    return null;
  }
}

async function fetchYouTube(id: string): Promise<Found> {
  const { player, refusal } = await askYouTube(id);
  if (!player) {
    return {
      ok: false,
      // YouTube's own words where there are any. "It may be private" was a
      // guess, and it sent everybody looking at the wrong thing when the real
      // answer was that the server had been taken for a robot.
      error: refusal
        ? `YouTube refused: "${refusal}"`
        : "YouTube would not say anything about that video. It may be private, age-restricted or removed.",
    };
  }

  const details = player.videoDetails ?? {};
  const description = details.shortDescription ?? "";

  /**
   * The page the description points at, when the description itself is a
   * blurb.
   *
   * This is the common case for anybody who cooks for a living: two sentences
   * about the dish and "Get the recipe here". Two videos in a row read as
   * three useless paragraphs before this existed, and both of them had
   * fourteen or fifteen exact ingredients sitting one link away. It is tried
   * before the transcript because a recipe written out to be followed beats a
   * machine's guess at speech every time - and after the description, because
   * a cook who wrote the list under their own video should not have a third
   * party's page preferred over it.
   */
  if (!carveFromDescription(description)) {
    for (const link of recipeLinksIn(description).slice(0, 2)) {
      const page = await fetchPage(link);
      if (page.ok && page.text) {
        return {
          ...page,
          // The video's own title, because a site's own name for the recipe
          // is sometimes an SEO sentence and the video is what was watched.
          title: details.title,
          author: details.author,
        };
      }
    }
  }

  // The transcript is only fetched when nothing written can carry the recipe -
  // it is another round trip and the slower half of the wait.
  let transcript = "";
  if (!carveFromDescription(description)) {
    const track = chooseTrack(
      player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
    );
    if (track) {
      try {
        const response = await fetch(`${track.baseUrl}&fmt=json3`, {
          signal: AbortSignal.timeout(PATIENCE),
        });
        const body = await response.text();
        transcript = body.trimStart().startsWith("{")
          ? textFromJson3(body)
          : textFromTimedText(body);
      } catch {
        // No transcript is a worse import, not a failed one.
      }
    }
  }

  const built = assemble({ title: details.title, description, transcript });
  if (!built) {
    return {
      ok: false,
      error:
        "That video has no description and no captions, so there is nothing written down to read.",
    };
  }

  return {
    ok: true,
    ...built,
    title: details.title,
    author: details.author,
    url: `https://www.youtube.com/watch?v=${id}`,
    // A transcript never states its amounts as a list, so it is never called
    // thin - the screen has a louder thing to say about it already.
    thin: built.from === "description" && !carveFromDescription(description),
  };
}

/**
 * A reel, read the way a link preview reads it.
 *
 * Instagram serves a logged-out browser a page with nothing in it and a
 * crawler the post's own preview metadata, which is where the caption is - so
 * this asks as a crawler. That is the same request every chat app makes when
 * somebody pastes a reel into it, and it returns only what a viewer sees.
 *
 * There is no transcript here. Instagram does not publish one, and a reel's
 * caption is usually the recipe anyway - it is where the ingredient list gets
 * typed, because the video is too fast to read one off.
 */
async function fetchInstagram(url: string): Promise<Found> {
  let html = "";
  let landed = url;
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "facebookexternalhit/1.1",
        "accept-language": "en-GB,en;q=0.9",
      },
      // A share link is a redirect to the post, so it is followed and the URL
      // it lands on is the one kept as the recipe's source.
      redirect: "follow",
      signal: AbortSignal.timeout(PATIENCE),
    });
    landed = response.url || url;
    html = await response.text();
  } catch {
    return { ok: false, error: "Instagram did not answer. Try again in a moment." };
  }

  const { caption, author } = captionFromPage(html);
  if (!caption) {
    return {
      ok: false,
      error:
        "Instagram showed a login wall rather than the post. Open the reel, copy the caption, and paste it below instead.",
    };
  }

  /**
   * A caption that names the dish and points elsewhere.
   *
   * Half of cooking Instagram writes "recipe on my blog" or credits another
   * account, and the recipe is on a page one link away - the same shape as a
   * YouTube description that is only a blurb, so it gets the same treatment
   * before falling back to the words themselves.
   */
  const hasList = carveFromDescription(caption) !== null;
  if (!hasList) {
    for (const link of recipeLinksIn(caption).slice(0, 2)) {
      const page = await fetchPage(link);
      if (page.ok && page.text) return { ...page, author: author ?? undefined };
    }
  }

  const built = assemble({ caption });
  if (!built) {
    return { ok: false, error: "That reel has an empty caption." };
  }

  return {
    ok: true,
    ...built,
    author: author ?? undefined,
    url: landed,
    thin: !hasList,
  };
}

/**
 * A page with a recipe marked up in it.
 *
 * Fetched as an ordinary browser rather than as a crawler: a food blog serves
 * the same page to both, and the browser user-agent is the one that gets
 * through the anti-scraping in front of some of them.
 */
async function fetchPage(url: string): Promise<Found> {
  let html = "";
  let landed = url;
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        "accept-language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(PATIENCE),
    });
    if (!response.ok) return { ok: false, error: `That page answered ${response.status}.` };

    // Re-checked after the redirects: a public address that forwards to a
    // private one is how the check above gets walked around.
    landed = response.url || url;
    try {
      if (!isPublic(new URL(landed))) {
        return { ok: false, error: "That link leads somewhere this will not follow." };
      }
    } catch {
      return { ok: false, error: "That link leads somewhere this will not follow." };
    }

    html = await response.text();
  } catch {
    return { ok: false, error: "That page did not answer." };
  }

  const text = recipeTextFromPage(html);
  if (!text) {
    return {
      ok: false,
      error:
        "That page has no recipe marked up in it. Copy the ingredients and method and paste them below instead.",
    };
  }

  return { ok: true, text, from: "page", url: landed };
}

/** The one entry point: a link in, text to read out. */
export async function findRecipeText(link: string): Promise<Found> {
  const source = identifyVideo(link);
  if (!source) {
    return {
      ok: false,
      error:
        "That is not a link this can read. A YouTube video, an Instagram reel, or a page with a recipe on it.",
    };
  }

  if (source.host === "youtube") return fetchYouTube(source.id);
  if (source.host === "instagram") return fetchInstagram(source.url);
  return fetchPage(source.url);
}
