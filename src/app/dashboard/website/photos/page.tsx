import { ActionButton, ActionForm } from "@/components/forms";
import { MediaPicker, PhotoUploader } from "@/components/media";
import { Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { photoAction, saveGalleryAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function PhotosEditor() {
  const { ctx, content: c, revision, photos, media } = await loadEditor();
  return (
    <>
      <PageHeader title="Photos" description="Upload once, then use photos on the home page, gallery and room pages. Guests trust real photos over stock images." actions={<PhotoUploader />} />

      {photos.length ? (
        <div className="space-y-6">
          <ActionForm action={saveGalleryAction} submitLabel="Save cover & gallery">
            <Revision value={revision} />
            <Card title="Home page cover">
              <MediaPicker name="heroMediaIds" media={media} selected={c.hero.mediaIds} max={6} />
            </Card>
            <Card title="Gallery" description="Shown on the home page (first 6) and on the Gallery page.">
              <MediaPicker name="galleryMediaIds" media={media} selected={c.gallery.mediaIds} max={80} />
            </Card>
          </ActionForm>

          <Card title={`Library (${photos.length})`} description="Describe each photo for guests using screen readers and for Google Images, e.g. “Balcony of the Deluxe room overlooking the Ganga”.">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id} className="rounded-lg border border-slate-200 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/media/${ctx.hotel.id}/${p.id}/480.webp`} alt={p.alt} className="h-40 w-full rounded object-cover" />
                  <p className="mt-1 text-xs text-slate-500">
                    {p.width}×{p.height}
                    {p.kind === "logo" ? " · logo" : ""}
                    {!p.alt ? <span className="ml-1 font-semibold text-amber-700">· needs a description</span> : null}
                  </p>
                  <ActionButton action={photoAction} label="Delete" variant="ghost" confirm="Delete this photo? It is removed from your draft; the live site keeps it until you publish." hidden={{ id: p.id, op: "delete" }} className="float-right" />
                  <AltForm id={p.id} alt={p.alt} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        <EmptyState title="No photos yet">Upload 10–30 photos: façade, rooms, bathrooms, views, dining and common areas.</EmptyState>
      )}
    </>
  );
}

function AltForm({ id, alt }: { id: string; alt: string }) {
  return (
    <form action={async (fd: FormData) => {
      "use server";
      await photoAction({ ok: false, message: "" }, fd);
    }} className="mt-2 flex gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="alt" defaultValue={alt} placeholder="Describe this photo" aria-label="Photo description" maxLength={200} className="py-1.5 text-xs" />
      <button className="rounded-lg border border-slate-300 px-2 text-xs font-semibold hover:bg-slate-50">Save</button>
    </form>
  );
}
