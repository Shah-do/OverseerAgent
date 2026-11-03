import { Hono } from 'hono';
import { MediaIntent, extractMediaIntent } from '../services/mediaIntentService.js';
import { searchOverseerr, requestMedia } from '../services/overseerrService.js';

const router = new Hono();

router.post("/prompt", async (c) => {
  try {
    const { prompt } = await c.req.json<{ prompt: string }>();

    if (!prompt) {
      return c.json({ message: "Prompt is required" }, 400);
    }

    console.log("📝 Received prompt:", prompt);

    const intent: MediaIntent = await extractMediaIntent(prompt);
    console.log("🎯 Extracted:", intent);

    const searchResults = await searchOverseerr(intent.title);

    if (searchResults.length === 0) {
      return c.json({ message: "Media not found" }, 404);
    }

    const matchingType = searchResults.filter(r => r.mediaType === intent.mediaType);
    if (matchingType.length === 0) {
      return c.json({ message: "Sorry, I couldn't find that media." }, 404);
    }

    // Treat year as a helpful hint, not a hard requirement. Prefer an exact
    // year match when available, but fall back to Seerr's best-ranked result
    // so a missing/incomplete release date never blocks a normal title search.
    const yearMatch = intent.year
      ? matchingType.find(r => {
          const date = r.releaseDate || r.firstAirDate;
          return date && Number(date.slice(0, 4)) === intent.year;
        })
      : undefined;
    const result = yearMatch ?? matchingType[0];

    if (intent.year && !yearMatch) {
      console.warn("⚠️ No exact year match in Seerr results; using its top result:", {
        title: intent.title,
        year: intent.year,
        mediaType: intent.mediaType,
        selectedDate: result.releaseDate || result.firstAirDate,
      });
    }


    if (result.mediaInfo && result.mediaInfo.status) {
      const status = result.mediaInfo.status;
      // Status 1: Pending Approval, Status 4: Partially Available
      // Other statuses (e.g., 2:Processing, 3:Available, 5:Unavailable) mean we don't need to request.
      if (status !== 1 && status !== 4) { 
        console.log("✅ Media already available/requested or processing");
        return c.json({ message: "This media is already processing, available, or has been requested." }, 200);
      }

      // If partially available, check if requested seasons are among the available ones
      if (status === 4 && intent.mediaType === "tv" && Array.isArray(intent.seasons)) {
        const availableSeasons = (result.mediaInfo.seasons || [])
          .filter(s => s.status && s.status !== 1) // status 1 is pending, others are various states of available/processing
          .map(s => s.seasonNumber);
        
        const missingSeasons = intent.seasons?.filter(
          season => !availableSeasons.includes(season)
        ) || [];

        if (missingSeasons.length === 0) {
          console.log("✅ All requested seasons are already available/requested or processing");
          return c.json({ message: "All requested seasons are already available/requested or processing." }, 200);
        }
        // Update intent to only request missing seasons
        intent.seasons = missingSeasons;
      }
    }

    await requestMedia(intent, result.id);
    console.log("📥 Media requested successfully");

    return c.json({ message: "Media requested successfully." }, 200);
  } catch (err: unknown) {
    console.error("❌ Prompt Route Error:", err instanceof Error ? err.message : String(err));
    // Check if the error is from one of our services and rethrow if it's a specific message
    if (err instanceof Error) {
      if (err.message === "Failed to extract media intent" || 
          err.message === "Failed to search Overseerr" || 
          err.message === "Failed to request media") {
        return c.json({ message: err.message }, 500); 
      }
    }
    return c.json({ message: "Server failed to process prompt" }, 500);
  }
});

export default router; 