// Amenity catalog. Owners pick from these (labels are translated) or add their own text.

export type AmenityDef = { key: string; en: string; hi: string; group: "essentials" | "comfort" | "leisure" | "travel" };

export const AMENITIES: AmenityDef[] = [
  { key: "wifi", en: "Free Wi-Fi", hi: "मुफ़्त वाई-फ़ाई", group: "essentials" },
  { key: "parking", en: "Parking", hi: "पार्किंग", group: "essentials" },
  { key: "hot_water", en: "24-hour hot water", hi: "24 घंटे गर्म पानी", group: "essentials" },
  { key: "power_backup", en: "Power backup", hi: "पावर बैकअप", group: "essentials" },
  { key: "front_desk_24h", en: "24-hour front desk", hi: "24 घंटे रिसेप्शन", group: "essentials" },
  { key: "cctv", en: "CCTV in common areas", hi: "सामान्य क्षेत्रों में सीसीटीवी", group: "essentials" },
  { key: "elevator", en: "Lift", hi: "लिफ़्ट", group: "essentials" },
  { key: "air_conditioning", en: "Air conditioning", hi: "एयर कंडीशनिंग", group: "comfort" },
  { key: "room_heater", en: "Room heater", hi: "रूम हीटर", group: "comfort" },
  { key: "tv", en: "Television", hi: "टेलीविज़न", group: "comfort" },
  { key: "room_service", en: "Room service", hi: "रूम सर्विस", group: "comfort" },
  { key: "restaurant", en: "Restaurant", hi: "रेस्टोरेंट", group: "comfort" },
  { key: "breakfast", en: "Breakfast available", hi: "नाश्ता उपलब्ध", group: "comfort" },
  { key: "pure_veg", en: "Pure vegetarian kitchen", hi: "शुद्ध शाकाहारी रसोई", group: "comfort" },
  { key: "laundry", en: "Laundry", hi: "लॉन्ड्री", group: "comfort" },
  { key: "kettle", en: "Tea/coffee kettle", hi: "चाय/कॉफ़ी केतली", group: "comfort" },
  { key: "swimming_pool", en: "Swimming pool", hi: "स्विमिंग पूल", group: "leisure" },
  { key: "garden", en: "Garden", hi: "बगीचा", group: "leisure" },
  { key: "terrace", en: "Rooftop terrace", hi: "छत की टैरेस", group: "leisure" },
  { key: "bonfire", en: "Bonfire (on request)", hi: "अलाव (अनुरोध पर)", group: "leisure" },
  { key: "spa", en: "Spa", hi: "स्पा", group: "leisure" },
  { key: "yoga", en: "Yoga sessions", hi: "योग सत्र", group: "leisure" },
  { key: "gym", en: "Gym", hi: "जिम", group: "leisure" },
  { key: "kids_play", en: "Kids' play area", hi: "बच्चों का खेल क्षेत्र", group: "leisure" },
  { key: "airport_transfer", en: "Airport transfer (paid)", hi: "हवाई अड्डा ट्रांसफ़र (सशुल्क)", group: "travel" },
  { key: "station_transfer", en: "Railway station pickup (paid)", hi: "रेलवे स्टेशन पिकअप (सशुल्क)", group: "travel" },
  { key: "travel_desk", en: "Travel desk", hi: "ट्रैवल डेस्क", group: "travel" },
  { key: "doctor_on_call", en: "Doctor on call", hi: "डॉक्टर ऑन कॉल", group: "travel" },
  { key: "wheelchair", en: "Wheelchair accessible", hi: "व्हीलचेयर सुलभ", group: "travel" },
  { key: "pet_friendly", en: "Pet friendly", hi: "पालतू जानवरों के अनुकूल", group: "travel" },
  { key: "ev_charging", en: "EV charging", hi: "ईवी चार्जिंग", group: "travel" },
  { key: "banquet", en: "Banquet / event hall", hi: "बैंक्वेट / इवेंट हॉल", group: "travel" },
];

