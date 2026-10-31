import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms";
import { MediaPicker } from "@/components/media";
import { Card, Checkbox, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { isCatalogAmenity, ROOM_FEATURES } from "@/lib/amenities";
import { paiseToRupeeInput } from "@/lib/format";
import { saveRoomAction } from "../../actions";
import { loadEditor, Revision } from "../../shared";

export default async function RoomEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { content: c, revision, media } = await loadEditor();
  const room = id === "new" ? null : c.rooms.find((r) => r.id === id);
  if (id !== "new" && !room) notFound();
  const custom = (room?.amenities ?? []).filter((a) => !isCatalogAmenity(a));
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/dashboard/website/rooms" className="text-slate-600 hover:underline">
          ← All rooms
        </Link>
      </p>
      <PageHeader title={room ? `Edit ${room.name}` : "Add a room type"} />
      <ActionForm action={saveRoomAction} submitLabel={room ? "Save room" : "Add room"}>
        <Revision value={revision} />
        <input type="hidden" name="id" value={room?.id ?? ""} />
        <Card title="Details">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Room name" htmlFor="name" className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={room?.name} required maxLength={80} placeholder="Deluxe River View Room" />
            </Field>
            <Field label="Short summary" htmlFor="summary" hint="Shown on room cards (one sentence)." className="sm:col-span-2">
              <Input id="summary" name="summary" defaultValue={room?.summary} maxLength={200} />
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <Textarea id="description" name="description" defaultValue={room?.description} rows={5} maxLength={3000} />
            </Field>
            <Field label="Bed" htmlFor="bedType">
              <Input id="bedType" name="bedType" defaultValue={room?.bedType} placeholder="1 king bed" maxLength={60} />
            </Field>
            <Field label="View" htmlFor="view">
              <Input id="view" name="view" defaultValue={room?.view} placeholder="River view" maxLength={60} />
            </Field>
            <Field label="Max adults" htmlFor="maxAdults">
              <Input id="maxAdults" name="maxAdults" type="number" min={1} max={20} defaultValue={room?.maxAdults ?? 2} required />
            </Field>
            <Field label="Max children" htmlFor="maxChildren">
              <Input id="maxChildren" name="maxChildren" type="number" min={0} max={10} defaultValue={room?.maxChildren ?? 1} />
            </Field>
            <Field label="Size (sq ft)" htmlFor="sizeSqft">
              <Input id="sizeSqft" name="sizeSqft" type="number" min={0} defaultValue={room?.sizeSqft ?? ""} />
            </Field>
            <Field label="Guide price per night (₹)" htmlFor="fromPrice" hint="Shown as “From ₹… per night” with a note that the final quote depends on dates. Leave blank to hide.">
              <Input id="fromPrice" name="fromPrice" inputMode="decimal" defaultValue={paiseToRupeeInput(room?.fromPrice)} placeholder="3500" />
            </Field>
          </div>
        </Card>
        <Card title="In the room">
          <div className="grid gap-3 sm:grid-cols-2">
            {ROOM_FEATURES.map((a) => (
              <Checkbox key={a.key} name="amenities" value={a.key} defaultChecked={room?.amenities.includes(a.key)} label={a.en} />
            ))}
          </div>
          <Field label="Other (one per line)" htmlFor="customAmenities" className="mt-4">
            <Textarea id="customAmenities" name="customAmenities" defaultValue={custom.join("\n")} rows={3} placeholder={"Private balcony\nBathtub"} />
          </Field>
        </Card>
        <Card title="Photos" description="Real photos of this room type. The first photo is used on the room card.">
          <MediaPicker name="mediaIds" media={media} selected={room?.mediaIds ?? []} max={20} />
        </Card>
        <Card>
          <Checkbox name="visible" defaultChecked={room?.visible ?? true} label="Show this room on the website" />
        </Card>
      </ActionForm>
    </>
  );
}
