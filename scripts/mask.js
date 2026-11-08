import {rasterize, boundaries} from "./core.js";
export async function readMask(path, resolution, threshold) {
  if (!path || !/\.png(?:[?#].*)?$/i.test(path)) throw Error("Select a PNG mask using the file picker.");
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { image.src = ""; reject(Error("Mask image timed out.")); }, 20000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(Error("Cannot load mask. Check the path and image host permissions.")); };
    image.src = path;
  });
  if (image.naturalWidth * image.naturalHeight > 16777216) throw Error("Mask exceeds 16 megapixels. Resize the source PNG first.");
  const surface = document.createElement("canvas");
  surface.width = image.naturalWidth; surface.height = image.naturalHeight;
  const ctx = surface.getContext("2d", {willReadFrequently: true});
  ctx.drawImage(image, 0, 0);
  let pixels;
  try { pixels = ctx.getImageData(0, 0, surface.width, surface.height).data; }
  catch { throw Error("Mask pixels cannot be read. Upload the PNG to Foundry storage instead of a cross-origin image host."); }
  const mask = rasterize(pixels, surface.width, surface.height, resolution, threshold);
  const segments = boundaries(mask);
  if (!segments.length) throw Error("Mask has no solid pixels. Black is solid; white and transparent pixels are open.");
  if (segments.length > 1200) throw Error(`Mask produces ${segments.length} walls (limit 1200 per tile). Lower resolution or simplify the source PNG.`);
  return {mask, segments, sourceWidth: surface.width, sourceHeight: surface.height};
}