type Label = { key: string; en: string; hi: string };

/** In-room features that are not property amenities. */
const ROOM_ONLY: Label[] = [
  { key: "attached_bathroom", en: "Attached bathroom", hi: "अटैच्ड बाथरूम" },
  { key: "balcony", en: "Balcony", hi: "बालकनी" },
  { key: "work_desk", en: "Work desk", hi: "वर्क डेस्क" },
  { key: "wardrobe", en: "Wardrobe", hi: "अलमारी" },
  { key: "mini_fridge", en: "Mini fridge", hi: "मिनी फ़्रिज" },
  { key: "sitting_area", en: "Sitting area", hi: "बैठने की जगह" },
  { key: "bathtub", en: "Bathtub", hi: "बाथटब" },
];

const byKey = new Map<string, Label>([...AMENITIES, ...ROOM_ONLY].map((a) => [a.key, a]));

export const ROOM_FEATURE_KEYS = [
  "air_conditioning", "attached_bathroom", "hot_water", "tv", "wifi", "balcony", "room_heater", "kettle",
  "work_desk", "wardrobe", "mini_fridge", "sitting_area", "bathtub", "room_service", "wheelchair",
];
export const ROOM_FEATURES: Label[] = ROOM_FEATURE_KEYS.map((k) => byKey.get(k)!);

export const BED_TYPES = [
  { key: "double", en: "Double bed", hi: "डबल बेड", inline: "a double bed" },
  { key: "king", en: "King bed", hi: "किंग साइज़ बेड", inline: "a king-size bed" },
  { key: "queen", en: "Queen bed", hi: "क्वीन साइज़ बेड", inline: "a queen-size bed" },
  { key: "twin", en: "Twin beds", hi: "दो सिंगल बेड", inline: "two single beds" },
  { key: "double_single", en: "Double + single bed", hi: "डबल बेड + सिंगल बेड", inline: "a double bed and a single bed" },
  { key: "single", en: "Single bed", hi: "सिंगल बेड", inline: "a single bed" },
  { key: "bunk", en: "Bunk beds", hi: "बंक बेड", inline: "bunk beds" },
];

export const ROOM_VIEWS: Label[] = [
  { key: "mountain", en: "Mountain view", hi: "पहाड़ों का नज़ारा" },
  { key: "river", en: "River view", hi: "नदी का नज़ारा" },
  { key: "valley", en: "Valley view", hi: "घाटी का नज़ारा" },
  { key: "lake", en: "Lake view", hi: "झील का नज़ारा" },
  { key: "sea", en: "Sea view", hi: "समुद्र का नज़ारा" },
  { key: "garden", en: "Garden view", hi: "बगीचे का नज़ारा" },
  { key: "pool", en: "Pool view", hi: "पूल का नज़ारा" },
  { key: "city", en: "City view", hi: "शहर का नज़ारा" },
];

/** A label table entry whose text matches in either language. */
export function findLabel<T extends { en: string; hi: string }>(table: T[], text: string): T | undefined {
  const t = text.trim();
  return t ? table.find((x) => x.en === t || x.hi === t) : undefined;
}

/**
 * What makes a place special, picked as chips in quick setup and used to write the copy.
 * character: an adjective ("a peaceful homestay"); setting: where it is, with {city};
 * audience: who it suits; feature: something guests enjoy. `noun` reads after "Guests enjoy".
 */
export type Highlight = Label & {
  kind: "character" | "setting" | "audience" | "feature";
  word?: { en: string; hi: string };
  place?: { en: string; hi: string };
  noun: { en: string; hi: string };
};

