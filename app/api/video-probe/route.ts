import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/reports";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * What YouTube will actually say to THIS server, route by route.
 *
 * The video import behaves differently in production and nobody could see
 * why, because the only window onto it was one sentence on a screen: the
 * player endpoint answers a laptop at home and sometimes refuses a datacentre,
 * the watch page answers sometimes, and captions are only ever carried by the
 * one route that gets refused. Which of those is happening on any given day
 * decides whether a recipe imports, and guessing at it from the outside cost
 * two rounds of deploy-and-see.
 *
 * So this asks every route in turn and reports what came back. Admin only, and
 * a read of a public video page: it changes nothing and stores nothing.
 *
 *   /api/video-probe?v=<video id>
 */
const KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

interface Track {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

/** How much of a caption file comes back, which is the whole question. */
async function captionBytes(track: Track | undefined): Promise<number | null> {
  if (!track) return null;
  try {
    const response = await fetch(`${track.baseUrl}&fmt=json3`, {
      signal: AbortSignal.timeout(8000),
    });
    return (await response.text()).length;
  } catch {
    return -1;
  }
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.id))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const id = new URL(request.url).searchParams.get("v");
  if (!id || !/^[\w-]{11}$/.test(id)) {
    return NextResponse.json({ error: "Pass ?v=<11 character video id>" }, { status: 400 });
  }

  const report: Record<string, unknown> = { video: id, at: new Date().toISOString() };

  for (const [label, client] of [
    ["player.ios", { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2", hl: "en", gl: "GB" }],
    ["player.android", { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "en", gl: "GB" }],
  ] as const) {
    try {
      const response = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${KEY}&prettyPrint=false`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            videoId: id,
            context: { client },
            contentCheckOk: true,
            racyCheckOk: true,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      const player = (await response.json()) as Record<string, never>;
      const status = (player as { playabilityStatus?: { status?: string; reason?: string } })
        .playabilityStatus;
      const tracks: Track[] =
        (player as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } } })
          .captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

      report[label] = {
        http: response.status,
        status: status?.status,
        reason: status?.reason,
        description: (
          (player as { videoDetails?: { shortDescription?: string } }).videoDetails
            ?.shortDescription ?? ""
        ).length,
        tracks: tracks.map((track) => `${track.languageCode ?? "?"}${track.kind ? "/" + track.kind : ""}`),
        captionBytes: await captionBytes(tracks[0]),
      };
    } catch (error) {
      report[label] = { threw: error instanceof Error ? error.message : "unknown" };
    }
  }

  for (const [label, agent] of [
    ["page.crawler", "facebookexternalhit/1.1"],
    ["page.browser", BROWSER],
  ] as const) {
    try {
      const response = await fetch(
        `https://www.youtube.com/watch?v=${id}&bpctr=9999999999&has_verified=1`,
        {
          headers: { "user-agent": agent, "accept-language": "en-GB,en;q=0.9" },
          signal: AbortSignal.timeout(8000),
        },
      );
      const html = await response.text();
      const blob = html.match(
        /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var|const|let|<\/script>)/,
      );
      let description = -1;
      let tracks: Track[] = [];
      if (blob) {
        try {
          const player = JSON.parse(blob[1]);
          description = (player.videoDetails?.shortDescription ?? "").length;
          tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
        } catch {
          description = -2; // a blob that would not parse
        }
      }
      report[label] = {
        http: response.status,
        bytes: html.length,
        blob: Boolean(blob),
        description,
        // The words a bot check uses, so a refusal is legible rather than just
        // a short page.
        looksRefused: /Sign in to confirm|not a bot|unusual traffic/i.test(html),
        tracks: tracks.length,
        captionBytes: await captionBytes(tracks[0]),
      };
    } catch (error) {
      report[label] = { threw: error instanceof Error ? error.message : "unknown" };
    }
  }

  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}
