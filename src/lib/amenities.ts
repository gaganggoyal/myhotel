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

const byKey = new Map(AMENITIES.map((a) => [a.key, a]));

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
