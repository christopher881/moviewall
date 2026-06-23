import PosterSlideshow from "@/components/PosterSlideshow";
import type { Rotation } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const ALLOWED: readonly number[] = [0, 90, 180, 270];

export default async function DisplayPage({
  params,
  searchParams
}: {
  params: Promise<{ displayId: string }>;
  searchParams: Promise<{ rotate?: string }>;
}) {
  const { displayId } = await params;
  const { rotate } = await searchParams;

  // Only treat the URL param as an override when it's actually present and valid.
  // Otherwise the slideshow falls back to the rotation saved on the display row.
  let urlRotation: Rotation | undefined = undefined;
  if (rotate !== undefined) {
    const r = Number(rotate);
    if (ALLOWED.includes(r)) urlRotation = r as Rotation;
  }

  return <PosterSlideshow displayId={displayId} urlRotation={urlRotation} />;
}
