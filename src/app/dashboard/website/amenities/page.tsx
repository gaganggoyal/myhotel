import { ActionForm } from "@/components/forms";
import { Card, Checkbox, Field, PageHeader, Textarea } from "@/components/ui";
import { AMENITIES, AMENITY_GROUP_LABELS, isCatalogAmenity, type AmenityDef } from "@/lib/amenities";
import { saveAmenitiesAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function AmenitiesEditor() {
  const { content: c, revision } = await loadEditor();
  const groups = Object.keys(AMENITY_GROUP_LABELS) as AmenityDef["group"][];
  const custom = c.amenities.filter((a) => !isCatalogAmenity(a));
  return (
    <>
      <PageHeader title="Amenities" description="Tick what you actually offer. Labels are translated automatically when your site is in Hindi." />
      <ActionForm action={saveAmenitiesAction}>
        <Revision value={revision} />
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Card key={g} title={AMENITY_GROUP_LABELS[g]}>
              <div className="grid gap-3">
                {AMENITIES.filter((a) => a.group === g).map((a) => (
                  <Checkbox key={a.key} name="amenities" value={a.key} defaultChecked={c.amenities.includes(a.key)} label={a.en} />
                ))}
              </div>
            </Card>
          ))}
        </div>
        <Card title="Something else?">
          <Field label="Other amenities (one per line)" htmlFor="custom">
            <Textarea id="custom" name="custom" defaultValue={custom.join("\n")} rows={4} placeholder={"Ganga aarti walks\nRiver rafting desk"} />
          </Field>
        </Card>
      </ActionForm>
    </>
  );
}
