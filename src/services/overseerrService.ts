import axios from 'axios';
import { OVERSEERR_URL, OVERSEERR_API_KEY, profileMap } from '../config/index.js';
import { MediaIntent } from './mediaIntentService.js';

export interface OverseerrSearchResult {
  id: number;
  mediaType?: string;
  title?: string;
  name?: string;
  originalTitle?: string;
  originalName?: string;
  releaseDate?: string;
  firstAirDate?: string;
  popularity?: number;
  voteAverage?: number;
  mediaInfo?: {
    status?: number;
    seasons?: { seasonNumber: number; status?: number }[];
  };
}

const overseerrHeaders = {
  'X-Api-Key': OVERSEERR_API_KEY!,
  'Content-Type': 'application/json',
};

/**
 * RFC 3986 encoding is stricter than encodeURIComponent: it also escapes
 * ! ' ( ) *, which Seerr rejects when they appear unescaped in query values.
 */
function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryableSearchError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return !status || status === 429 || status >= 500;
}

/**
 * Seerr's search index can briefly return an empty result set immediately
 * after media is added. Retry empty responses as well as transient API errors.
 * Do not retry authentication/validation errors (4xx other than 429).
 */
export async function searchOverseerr(title: string): Promise<OverseerrSearchResult[]> {
  const query = encodeQueryValue(title);
  const url = `${OVERSEERR_URL}/api/v1/search?query=${query}`;
  const delays = [500, 1200, 2500];
  let lastError: unknown;

  console.log('🔍 Searching Seerr for:', title);

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await axios.get(url, {
        headers: overseerrHeaders,
        timeout: 15000,
      });
      const results = (res.data?.results ?? []) as OverseerrSearchResult[];

      if (results.length > 0) {
        if (attempt > 0) console.log(`✅ Seerr search returned results on retry ${attempt}`);
        return results;
      }

      console.warn(`⚠️ Seerr returned zero results (attempt ${attempt + 1}/${delays.length + 1}) for:`, title);
      if (attempt === delays.length) return [];
    } catch (err: unknown) {
      lastError = err;
      if (!isRetryableSearchError(err) || attempt === delays.length) break;

      if (axios.isAxiosError(err)) {
        console.warn('⚠️ Transient Seerr search error; retrying:', {
          status: err.response?.status,
          attempt: attempt + 1,
        });
      }
    }

    await delay(delays[attempt]);
  }

  if (lastError) {
    if (axios.isAxiosError(lastError)) {
      console.error('❌ Seerr search failed:', {
        status: lastError.response?.status,
        data: lastError.response?.data,
        url: lastError.config?.url,
      });
    } else {
      console.error('❌ Seerr search failed:', lastError instanceof Error ? lastError.message : String(lastError));
    }
    throw new Error('Failed to search Overseerr');
  }

  return [];
}

export async function requestMedia(intent: MediaIntent, mediaId: number): Promise<unknown> {
  const { mediaType, profile } = intent;
  const mapKey = mediaType === 'movie' ? 'movies' : 'tv';
  const defaultProfile = profileMap[mapKey]?.default ?? profileMap.movies?.default ?? 0;

  // Seerr search results provide TMDB IDs for both movies and TV. Do not send
  // a TMDB ID again under the separate tvdbId field.
  const payload: {
    mediaType: 'movie' | 'tv';
    mediaId: number;
    profileId: number;
    seasons?: 'all' | number[];
  } = {
    mediaType,
    mediaId,
    profileId: profile ?? defaultProfile,
  };

  if (mediaType === 'tv') {
    payload.seasons = intent.seasons ?? [1];
  }

  console.log('📦 Requesting media with payload:', payload);
  try {
    const res = await axios.post(`${OVERSEERR_URL}/api/v1/request`, payload, {
      headers: overseerrHeaders,
    });
    if (!res.data) throw new Error('Invalid response from Seerr API');
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('❌ Seerr request failed:', {
        status: err.response?.status,
        data: err.response?.data,
        url: err.config?.url,
      });
    } else {
      console.error('❌ Seerr request failed:', err instanceof Error ? err.message : String(err));
    }
    throw new Error('Failed to request media');
  }
}
