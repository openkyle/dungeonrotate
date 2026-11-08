import {rasterize, createMaskRaster} from "./core.js";
import {smoothBoundaries} from "./contours.js";
export async function readMask(path, resolution, threshold, smoothing = 1) {
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
  const sourceWidth = image.naturalWidth, sourceHeight = image.naturalHeight;
  const raster = createMaskRaster(sourceWidth, sourceHeight, resolution, threshold);
  // Decode only small source rectangles into a scratch canvas. Scan every source pixel,
  // so resizing never drops thin black walls or blends them into white space.
  const surface = document.createElement("canvas");
  surface.width = Math.min(1024, sourceWidth); surface.height = Math.min(256, sourceHeight);
  const ctx = surface.getContext("2d", {willReadFrequently: true});
  if (!ctx) throw Error("The browser could not create a mask-processing canvas.");
  let chunks = 0;
  try {
    for (let y = 0; y < sourceHeight; y += 256) {
      for (let x = 0; x < sourceWidth; x += 1024) {
        const width = Math.min(1024, sourceWidth - x), height = Math.min(256, sourceHeight - y);
        ctx.clearRect(0, 0, surface.width, surface.height);
        ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
        let pixels;
        try { pixels = ctx.getImageData(0, 0, width, height).data; }
        catch { throw Error("Mask pixels cannot be read. Upload the mask image to Foundry storage instead of a cross-origin image host."); }
        raster.add(pixels, x, y, width, height);
        if (++chunks % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } finally { surface.width = 1; surface.height = 1; }
  const mask = raster.finish();
  const segments = smoothBoundaries(mask, smoothing);
  if (!segments.length) throw Error("Mask has no solid pixels. Black is solid; white and transparent pixels are open.");
  if (segments.length > 1200) throw Error(`Mask produces ${segments.length} walls (limit 1200 per tile). Lower resolution or simplify the source mask image.`);
  return {mask, segments, sourceWidth, sourceHeight};
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
/** Ask the configured storage provider for existing files; never GET guessed URLs. */
export async function listMaskFiles(imagePath) {
  const picker = new FilePicker({type: "image", current: imagePath});
  const source = picker.activeSource;
  const target = picker.target;
  if (!source || target == null) return [];
  const result = await FilePicker.browse(source, target, {
    extensions: [".png", ".webp", ".jpg", ".jpeg"],
    ...(source === "s3" ? {bucket: picker.sources.s3.bucket} : {})
  });
  return result?.files ?? [];
}
function pathKey(path) {
  // Storage providers can return encoded or decoded filenames. Decode components
  // individually so an escaped slash cannot change the directory being matched.
  return String(path).split(/[?#]/)[0].split("/").map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  }).map(part => encodeURIComponent(part)).join("/");
}
export async function findMatchingMask(imagePath, listFiles = listMaskFiles) {
  const paths = matchingMaskPaths(imagePath);
  if (!paths.length) return "";
  try {
    const files = await listFiles(imagePath);
    for (const candidate of paths) {
      const match = files.find(file => pathKey(file) === pathKey(candidate));
      if (match) return match;
    }
  } catch (error) {
    console.debug("rotating-dungeon | Mask folder lookup unavailable; use Browse / Upload.", error);
  }
  return "";
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
