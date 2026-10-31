import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoWrite } from "./autowrite";
import { defaultContent, parseContent, publishChecklist, type SiteContent } from "./content";
import { CANCELLATION_PRESETS } from "./policies";
import { applyContact, applyFacilities, applyLook, applyPlace, applyRooms, SetupError, wizardState } from "./setup";

function answered(): SiteContent {
  let c = autoWrite(defaultContent({ name: "River View Retreat", type: "homestay", city: "Rishikesh", state: "Uttarakhand", phone: "+91 98765 43210", email: "stay@example.com" }));
  c = applyPlace(c, { name: "River View Retreat", type: "homestay", highlights: ["river", "peaceful", "family", "couples", "home_food", "adventure", "not-a-key"], ownWords: "Run by our family since 1998." });
  c = applyRooms(
    c,
    [
      { id: "", name: "Garden Cottage", price: "3,500", adults: 3, bed: "king", view: "garden", features: ["air_conditioning", "balcony", "bogus"], mediaIds: ["p2", "unknown"] },
      { id: "", name: "Dormitory bed", price: "800", adults: 1, bed: "bunk", view: "", features: [], mediaIds: [] },
    ],
    new Set(["p1", "p2"]),
  );
  c = applyFacilities(c, { amenities: ["wifi", "parking", "breakfast", "pure_veg", "station_transfer"], checkIn: "13:00", checkOut: "11:00", cancellation: "flexible", pets: "allowed" });
  c = applyContact(c, { phone: "+91 98765 43210", whatsapp: "", email: "stay@example.com", line1: "12 Badrinath Road", locality: "Tapovan", city: "Rishikesh", state: "Uttarakhand", postalCode: "249192", nearby: [{ name: "Laxman Jhula", distance: "1.5 km" }, { name: "", distance: "" }] });
  return c;
}

describe("quick setup answers", () => {
  it("are validated and merged into the draft", () => {
    const c = answered();
    assert.deepEqual(c.property.highlights, ["river", "peaceful", "family", "couples", "home_food", "adventure"]);
    assert.equal(c.rooms[0].fromPrice, 350000);
    assert.equal(c.rooms[0].bedType, "King bed");
    assert.deepEqual(c.rooms[0].amenities, ["air_conditioning", "balcony"]);
    assert.deepEqual(c.rooms[0].mediaIds, ["p2"], "unknown photo ids are dropped");
    assert.equal(c.rooms[1].slug, "dormitory-bed");
    assert.equal(c.contact.whatsapp, c.contact.phone, "an empty WhatsApp number means the same as phone");
    assert.equal(c.nearby.length, 1);
    assert.equal(c.policies.cancellation, CANCELLATION_PRESETS.flexible.en);
    assert.throws(() => applyRooms(c, [{ ...wizardState(c).rooms[0], price: "abc" }], new Set()), SetupError);
  });

  it("keep an existing room's address when it is renamed", () => {
    const c = answered();
    const rooms = wizardState(c).rooms;
    const renamed = applyRooms(c, [{ ...rooms[0], name: "Garden Suite" }, rooms[1]], new Set(["p2"]));
    assert.equal(renamed.rooms[0].slug, "garden-cottage");
    assert.equal(renamed.rooms[0].id, c.rooms[0].id);
  });
});

describe("autoWrite", () => {
  it("writes complete English copy that fits the content model and can be published", () => {
    const c = parseContent(autoWrite(answered(), ["p1", "p2", "p3"]));
    assert.equal(c.property.tagline, "A peaceful homestay by the river in Rishikesh");
    assert.match(c.property.description, /^River View Retreat is a peaceful homestay by the river in Tapovan, Rishikesh, Uttarakhand\. It is a good choice for families and couples\. Guests enjoy home-cooked food and outdoor adventures nearby\./);
    assert.match(c.property.description, /\n\nRun by our family since 1998\.\n\n/);
    assert.match(c.property.description, /Choose from 2 room types: Garden Cottage and Dormitory bed\. Rooms start from ₹800 a night\./);
    assert.match(c.property.description, /Facilities include free Wi-Fi, parking, breakfast, a pure vegetarian kitchen and paid railway station pickups\./);
    assert.match(c.property.description, /Check-in is from 1 pm and check-out is until 11 am\./);
    assert.equal(c.rooms[0].description, "The Garden Cottage has a king-size bed and sleeps up to 3 guests. It comes with air conditioning and a balcony. Enjoy the garden view from the room.");
    assert.equal(c.rooms[0].summary, "King bed · Sleeps 3 · Garden view · Air conditioning · Balcony");
    assert.ok(c.faq.some((f) => f.q === "Is parking available?"));
    assert.ok(c.faq.some((f) => f.a === "Yes, breakfast is available. Our kitchen is pure vegetarian."));
    assert.ok(c.faq.some((f) => f.q === "How far is Laxman Jhula?" && f.a === "Laxman Jhula is 1.5 km from River View Retreat."));
    assert.ok(c.faq.some((f) => f.a.startsWith("Yes, we can arrange a paid pickup from the railway station.")));
    assert.ok(c.sections.faq && c.sections.dining && c.sections.nearby && c.sections.gallery);
    assert.equal(c.seo.title, "River View Retreat – Homestay in Rishikesh");
    assert.ok(c.seo.description.length <= 170);
    assert.deepEqual(c.hero.mediaIds, ["p1"]);
    assert.deepEqual(c.gallery.mediaIds, ["p1", "p2", "p3"]);
    assert.equal(c.seo.ogMediaId, "p1");
    assert.deepEqual(publishChecklist(c, true).blocking, []);
  });

  it("writes Hindi copy and moves preset policies and labels into Hindi", () => {
    const c = parseContent(autoWrite(applyLook(answered(), { template: "coastal", locale: "hi" }), ["p1"]));
    assert.equal(c.property.tagline, "Rishikesh में नदी के किनारे एक शांत होमस्टे");
    assert.match(c.property.description, /^River View Retreat Tapovan, Rishikesh में नदी के किनारे एक शांत होमस्टे है। यह जगह परिवारों और जोड़ों के लिए अच्छी है।/);
    assert.equal(c.policies.cancellation, CANCELLATION_PRESETS.flexible.hi);
    assert.equal(c.rooms[0].bedType, "किंग साइज़ बेड");
    assert.equal(c.about.title, "River View Retreat के बारे में");
    assert.equal(c.faq[0].q, "चेक-इन और चेक-आउट का समय क्या है?");
    assert.equal(c.theme.primary, "#0e7490", "template colours follow the template when not customised");
  });

  it("never overwrites text the owner edited, but keeps its own text up to date", () => {
    const first = autoWrite(answered(), ["p1"]);
    const edited: SiteContent = { ...first, property: { ...first.property, description: "Our own words, written by the owner." }, policies: { ...first.policies, pets: "Only small dogs, please." } };
    const again = autoWrite(applyLook(applyPlace(edited, { ...wizardState(edited).place, highlights: ["city_centre"] }), { template: "heritage", locale: "hi" }));
    assert.equal(again.property.description, "Our own words, written by the owner.");
    assert.equal(again.policies.pets, "Only small dogs, please.");
    assert.equal(again.property.tagline, "Rishikesh के बीचोंबीच एक होमस्टे");
    assert.equal(again.policies.cancellation, CANCELLATION_PRESETS.flexible.hi);
  });

  it("forgets fingerprints of deleted rooms", () => {
    const c = autoWrite(answered());
    const gone = autoWrite({ ...c, rooms: c.rooms.slice(1) });
    assert.ok(Object.keys(gone.autofill).every((k) => !k.includes(c.rooms[0].id)));
  });
});
