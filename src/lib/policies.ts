// Ready-written policy texts in each site language. Owners pick a preset in quick setup or
// write their own. Preset texts are recognised in either language, so they follow the site's
// language when it changes; text an owner wrote is never touched.

export type Locale = "en" | "hi";
type Texts = Record<Locale, string>;

export const CANCELLATION_PRESETS = {
  flexible: {
    en: "Free cancellation up to 24 hours before check-in. Cancellations after that are charged one night.",
    hi: "चेक-इन से 24 घंटे पहले तक रद्द करना मुफ़्त है। उसके बाद रद्द करने पर एक रात का शुल्क लिया जाएगा।",
  },
  moderate: {
    en: "Free cancellation up to 7 days before arrival. Cancellations within 7 days forfeit the deposit. No-shows are charged the first night.",
    hi: "आगमन से 7 दिन पहले तक रद्द करना मुफ़्त है। 7 दिन के भीतर रद्द करने पर अग्रिम राशि वापस नहीं होगी। न आने पर पहली रात का शुल्क लिया जाएगा।",
  },
  strict: {
    en: "Bookings are non-refundable once the deposit is paid. You can change your dates once, subject to availability, up to 7 days before arrival.",
    hi: "अग्रिम राशि जमा होने के बाद बुकिंग का पैसा वापस नहीं होता। उपलब्धता के अनुसार, आगमन से 7 दिन पहले तक आप एक बार तारीख़ें बदल सकते हैं।",
  },
} satisfies Record<string, Texts>;
export type CancellationPreset = keyof typeof CANCELLATION_PRESETS;

export const CANCELLATION_LABELS: Record<CancellationPreset, string> = {
  flexible: "Flexible",
  moderate: "Moderate",
  strict: "Strict",
};

export const PET_PRESETS = {
  allowed: {
    en: "Pets are welcome. Please tell us about your pet when you enquire.",
    hi: "पालतू जानवरों का स्वागत है। पूछताछ करते समय कृपया अपने पालतू के बारे में बताएँ।",
  },
  not_allowed: {
    en: "Pets are not allowed unless agreed in advance.",
    hi: "पहले से सहमति के बिना पालतू जानवरों की अनुमति नहीं है।",
  },
} satisfies Record<string, Texts>;
export type PetPreset = keyof typeof PET_PRESETS;

/** Policies every property starts with; quick setup does not ask about these. */
export const STANDARD_POLICIES = {
  payment: {
    en: "A deposit confirms your booking. The balance is payable at check-in by UPI, card or cash. We confirm your booking once we have received the deposit in our account.",
    hi: "अग्रिम राशि मिलने पर आपकी बुकिंग पक्की होती है। बाकी राशि चेक-इन के समय UPI, कार्ड या नकद से दी जा सकती है। हमारे खाते में अग्रिम राशि आने के बाद हम बुकिंग की पुष्टि करते हैं।",
  },
  children: {
    en: "Children up to 5 years stay free using existing bedding. An extra mattress is available on request at an additional charge.",
    hi: "5 वर्ष तक के बच्चे मौजूदा बिस्तर पर मुफ़्त ठहर सकते हैं। अनुरोध पर अतिरिक्त गद्दा अलग शुल्क पर उपलब्ध है।",
  },
  smoking: {
    en: "Smoking is not permitted inside rooms.",
    hi: "कमरों के अंदर धूम्रपान की अनुमति नहीं है।",
  },
  idProof: {
    en: "A valid government photo ID (Aadhaar, passport, driving licence or voter ID) is required for every adult guest at check-in. Foreign nationals must present a passport and valid visa.",
    hi: "चेक-इन के समय हर वयस्क अतिथि के लिए वैध सरकारी फ़ोटो पहचान पत्र (आधार, पासपोर्ट, ड्राइविंग लाइसेंस या वोटर आईडी) ज़रूरी है। विदेशी नागरिकों को पासपोर्ट और वैध वीज़ा दिखाना होगा।",
  },
  houseRules: {
    en: "Quiet hours are from 10 pm to 7 am. Visitors are welcome in common areas only.",
    hi: "रात 10 बजे से सुबह 7 बजे तक शांति बनाए रखें। मिलने आने वाले केवल सामान्य क्षेत्रों में आ सकते हैं।",
  },
  taxNote: {
    en: "Room rates shown are a guide and exclude GST, which is charged as applicable. Your confirmed quote will show the final amount.",
    hi: "दिखाई गई दरें अनुमानित हैं और इनमें GST शामिल नहीं है, जो नियमों के अनुसार लगेगा। आपके पक्के कोटेशन में अंतिम राशि दिखेगी।",
  },
} satisfies Record<string, Texts>;

export const WHY_DIRECT: Texts = {
  en: "Book directly with us for the best available rate and a personal reply from our team.",
  hi: "सबसे अच्छी उपलब्ध दर और हमारी टीम से सीधे जवाब के लिए हमसे सीधे बुक करें।",
};

/** Which preset a stored text is, in either language; null when the owner wrote their own. */
export function presetOf<K extends string>(table: Record<K, Texts>, text: string): K | null {
  const t = text.trim();
  for (const key of Object.keys(table) as K[]) {
    if (table[key].en === t || table[key].hi === t) return key;
  }
  return null;
}
