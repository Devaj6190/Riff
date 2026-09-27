export const INTEREST_CHIPS = [
  "music", "gaming", "anime", "movies", "sports", "food", "travel",
  "fitness", "art", "memes", "books", "tech", "fashion", "outdoors",
];

// Every pickable interest, most popular first: order sets pill size in onboarding's cloud and how close to the search
// bar it lands. The cloud shows the top few; its search reaches them all.
export const INTERESTS = [
  "music", "movies", "gaming", "food", "travel", "fitness", "anime", "sports", "memes", "art", "tv shows", "coffee",
  "fashion", "books", "photography", "hiking", "basketball", "cooking", "k-pop", "hip-hop", "tech", "soccer",
  "concerts", "youtube", "pets", "dancing", "writing", "boba", "thrifting", "startups", "skincare", "football",
  "outdoors", "baking", "podcasts", "true crime", "horror", "astrology", "gym", "running", "nintendo", "valorant",
  "minecraft", "chess", "board games", "poetry", "design", "painting", "r&b", "pop", "indie", "rap", "edm", "rock",
  "jazz", "country", "reality tv", "marvel", "star wars", "harry potter", "sci-fi", "fantasy", "romance novels",
  "manga", "cosplay", "volleyball", "tennis", "swimming", "yoga", "climbing", "skating", "surfing", "snowboarding",
  "f1", "cars", "sneakers", "streetwear", "makeup", "nails", "tattoos", "vintage", "plants", "camping", "road trips",
  "beaches", "museums", "history", "science", "space", "psychology", "philosophy", "politics", "investing", "coding",
  "ai", "languages", "volunteering", "meditation", "journaling", "cats", "dogs", "karaoke", "theater", "musicals",
  "stand-up comedy", "singing", "guitar", "piano", "djing", "making music", "crochet", "pottery", "drawing",
  "video editing", "streaming", "esports", "pokemon", "puzzles", "trivia", "sushi", "spicy food", "brunch", "matcha",
  "baseball", "hockey", "golf", "boxing", "mma", "cycling", "martial arts", "skiing", "weightlifting", "pilates",
  "pickleball", "fantasy football", "fortnite", "league of legends", "call of duty", "roblox", "genshin impact",
  "retro games", "vr", "d&d", "k-dramas", "documentaries", "disney", "studio ghibli", "comics", "fan fiction",
  "self-help", "classical", "metal", "lo-fi", "afrobeats", "latin music", "reggaeton", "music festivals",
  "songwriting", "ramen", "tacos", "pizza", "bbq", "desserts", "street food", "animation", "graphic design",
  "digital art", "sewing", "knitting", "diy", "interior design", "architecture", "filmmaking", "acting", "gadgets",
  "cybersecurity", "3d printing", "economics", "finance", "astronomy", "mythology", "public speaking",
  "mental health", "self-improvement", "sustainability", "activism", "spirituality", "self-care", "nightlife",
  "backpacking", "national parks", "studying abroad", "birds", "horses", "gardening", "lego", "trading cards",
  "motorcycles", "internet culture", "twitch", "netflix", "sitcoms", "cartoons", "the office", "stranger things",
  "one piece", "naruto", "jujutsu kaisen", "demon slayer", "attack on titan", "spider-man", "dc comics",
  "taylor swift", "beyoncé", "drake", "bad bunny", "bts", "sza", "kendrick lamar", "the weeknd", "billie eilish",
  "olivia rodrigo", "broadway", "opera", "gospel", "blues", "punk", "emo", "grunge", "house music", "techno",
  "dubstep", "amapiano", "j-pop", "city pop", "bollywood", "telenovelas", "vinyl records", "open mics", "slam poetry",
  "a cappella", "choir", "marching band", "violin", "cello", "drums", "bass guitar", "ukulele", "saxophone",
  "music theory", "beatmaking", "hip-hop dance", "ballet", "salsa", "bachata", "breakdancing", "line dancing",
  "figure skating", "gymnastics", "cheerleading", "track and field", "lacrosse", "rugby", "cricket", "badminton",
  "table tennis", "ultimate frisbee", "disc golf", "bowling", "archery", "fencing", "rowing", "kayaking", "sailing",
  "scuba diving", "fishing", "horseback riding", "trail running", "marathons", "calisthenics", "crossfit", "parkour",
  "bouldering", "mountain biking", "longboarding", "wrestling", "wwe", "nba", "nfl", "premier league",
  "college football", "car meets", "sim racing", "drones", "robotics", "electronics", "hackathons", "web dev",
  "app dev", "game dev", "linux", "open source", "mechanical keyboards", "pc building", "crypto", "stocks",
  "entrepreneurship", "marketing", "content creation", "tiktok", "vlogging", "blogging", "classic literature",
  "manhwa", "webtoons", "light novels", "audiobooks", "book clubs", "creative writing", "screenwriting", "journalism",
  "debate", "model un", "mock trial", "law", "medicine", "neuroscience", "biology", "chemistry", "physics", "math",
  "geography", "linguistics", "learning japanese", "learning spanish", "learning korean", "sign language",
  "calligraphy", "origami", "embroidery", "jewelry making", "candle making", "woodworking", "scrapbooking",
  "film photography", "sketching", "watercolor", "sculpture", "street art", "nail art", "hair styling", "perfume",
  "watches", "vintage fashion", "grilling", "vegan food", "meal prep", "coffee brewing", "tea", "hot sauce",
  "korean food", "indian food", "mexican food", "italian food", "thai food", "dim sum", "food trucks",
  "farmers markets", "hot pot", "soul food", "birdwatching", "stargazing", "aquariums", "reptiles", "wildlife",
  "theme parks", "roller coasters", "escape rooms", "arcades", "mini golf", "go-karts", "halloween", "minimalism",
  "productivity", "bullet journaling", "conspiracy theories", "paranormal", "tarot", "crystals", "faith", "mentoring",
  "tutoring", "student government", "hbcu culture", "nba 2k", "madden", "ea fc", "apex legends", "overwatch",
  "rocket league", "smash bros", "zelda", "mario kart", "animal crossing", "stardew valley", "the sims", "elden ring",
  "among us", "tabletop rpgs", "magic the gathering", "yu-gi-oh", "rubik's cube", "crosswords", "wordle",
  "jigsaw puzzles", "romcoms", "film analysis", "letterboxd", "met gala",
];

export const INTERESTS_REQUIRED = 3;

export function normalizeInterest(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);
}

/** Trim, lowercase, drop empties and duplicates, keep the first three. */
export function normalizeInterests(raw: string[]): string[] {
  return [...new Set(raw.map(normalizeInterest).filter(Boolean))].slice(0, INTERESTS_REQUIRED);
}

/** Scorer: how many words each list of terms shares with `mine` (words over 2 letters, case-insensitive). */
export function overlap(mine: string[]): (terms: string[]) => number {
  const words = (terms: string[]) => new Set(terms.flatMap((t) => t.toLowerCase().split(/\W+/)).filter((w) => w.length > 2));
  const me = words(mine);
  return (terms) => [...words(terms)].filter((w) => me.has(w)).length;
}
