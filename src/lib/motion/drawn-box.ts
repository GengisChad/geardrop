/** A rectangle on the screen, in CSS pixels. */
export type ScreenBox = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

/**
 * Where a photo is really drawn. A packshot is an `object-fit: contain` image inside a padded
 * box, so the box says little about the picture: a square card plate and a wide sheet plate hold
 * the same top at different sizes, each centred in its own box. Motion that carries a photo from
 * one place to another has to travel between these, at one scale for both axes, or the photo is
 * stretched on the way (owner, 2026-11-19: "si stretcha e si deforma").
 *
 * `aspect` (width / height) stands in while the image has not been decoded yet.
 */
export function drawnBox(image: HTMLImageElement, aspect?: number): ScreenBox {
  const box = image.getBoundingClientRect();
  const style = getComputedStyle(image);
  const edge = (value: string) => Number.parseFloat(value) || 0;
  const left = box.left + edge(style.paddingLeft) + edge(style.borderLeftWidth);
  const top = box.top + edge(style.paddingTop) + edge(style.borderTopWidth);
  const width = Math.max(0, box.width - edge(style.paddingLeft) - edge(style.paddingRight) - edge(style.borderLeftWidth) - edge(style.borderRightWidth));
  const height = Math.max(0, box.height - edge(style.paddingTop) - edge(style.paddingBottom) - edge(style.borderTopWidth) - edge(style.borderBottomWidth));

  const ratio = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : aspect;
  if (!ratio || width === 0 || height === 0) return { left, top, width, height };

  // Contained and centred, as the browser draws it.
  const drawnWidth = Math.min(width, height * ratio);
  const drawnHeight = drawnWidth / ratio;
  return { left: left + (width - drawnWidth) / 2, top: top + (height - drawnHeight) / 2, width: drawnWidth, height: drawnHeight };
}
