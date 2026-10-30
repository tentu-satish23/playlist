export type Lang = string;
export type Language = { code: Lang; label: string; descriptor: string; prompt: string };

/** 26 lyric-language tags supported for Jamendo discovery */
export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', descriptor: 'Independent voices, everywhere', prompt: 'Find English songs and artists' },
  { code: 'hi', label: 'Hindi', descriptor: 'Melody with a wide horizon', prompt: 'Find Hindi songs and artists' },
  { code: 'te', label: 'Telugu', descriptor: 'A new current from South India', prompt: 'Find Telugu songs and artists' },
  { code: 'ta', label: 'Tamil', descriptor: 'Classics and fresh indie from Tamil Nadu', prompt: 'Find Tamil songs and artists' },
  { code: 'ml', label: 'Malayalam', descriptor: 'Coastal stories in song', prompt: 'Find Malayalam songs and artists' },
  { code: 'kn', label: 'Kannada', descriptor: 'Voices from Karnataka', prompt: 'Find Kannada songs and artists' },
  { code: 'bn', label: 'Bengali', descriptor: 'Poetic currents from Bengal', prompt: 'Find Bengali songs and artists' },
  { code: 'mr', label: 'Marathi', descriptor: 'Rhythm from Maharashtra', prompt: 'Find Marathi songs and artists' },
  { code: 'gu', label: 'Gujarati', descriptor: 'Folk and modern Gujarati sound', prompt: 'Find Gujarati songs and artists' },
  { code: 'pa', label: 'Punjabi', descriptor: 'Bold beats and ballads', prompt: 'Find Punjabi songs and artists' },
  { code: 'ur', label: 'Urdu', descriptor: 'Ghazals and contemporary verse', prompt: 'Find Urdu songs and artists' },
  { code: 'es', label: 'Spanish', descriptor: 'Latin and Iberian independents', prompt: 'Find Spanish songs and artists' },
  { code: 'fr', label: 'French', descriptor: 'Chanson and modern indie', prompt: 'Find French songs and artists' },
  { code: 'pt', label: 'Portuguese', descriptor: 'Brazil, Portugal, and beyond', prompt: 'Find Portuguese songs and artists' },
  { code: 'de', label: 'German', descriptor: 'Central European indie', prompt: 'Find German songs and artists' },
  { code: 'it', label: 'Italian', descriptor: 'Mediterranean melodies', prompt: 'Find Italian songs and artists' },
  { code: 'ru', label: 'Russian', descriptor: 'Eastern European voices', prompt: 'Find Russian songs and artists' },
  { code: 'ja', label: 'Japanese', descriptor: 'J-indie and ambient', prompt: 'Find Japanese songs and artists' },
  { code: 'ko', label: 'Korean', descriptor: 'K-indie discovery', prompt: 'Find Korean songs and artists' },
  { code: 'zh', label: 'Chinese', descriptor: 'Mandarin and more', prompt: 'Find Chinese songs and artists' },
  { code: 'ar', label: 'Arabic', descriptor: 'North Africa and the Middle East', prompt: 'Find Arabic songs and artists' },
  { code: 'tr', label: 'Turkish', descriptor: 'Anatolian indie', prompt: 'Find Turkish songs and artists' },
  { code: 'id', label: 'Indonesian', descriptor: 'Archipelago rhythms', prompt: 'Find Indonesian songs and artists' },
  { code: 'th', label: 'Thai', descriptor: 'Southeast Asian sound', prompt: 'Find Thai songs and artists' },
  { code: 'vi', label: 'Vietnamese', descriptor: 'Indochina indie', prompt: 'Find Vietnamese songs and artists' },
  { code: 'nl', label: 'Dutch', descriptor: 'Low Countries independent', prompt: 'Find Dutch songs and artists' },
];

export const FEATURED_LANGUAGE_CODES = new Set(['en', 'hi', 'te', 'ta', 'es', 'fr']);
export const LANG_CODES = new Set(LANGUAGES.map((l) => l.code));