export const HIGHLIGHTS: Highlight[] = [
  { key: "peaceful", kind: "character", en: "Peaceful and quiet", hi: "शांत माहौल", word: { en: "peaceful", hi: "शांत" }, noun: { en: "the peace and quiet", hi: "शांत माहौल" } },
  { key: "family_run", kind: "character", en: "Family-run", hi: "परिवार द्वारा संचालित", word: { en: "family-run", hi: "परिवार द्वारा चलाया जाने वाला" }, noun: { en: "the warm welcome of a family-run place", hi: "परिवार जैसा अपनापन" } },
  { key: "heritage", kind: "character", en: "Heritage building", hi: "हेरिटेज इमारत", word: { en: "heritage", hi: "हेरिटेज" }, noun: { en: "the character of a heritage building", hi: "हेरिटेज इमारत का अंदाज़" } },
  { key: "budget", kind: "character", en: "Great value", hi: "किफ़ायती", word: { en: "great-value", hi: "किफ़ायती" }, noun: { en: "great value for money", hi: "किफ़ायती दरें" } },
  { key: "luxury", kind: "character", en: "Luxury stay", hi: "लग्ज़री ठहराव", word: { en: "luxury", hi: "लग्ज़री" }, noun: { en: "luxury comforts", hi: "लग्ज़री आराम" } },
  { key: "river", kind: "setting", en: "By the river", hi: "नदी के किनारे", place: { en: "by the river in {city}", hi: "{city} में नदी के किनारे" }, noun: { en: "the riverside setting", hi: "नदी किनारे का माहौल" } },
  { key: "mountain_view", kind: "setting", en: "Mountain views", hi: "पहाड़ों का नज़ारा", place: { en: "with mountain views in {city}", hi: "{city} में पहाड़ों के नज़ारों वाला" }, noun: { en: "mountain views", hi: "पहाड़ों के नज़ारे" } },
  { key: "lake_view", kind: "setting", en: "Lake views", hi: "झील का नज़ारा", place: { en: "with lake views in {city}", hi: "{city} में झील के नज़ारों वाला" }, noun: { en: "lake views", hi: "झील के नज़ारे" } },
  { key: "beach", kind: "setting", en: "Near the beach", hi: "समुद्र तट के पास", place: { en: "near the beach in {city}", hi: "{city} में समुद्र तट के पास" }, noun: { en: "the beach close by", hi: "पास का समुद्र तट" } },
  { key: "nature", kind: "setting", en: "Surrounded by nature", hi: "हरियाली से घिरा", place: { en: "surrounded by nature in {city}", hi: "{city} में हरियाली से घिरा" }, noun: { en: "green, natural surroundings", hi: "हरा-भरा प्राकृतिक माहौल" } },
  { key: "temple", kind: "setting", en: "Near temples", hi: "मंदिरों के पास", place: { en: "near the temples in {city}", hi: "{city} में मंदिरों के पास" }, noun: { en: "the temples close by", hi: "पास के मंदिर" } },
  { key: "city_centre", kind: "setting", en: "In the city centre", hi: "शहर के बीचोंबीच", place: { en: "in the heart of {city}", hi: "{city} के बीचोंबीच" }, noun: { en: "the central location", hi: "शहर के बीच की जगह" } },
  { key: "station", kind: "setting", en: "Near the railway station", hi: "रेलवे स्टेशन के पास", place: { en: "near the railway station in {city}", hi: "{city} में रेलवे स्टेशन के पास" }, noun: { en: "easy access to the railway station", hi: "रेलवे स्टेशन से आसान पहुँच" } },
  { key: "airport", kind: "setting", en: "Near the airport", hi: "हवाई अड्डे के पास", place: { en: "near the airport in {city}", hi: "{city} में हवाई अड्डे के पास" }, noun: { en: "easy access to the airport", hi: "हवाई अड्डे से आसान पहुँच" } },
  { key: "highway", kind: "setting", en: "On the highway", hi: "हाईवे पर", place: { en: "on the highway near {city}", hi: "{city} के पास हाईवे पर" }, noun: { en: "an easy stop on the highway", hi: "हाईवे पर आसान ठहराव" } },
  { key: "family", kind: "audience", en: "Family-friendly", hi: "परिवारों के लिए", noun: { en: "families", hi: "परिवारों" } },
  { key: "couples", kind: "audience", en: "Couple-friendly", hi: "जोड़ों के लिए", noun: { en: "couples", hi: "जोड़ों" } },
  { key: "business", kind: "audience", en: "Good for work trips", hi: "काम की यात्राओं के लिए", noun: { en: "business travellers", hi: "व्यावसायिक यात्रियों" } },
  { key: "groups", kind: "audience", en: "Great for groups", hi: "समूहों के लिए", noun: { en: "groups", hi: "समूहों" } },
  { key: "pilgrims", kind: "audience", en: "Good for pilgrims", hi: "तीर्थयात्रियों के लिए", noun: { en: "pilgrims", hi: "तीर्थयात्रियों" } },
  { key: "weddings", kind: "audience", en: "Weddings & events", hi: "शादी और समारोह", noun: { en: "wedding parties", hi: "शादी के मेहमानों" } },
  { key: "home_food", kind: "feature", en: "Home-cooked food", hi: "घर जैसा खाना", noun: { en: "home-cooked food", hi: "घर जैसा खाना" } },
  { key: "farm", kind: "feature", en: "Farm stay", hi: "फ़ार्म स्टे", noun: { en: "life on the farm", hi: "खेतों के बीच का जीवन" } },
  { key: "adventure", kind: "feature", en: "Trekking & adventure nearby", hi: "पास में ट्रेकिंग और एडवेंचर", noun: { en: "outdoor adventures nearby", hi: "पास में एडवेंचर के मौके" } },
  { key: "sunsets", kind: "feature", en: "Sunrise & sunset views", hi: "सूर्योदय और सूर्यास्त", noun: { en: "beautiful sunsets", hi: "सूर्यास्त के सुंदर नज़ारे" } },
];

