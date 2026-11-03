import { Hono } from 'hono';
import { MediaIntent, extractMediaIntent } from '../services/mediaIntentService.js';
import { searchOverseerr, requestMedia, OverseerrSearchResult } from '../services/overseerrService.js';

const router = new Hono();

function normalizeTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\\s+/g, ' ');
}

function titleScore(candidate: OverseerrSearchResult, requestedTitle: string): number {
  const wanted = normalizeTitle(requestedTitle);
  const candidateTitles = [candidate.title, candidate.name, candidate.originalTitle, candidate.originalName]
    .filter((value): value is string => Boolean(value))
    .map(normalizeTitle)
    .filter(Boolean);

  if (candidateTitles.includes(wanted)) return 100;
  if (candidateTitles.some(title => title.startsWith(wanted) || wanted.startsWith(title))) return 78;

  const wantedTokens = new Set(wanted.split(' ').filter(token => token.length > 1));
  const candidateTokens = new Set(candidateTitles.flatMap(title => title.split(' ').filter(token => token.length > 1)));
  if (wantedTokens.size === 0 || candidateTokens.size === 0) return 0;

  const overlap = [...wantedTokens].filter(token => candidateTokens.has(token)).length;
  return Math.round((overlap / wantedTokens.size) * 65);
}

function rankResults(results: OverseerrSearchResult[], intent: MediaIntent): OverseerrSearchResult[] {
  return results
    .filter(result => result.mediaType === intent.mediaType)
    .map(result => {
      let score = titleScore(result, intent.title);
      const date = result.releaseDate || result.firstAirDate;
      const resultYear = date ? Number(date.slice(0, 4)) : undefined;

      if (intent.year && resultYear === intent.year) score += 35;
      else if (intent.year && resultYear) score -= Math.min(20, Math.abs(resultYear - intent.year) * 3);

      return { result, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.result);
}

async function searchAndRank(intent: MediaIntent): Promise<OverseerrSearchResult[]> {
  const queries = [...new Set([
    intent.title,
    intent.title.replace(/[.!?:,]+/g, ' ').replace(/\\s+/g, ' ').trim(),
  ].filter(Boolean))];

  const collected = new Map<number, OverseerrSearchResult>();
  for (const query of queries) {
    const results = await searchOverseerr(query);
    for (const result of results) collected.set(result.id, result);

    const ranked = rankResults([...collected.values()], intent);
    // Stop early when we have an exact title and requested year, or a strong
    // exact-title match when the user did not specify a year.
    const exactTitle = ranked.find(result => titleScore(result, intent.title) === 100);
    const exactYear = exactTitle && (exactTitle.releaseDate || exactTitle.firstAirDate)
      ? Number((exactTitle.releaseDate || exactTitle.firstAirDate)!.slice(0, 4)) === intent.year
      : false;
    if (exactTitle && (!intent.year || exactYear)) break;
  }

  return rankResults([...collected.values()], intent);
}

router.post("/prompt", async (c) => {
  try {
    const { prompt } = await c.req.json<{ prompt: string }>();

    if (!prompt) {
      return c.json({ message: "Prompt is required" }, 400);
    }

    console.log("📝 Received prompt:", prompt);

    const intent: MediaIntent = await extractMediaIntent(prompt);
    console.log("🎯 Extracted:", intent);

    const rankedResults = await searchAndRank(intent);
    if (rankedResults.length === 0) {
      return c.json({ message: "Media not found after retrying Seerr search. If it was just added, wait for Seerr's metadata/index refresh and try again." }, 404);
    }

    const result = rankedResults[0];
    console.log("🏆 Best Seerr match:", {
      id: result.id,
      title: result.title || result.name,
      mediaType: result.mediaType,
      releaseDate: result.releaseDate || result.firstAirDate,
    });

    if (result.mediaInfo && result.mediaInfo.status) {
      const status = result.mediaInfo.status;
      // Status 1: Pending Approval, Status 4: Partially Available
      // Other statuses (e.g., 2:Processing, 3:Available, 5:Unavailable) mean we don't need to request.
      if (status !== 1 && status !== 4) {
        console.log("✅ Media already available/requested or processing");
        return c.json({ message: "This media is already processing, available, or has been requested." }, 200);
      }

      if (status === 4 && intent.mediaType === "tv" && Array.isArray(intent.seasons)) {
        const availableSeasons = (result.mediaInfo.seasons || [])
          .filter(s => s.status && s.status !== 1)
          .map(s => s.seasonNumber);

        const missingSeasons = intent.seasons?.filter(
          season => !availableSeasons.includes(season)
        ) || [];

        if (missingSeasons.length === 0) {
          console.log("✅ All requested seasons are already available/requested or processing");
          return c.json({ message: "All requested seasons are already available/requested or processing." }, 200);
        }
        intent.seasons = missingSeasons;
      }
    }

    await requestMedia(intent, result.id);
    console.log("📥 Media requested successfully");

    return c.json({ message: "Media requested successfully." }, 200);
  } catch (err: unknown) {
    console.error("❌ Prompt Route Error:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error) {
      if (err.message === "Failed to extract media intent" ||
          err.message === "Failed to search Overseerr" ||
          err.message === "Failed to request Overseerr") {
        return c.json({ message: err.message }, 500);
      }
    }
    return c.json({ message: "Server failed to process prompt" }, 500);
  }
});

export default router;
