import axios from 'axios';
import { OVERSEERR_URL, OVERSEERR_API_KEY, profileMap } from '../config/index.js';
import { MediaIntent } from './mediaIntentService.js';

export interface OverseerrSearchResult {
  id: number;
  mediaType?: string;
  releaseDate?: string;
  firstAirDate?: string;
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

export async function searchOverseerr(title: string): Promise<OverseerrSearchResult[]> {
  try {
    const query = encodeQueryValue(title);
    const url = `${OVERSEERR_URL}/api/v1/search?query=${query}`;
    console.log('🔍 Searching Seerr for:', title);
    const res = await axios.get(url, { headers: overseerrHeaders });
    return (res.data?.results ?? []) as OverseerrSearchResult[];
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('❌ Seerr search failed:', {
        status: err.response?.status,
        data: err.response?.data,
        url: err.config?.url,
      });
    } else {
      console.error('❌ Seerr search failed:', err instanceof Error ? err.message : String(err));
    }
    throw new Error('Failed to search Overseerr');
  }
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
    throw new Error('Failed to request Overseerr');
  }
}
