export interface GenreOption {
  id: string;
  name: string;
  labelKey: string;
  emoji: string;
  tagline: string;
  taglineKey: string;
  desc: string;
  descKey: string;
  image: string;
  badge?: string;
  badgeKey?: string;
}

export const GENRE_OPTIONS: GenreOption[] = [
  {
    id: 'suspense',
    name: 'Suspense / Mystery',
    labelKey: 'genres.suspense_name',
    emoji: '🔍',
    tagline: 'High-stakes Secrets & Twists',
    taglineKey: 'genres.suspense_tagline',
    desc: 'Unravel deep conspiracies, undercover detective mysteries, and sudden shocking plot turns.',
    descKey: 'genres.suspense_desc',
    image: '/genres/suspense.jpg',
    badge: 'Trending',
    badgeKey: 'badges.trending',
  },
  {
    id: 'revenge',
    name: 'Revenge / Drama',
    labelKey: 'genres.revenge_name',
    emoji: '⚡',
    tagline: 'Comeback Arc & Identity',
    taglineKey: 'genres.revenge_tagline',
    desc: 'Hidden billionaire heir, underdog humiliation, and ruthless satisfying retribution.',
    descKey: 'genres.revenge_desc',
    image: '/genres/revenge.jpg',
    badge: 'Viral Hook',
    badgeKey: 'badges.viralhook',
  },
  {
    id: 'romance',
    name: 'Romance / Contract',
    labelKey: 'genres.romance_name',
    emoji: '💍',
    tagline: 'Contract Marriage & Lovers',
    taglineKey: 'genres.romance_tagline',
    desc: 'Fake marriage arrangements that turn into passionate romance against family opposition.',
    descKey: 'genres.romance_desc',
    image: '/genres/romance.jpg',
    badge: 'Popular',
    badgeKey: 'badges.popular',
  },
  {
    id: 'satire',
    name: 'Satire / Comedy',
    labelKey: 'genres.satire_name',
    emoji: '🎭',
    tagline: 'Fast Humor & Social Irony',
    taglineKey: 'genres.satire_tagline',
    desc: 'Hilarious miscommunications, workplace chaos, and viral comedic short-form situations.',
    descKey: 'genres.satire_desc',
    image: '/genres/satire.jpg',
  },
  {
    id: 'fantasy',
    name: 'Fantasy / Rebirth',
    labelKey: 'genres.fantasy_name',
    emoji: '🗡️',
    tagline: 'Second Chance & Powers',
    taglineKey: 'genres.fantasy_tagline',
    desc: 'Reincarnation with future knowledge, magical cultivation, and mythical creature bonds.',
    descKey: 'genres.fantasy_desc',
    image: '/genres/fantasy.jpg',
    badge: 'High CTR',
    badgeKey: 'badges.highctr',
  },
  {
    id: 'scifi',
    name: 'Sci-Fi / Cyberpunk',
    labelKey: 'genres.scifi_name',
    emoji: '🤖',
    tagline: 'Near-future Tech & AI',
    taglineKey: 'genres.scifi_tagline',
    desc: 'Rogue AI systems, virtual reality heists, corporate android surveillance, and neon dystopia.',
    descKey: 'genres.scifi_desc',
    image: '/genres/scifi.jpg',
  },
];