const highlightByKey = new Map(HIGHLIGHTS.map((h) => [h.key, h]));

export function highlightFor(key: string): Highlight | undefined {
  return highlightByKey.get(key);
}

/** How an amenity reads mid-sentence in English, where its label does not ("a balcony"). */
const PHRASE_EN: Record<string, string> = {
  front_desk_24h: "a 24-hour front desk",
  elevator: "a lift",
  room_heater: "a room heater",
  tv: "a TV",
  restaurant: "a restaurant",
  breakfast: "breakfast",
  pure_veg: "a pure vegetarian kitchen",
  kettle: "a tea/coffee kettle",
  swimming_pool: "a swimming pool",
  garden: "a garden",
  terrace: "a rooftop terrace",
  bonfire: "bonfires on request",
  spa: "a spa",
  gym: "a gym",
  kids_play: "a kids’ play area",
  airport_transfer: "paid airport transfers",
  station_transfer: "paid railway station pickups",
  travel_desk: "a travel desk",
  doctor_on_call: "a doctor on call",
  wheelchair: "wheelchair access",
  pet_friendly: "a welcome for pets",
  banquet: "a banquet hall",
  attached_bathroom: "an attached bathroom",
  balcony: "a balcony",
  work_desk: "a work desk",
  wardrobe: "a wardrobe",
  mini_fridge: "a mini fridge",
  sitting_area: "a sitting area",
  bathtub: "a bathtub",
};

export function amenityPhrase(key: string): string {
  const label = byKey.get(key)?.en ?? key;
  return PHRASE_EN[key] ?? (/^[A-Z][A-Z]/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1));
}

export function amenityLabel(keyOrText: string, locale: "en" | "hi"): string {
  const def = byKey.get(keyOrText);
  return def ? def[locale] : keyOrText;
}

export function isCatalogAmenity(key: string): boolean {
  return byKey.has(key);
}

export const AMENITY_GROUP_LABELS: Record<AmenityDef["group"], string> = {
  essentials: "Essentials",
  comfort: "Comfort & dining",
  leisure: "Leisure",
  travel: "Travel & access",
};
