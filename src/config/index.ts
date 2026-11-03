import dotenv from 'dotenv';

dotenv.config();

export const OVERSEERR_URL = process.env.OVERSEERR_URL?.replace(/\/+$/, '');
export const OVERSEERR_API_KEY = process.env.OVERSEERR_API_KEY;

if (!OVERSEERR_URL || !OVERSEERR_API_KEY) {
  console.error('❌ Missing required environment variables: OVERSEERR_URL, OVERSEERR_API_KEY');
  process.exit(1);
}

export interface ProfileMap {
  [mediaType: string]: {
    [profileName: string]: number;
  };
}

export const profileMap: ProfileMap = {
  movies: {
    heb: 7,
    '4k': 8,
    default: 6,
  },
  tv: {
    '4k': 4,
    default: 6,
  },
};
