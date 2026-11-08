/** Pure geometry and configuration functions; no Foundry dependencies. */
export const ID = "rotating-dungeon";
export const SCHEMA = 1;
export const normalize = angle => ((angle % 360) + 360) % 360;
export function rotate([x, y], degrees) {
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}
export function toWorld(local, tile, angle = tile.rotation) {
  const [x, y] = rotate(local, angle);
  return [tile.x + tile.width / 2 + x, tile.y + tile.height / 2 + y];
}
export function toLocal([x, y], tile, angle = tile.rotation) {
  return rotate([x - tile.x - tile.width / 2, y - tile.y - tile.height / 2], -angle);
}
export function contains(local, tile) {
  return Math.abs(local[0]) < tile.width / 2 && Math.abs(local[1]) < tile.height / 2;
}
export function slotDefaults(id) {
  return {id, tileId: "", maskPath: "", speed: 0.5, direction: 1, carry: true, carryNotes: true, carryLights: true,
    vision: true, collision: true, running: false, footprint: "artwork", bands: "0-1", resolution: 256, threshold: 128, wallSmoothing: 1, mask: null, floor: null};
}
export function defaultState() { return {schema: SCHEMA, autoFloor: true, hz: 5, smooth: true, slots: [slotDefaults("a"), slotDefaults("b")]}; }
export function validateState(state, tiles) {
  if (state.schema !== SCHEMA) throw Error("Unsupported saved configuration version.");
  if (!Number.isInteger(state.hz) || state.hz < 1 || state.hz > 10) throw Error("Geometry update rate must be 1–10 Hz.");
  if (state.slots.length !== 2 || state.slots[0].id !== "a" || state.slots[1].id !== "b") throw Error("Exactly two slots (A and B) are required.");
  const used = new Set();
  for (const s of state.slots) {
    if (!Number.isFinite(s.speed) || s.speed < 0.01 || s.speed > 10) throw Error("Speed must be 0.01–10 degrees per second.");
    if (![1, -1].includes(s.direction)) throw Error("Invalid rotation direction.");
    if (![64, 128, 256].includes(s.resolution)) throw Error("Invalid mask resolution.");
    if (!Number.isInteger(s.threshold) || s.threshold < 1 || s.threshold > 254) throw Error("Mask threshold must be 1–254.");
    if (![0, .5, 1, 2].includes(s.wallSmoothing ?? 1)) throw Error("Invalid wall smoothing.");
    if (!["artwork", "rectangle", "radial"].includes(s.footprint)) throw Error("Invalid floor footprint.");
    parseBands(s.bands);
    if (!s.tileId) continue;
    if (used.has(s.tileId)) throw Error("Select a different tile for each slot.");
    used.add(s.tileId);
    const t = tiles.get(s.tileId);
    if (!t || t.width <= 0 || t.height <= 0) throw Error("A selected tile is missing or has invalid dimensions.");
    if (t.overhead || (t.texture?.scaleX ?? 1) !== 1 || (t.texture?.scaleY ?? 1) !== 1)
      throw Error("Use a non-overhead tile with texture scale X and Y equal to 1. Bake mirroring into the image.");
  }
  return state;
}
/** Conservative reduction: a cell is solid if ANY opaque dark source pixel is solid. */
export function createMaskRaster(width, height, resolution, threshold) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) throw Error("Invalid mask dimensions.");
  const scale = Math.min(1, resolution / Math.max(width, height));
  const w = Math.max(1, Math.ceil(width * scale)), h = Math.max(1, Math.ceil(height * scale));
  const cells = new Uint8Array(w * h);
  return {
    add(rgba, x0, y0, chunkWidth, chunkHeight) {
      if (rgba.length !== chunkWidth * chunkHeight * 4 || x0 < 0 || y0 < 0 || x0 + chunkWidth > width || y0 + chunkHeight > height) throw Error("Invalid mask pixel chunk.");
      for (let y = 0; y < chunkHeight; y++) {
        const row = Math.floor((y0 + y) * h / height) * w;
        for (let x = 0; x < chunkWidth; x++) {
          const i = (y * chunkWidth + x) * 4;
          if (rgba[i + 3] < 128) continue;
          if (.2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2] < threshold)
            cells[row + Math.floor((x0 + x) * w / width)] = 1;
        }
      }
    },
    finish() {
      const runs = [];
      for (let y = 0; y < h; y++) {
        const row = [];
        for (let x = 0; x < w;) {
          if (!cells[y * w + x]) { x++; continue; }
          const start = x;
          while (x < w && cells[y * w + x]) x++;
          row.push(start, x);
        }
        runs.push(row);
      }
      return {w, h, runs};
    }
  };
}
export function rasterize(rgba, width, height, resolution, threshold) {
  const raster = createMaskRaster(width, height, resolution, threshold);
  raster.add(rgba, 0, 0, width, height);
  return raster.finish();
}
export function solidCell(mask, x, y) {
  if (!mask || x < 0 || y < 0 || x >= mask.w || y >= mask.h) return false;
  const row = mask.runs[y];
  for (let i = 0; i < row.length; i += 2) if (x >= row[i] && x < row[i + 1]) return true;
  return false;
}
export function solidAt(mask, local, tile) {
  return solidCell(mask, Math.floor((local[0] / tile.width + .5) * mask.w), Math.floor((local[1] / tile.height + .5) * mask.h));
}
/** Exact orthogonal boundary runs, normalized about tile center. No topology-changing simplification. */
export function boundaries(mask) {
  const out = [], {w, h} = mask;
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w;) {
      if (solidCell(mask, x, y - 1) === solidCell(mask, x, y)) { x++; continue; }
      const start = x, side = solidCell(mask, x, y);
      while (x < w && solidCell(mask, x, y - 1) !== solidCell(mask, x, y) && solidCell(mask, x, y) === side) x++;
      out.push([start / w - .5, y / h - .5, x / w - .5, y / h - .5]);
    }
  }
  for (let x = 0; x <= w; x++) {
    for (let y = 0; y < h;) {
      if (solidCell(mask, x - 1, y) === solidCell(mask, x, y)) { y++; continue; }
      const start = y, side = solidCell(mask, x, y);
      while (y < h && solidCell(mask, x - 1, y) !== solidCell(mask, x, y) && solidCell(mask, x, y) === side) y++;
      out.push([x / w - .5, start / h - .5, x / w - .5, y / h - .5]);
    }
  }
  return out;
}
export function wallCoordinates(segment, tile, angle) {
  return [...toWorld([segment[0] * tile.width, segment[1] * tile.height], tile, angle),
    ...toWorld([segment[2] * tile.width, segment[3] * tile.height], tile, angle)].map(v => Math.round(v));
}
export function visualAngle(motion, now, hz) {
  if (!motion) return null;
  return normalize(motion.angle + motion.velocity * Math.max(0, Math.min(now - motion.at, 2000 / hz)) / 1000);
}

export function parseBands(text) {
  const bands = String(text).split(",").map(part => {
    const match = part.trim().match(/^(0(?:\.\d+)?|1(?:\.0+)?)\s*-\s*(0(?:\.\d+)?|1(?:\.0+)?)$/);
    if (!match || Number(match[1]) >= Number(match[2])) throw Error("Radial bands must be ranges from 0 to 1, e.g. 0-0.25,0.6-1.");
    return [Number(match[1]), Number(match[2])];
  });
  return bands;
}
export function onFloor(local, tile, slot) {
  if (slot.footprint === "artwork" && slot.floor) return solidAt(slot.floor, local, tile);
  if (slot.footprint !== "radial") return contains(local, tile);
  const r = Math.hypot(local[0] / (tile.width / 2), local[1] / (tile.height / 2));
  return parseBands(slot.bands).some(([a, b]) => r >= a && r < b);
}
