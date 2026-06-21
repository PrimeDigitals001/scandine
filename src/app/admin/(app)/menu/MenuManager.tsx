"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus, Pencil, Trash2, AlertCircle, ImageIcon, Video, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  saveItemAction,
  setItemAvailabilityAction,
  deleteItemAction,
  createCategoryAction,
} from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/types";
import type { MenuCategoryRow, MenuItemRow } from "@/lib/admin/data";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";
import { VegDot } from "@/components/ui/VegDot";
import { PriceTag } from "@/components/ui/PriceTag";
import { Card } from "@/components/ui/Card";

interface Draft {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: string;
  is_veg: boolean;
  is_available: boolean;
  is_daily_special: boolean;
  image_url: string;
  video_url: string;
}

const empty: ActionState = {};

export function MenuManager({
  categories,
  items,
  restaurantId,
}: {
  categories: MenuCategoryRow[];
  items: MenuItemRow[];
  restaurantId: string;
}) {
  const blank = (): Draft => ({
    id: "",
    category_id: categories[0]?.id ?? "",
    name: "",
    description: "",
    price: "",
    is_veg: true,
    is_available: true,
    is_daily_special: false,
    image_url: "",
    video_url: "",
  });

  const [draft, setDraft] = React.useState<Draft>(blank);
  const [imgPreview, setImgPreview] = React.useState<string | null>(null);
  const [videoName, setVideoName] = React.useState<string | null>(null);
  const [saveState, saveAction, savePending] = useActionState(saveItemAction, empty);
  const [catState, catAction, catPending] = useActionState(createCategoryAction, empty);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // switch the editor to a draft and drop any locally-previewed upload
  const pickDraft = (d: Draft) => {
    setImgPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoName(null);
    setDraft(d);
  };
  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    setImgPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Menu</h1>
          <p className="mt-0.5 text-sm text-muted">
            Add items, set prices, and toggle what&apos;s sold out.
          </p>
        </div>
        <Button variant="outline" onClick={() => pickDraft(blank())}>
          <Plus className="size-4" />
          New item
        </Button>
      </div>

      {/* Item editor */}
      {categories.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Add a category first, then you can add items to it.
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-4 text-sm font-bold tracking-tight text-ink">
            {draft.id ? "Edit item" : "Add a new item"}
          </h2>
          <form action={saveAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={draft.id} />
            <input type="hidden" name="restaurant_id" value={restaurantId} />

            {/* Photo */}
            <Field
              label="Photo"
              htmlFor="image"
              hint="PNG, JPG or WebP · up to 5 MB. Optional — shown to customers."
            >
              <div className="flex items-center gap-3">
                {imgPreview || draft.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgPreview || draft.image_url}
                    alt=""
                    className="size-16 shrink-0 rounded-control border border-hairline object-cover"
                  />
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-control border border-dashed border-hairline text-faint">
                    <ImageIcon className="size-5" />
                  </div>
                )}
                <input
                  id="image"
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => onPickImage(e.target.files?.[0])}
                  className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
              </div>
            </Field>

            {/* Video (optional) — plays instead of the photo for customers */}
            <Field
              label="Video (optional)"
              htmlFor="video"
              hint="MP4 or WebM · up to 20 MB. A short looping clip shown in place of the photo."
            >
              <div className="flex items-center gap-3">
                <div className="grid size-16 shrink-0 place-items-center rounded-control border border-dashed border-hairline text-faint">
                  <Video className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    id="video"
                    name="video"
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => setVideoName(e.target.files?.[0]?.name ?? null)}
                    className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
                  />
                  <p className="mt-1 truncate text-[11px] text-faint">
                    {videoName
                      ? videoName
                      : draft.video_url
                        ? "A video is on file — pick a new one to replace it."
                        : "No video yet."}
                  </p>
                </div>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="name" required>
                <Input
                  id="name"
                  name="name"
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Nutella Brownie"
                  required
                />
              </Field>
              <Field label="Category" htmlFor="category_id">
                <Select
                  id="category_id"
                  name="category_id"
                  value={draft.category_id}
                  onChange={(e) => set({ category_id: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                name="description"
                value={draft.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Warm, fudgy, OREO crumble on top"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price ₹" htmlFor="price" required>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min={0}
                  step="1"
                  value={draft.price}
                  onChange={(e) => set({ price: e.target.value })}
                  placeholder="150"
                  required
                />
              </Field>
              <div className="flex items-end gap-5 pb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    name="is_veg"
                    checked={draft.is_veg}
                    onChange={(e) => set({ is_veg: e.target.checked })}
                    className="size-4 accent-success"
                  />
                  Veg
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    name="is_available"
                    checked={draft.is_available}
                    onChange={(e) => set({ is_available: e.target.checked })}
                    className="size-4 accent-brand-500"
                  />
                  Available
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    name="is_daily_special"
                    checked={draft.is_daily_special}
                    onChange={(e) => set({ is_daily_special: e.target.checked })}
                    className="size-4 accent-brand-500"
                  />
                  Today&apos;s special
                </label>
              </div>
            </div>

            {saveState.error && <ErrorLine text={saveState.error} />}
            {saveState.ok && (
              <p className="text-sm font-medium text-success-strong">Saved ✓</p>
            )}

            <div className="flex justify-end gap-2">
              {draft.id && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => pickDraft(blank())}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" loading={savePending}>
                {draft.id ? "Save changes" : "Add item"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Categories + items */}
      <div className="flex flex-col gap-5">
        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category_id === cat.id);
          return (
            <div key={cat.id}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
                {cat.name} ({catItems.length})
              </h2>
              <div className="flex flex-col gap-2">
                {catItems.map((it) => (
                  <div
                    key={it.id}
                    className={cn(
                      "flex items-center gap-3 rounded-card border border-hairline/70 bg-surface p-3",
                      !it.is_available && "opacity-60",
                    )}
                  >
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image_url}
                        alt=""
                        className="size-10 shrink-0 rounded-control object-cover"
                      />
                    ) : null}
                    <VegDot veg={it.is_veg} size={14} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                        {it.name}
                        {it.is_daily_special && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
                            <Sparkles className="size-3" /> Special
                          </span>
                        )}
                        {it.video_url && (
                          <Video className="size-3.5 shrink-0 text-muted" aria-label="Has a video" />
                        )}
                      </p>
                      {it.description && (
                        <p className="truncate text-xs text-muted">
                          {it.description}
                        </p>
                      )}
                    </div>
                    <PriceTag amount={it.price} size="sm" />
                    <form action={setItemAvailabilityAction}>
                      <input type="hidden" name="id" value={it.id} />
                      <input
                        type="hidden"
                        name="available"
                        value={(!it.is_available).toString()}
                      />
                      <button
                        type="submit"
                        className={cn(
                          "rounded-pill px-2.5 py-1 text-xs font-semibold transition-colors active:scale-95",
                          it.is_available
                            ? "bg-success-soft text-success-strong"
                            : "bg-surface-sunken text-muted",
                        )}
                      >
                        {it.is_available ? "Available" : "Sold out"}
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() =>
                        pickDraft({
                          id: it.id,
                          category_id: it.category_id ?? cat.id,
                          name: it.name,
                          description: it.description ?? "",
                          price: String(it.price),
                          is_veg: it.is_veg,
                          is_available: it.is_available,
                          is_daily_special: it.is_daily_special,
                          image_url: it.image_url ?? "",
                          video_url: it.video_url ?? "",
                        })
                      }
                      className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-canvas hover:text-ink active:scale-95"
                      title="Edit"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <form action={deleteItemAction}>
                      <input type="hidden" name="id" value={it.id} />
                      <button
                        type="submit"
                        onClick={(e) => {
                          if (!confirm(`Delete "${it.name}"?`)) e.preventDefault();
                        }}
                        className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft hover:text-danger active:scale-95"
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                ))}
                {catItems.length === 0 && (
                  <p className="px-1 text-sm text-muted">No items yet.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add category */}
      <Card>
        <h2 className="mb-3 text-sm font-bold tracking-tight text-ink">
          Add a category
        </h2>
        <form action={catAction} className="flex items-end gap-2">
          <input type="hidden" name="restaurant_id" value={restaurantId} />
          <div className="flex-1">
            <Input name="name" placeholder="e.g. Desserts" required />
          </div>
          <Button type="submit" variant="outline" loading={catPending}>
            Add
          </Button>
        </form>
        {catState.error && <ErrorLine text={catState.error} />}
      </Card>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
      <AlertCircle className="size-4 shrink-0" />
      {text}
    </p>
  );
}
