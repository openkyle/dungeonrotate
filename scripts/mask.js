import {rasterize, boundaries} from "./core.js";
export async function readMask(path, resolution, threshold) {
  path = String(path ?? "").trim();
  if (!path) throw Error("No wall mask is selected. Browse / Upload a black-and-white image, or leave the field empty to rotate without walls.");
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { image.src = ""; reject(Error("Mask image timed out.")); }, 20000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(Error("Cannot load this wall-mask image. Check that its URL points to an image you can open, or use Browse / Upload.")); };
    image.src = path;
  });
  if (image.naturalWidth * image.naturalHeight > 16777216) throw Error("Mask exceeds 16 megapixels. Resize the source mask image first.");
  const surface = document.createElement("canvas");
  surface.width = image.naturalWidth; surface.height = image.naturalHeight;
  const ctx = surface.getContext("2d", {willReadFrequently: true});
  ctx.drawImage(image, 0, 0);
  let pixels;
  try { pixels = ctx.getImageData(0, 0, surface.width, surface.height).data; }
  catch { throw Error("Mask pixels cannot be read. Upload the mask image to Foundry storage instead of a cross-origin image host."); }
  const mask = rasterize(pixels, surface.width, surface.height, resolution, threshold);
  const segments = boundaries(mask);
  if (!segments.length) throw Error("Mask has no solid pixels. Black is solid; white and transparent pixels are open.");
  if (segments.length > 1200) throw Error(`Mask produces ${segments.length} walls (limit 1200 per tile). Lower resolution or simplify the source mask image.`);
  return {mask, segments, sourceWidth: surface.width, sourceHeight: surface.height};
}

/** Filename convention only; never probes another host or directory. */
export function matchingMaskPaths(imagePath) {
  if (!imagePath) return [];
  const match = String(imagePath).match(/^(.+)\.([^./?#]+)([?#].*)?$/);
  if (!match) return [];
  const base = match[1].replace(/_mask$/i, ""), suffix = match[3] ?? "";
  const extension = match[2].toLowerCase();
  const extensions = [...new Set(["png", ...(["webp", "jpg", "jpeg"].includes(extension) ? [extension] : [])])];
  return extensions.flatMap(ext => [`${base}_mask.${ext}${suffix}`, `${base}_Mask.${ext}${suffix}`]);
}
export function imageExists(path) {
  return new Promise(resolve => {
    const image = new Image();
    let done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); image.onload = image.onerror = null; resolve(value); };
    const timer = setTimeout(() => finish(false), 4000);
    image.onload = () => finish(true); image.onerror = () => finish(false); image.src = path;
  });
}
export async function findMatchingMask(imagePath, probe = imageExists) {
  const paths = matchingMaskPaths(imagePath);
  const results = await Promise.all(paths.map(path => probe(path)));
  return paths.find((path, i) => results[i]) ?? "";
}
/** Alpha-based coverage makes transparent gaps in overlapping ring tiles non-floor. */
export async function readFloor(path) {
  if (!path) return null;
  const image = new Image(); image.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { image.onload = image.onerror = null; reject(Error("Tile artwork timed out. Choose a rectangular or radial floor region in Advanced settings.")); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(Error("Cannot read tile artwork for automatic floor detection. Choose a rectangular or radial floor region in Advanced settings.")); };
    image.src = path;
  });
  const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
  const surface = document.createElement("canvas");
  surface.width = Math.max(1, Math.ceil(image.naturalWidth * scale)); surface.height = Math.max(1, Math.ceil(image.naturalHeight * scale));
  const ctx = surface.getContext("2d", {willReadFrequently: true});
  ctx.drawImage(image, 0, 0, surface.width, surface.height);
  let pixels;
  try { pixels = ctx.getImageData(0, 0, surface.width, surface.height).data; }
  catch { throw Error("Tile image host blocks automatic floor detection. Choose a rectangular or radial floor region in Advanced settings."); }
  for (let i = 0; i < pixels.length; i += 4) pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
  return rasterize(pixels, surface.width, surface.height, 256, 128);
}
