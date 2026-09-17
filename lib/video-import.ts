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
  | { host: "instagram"; url: string };

/**
 * Which of the three kinds of text a draft was built from.
 *
 * Carried all the way to the screen, because they are not equally
 * trustworthy and the person checking the draft needs to know which one they
 * are checking. A written ingredient list is somebody's own words; a
 * transcript is a machine's guess at speech, where "two teaspoons" and "two
 * tablespoons" sound similar and an amount is often never said at all.
 */
export type FoundIn = "description" | "caption" | "transcript";

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

  return null;
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

  const stripped = caption.match(
    // [\s\S] rather than the s flag: a caption is many lines and the build
    // targets a JavaScript older than dotAll.
    /^[\d.,KkMm]+\s+likes?,\s+[\d.,KkMm]+\s+comments?\s+-\s+[^:]+:\s*([\s\S]*)$/,
  );
  if (stripped) caption = stripped[1];

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

  // The transcript is only fetched when the description cannot carry the
  // recipe on its own - it is a second round trip and the slower half of the
  // wait, and most cooking channels write the ingredients out.
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

  const built = assemble({ caption });
  if (!built) {
    return { ok: false, error: "That reel has an empty caption." };
  }

  return { ok: true, ...built, author: author ?? undefined, url: landed };
}

/** The one entry point: a link in, text to read out. */
export async function findRecipeText(link: string): Promise<Found> {
  const source = identifyVideo(link);
  if (!source) {
    return {
      ok: false,
      error:
        "That is not a link this can read. YouTube videos and shorts, and Instagram reels.",
    };
  }

  return source.host === "youtube"
    ? fetchYouTube(source.id)
    : fetchInstagram(source.url);
}
