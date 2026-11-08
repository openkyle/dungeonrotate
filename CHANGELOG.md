# 0.1.0-rc.3

- Removed the 16-megapixel mask rejection. Large images are processed automatically in bounded 1024 × 256 pixel scratch chunks, without allocating a full-size RGBA canvas buffer.
- Preserves every opaque dark source pixel during conservative reduction, including thin walls and pixels across chunk edges. Clears scratch chunks to avoid transparent pixels inheriting earlier geometry.
- Yields between chunk batches to keep the browser responsive and releases the scratch canvas afterward.
- 65 automated tests pass. A native-browser 5000 × 4000 (20 MP) mask passed conversion with thin-wall, far-edge, and transparency checks. Live Foundry multiplayer validation remains pending.

# 0.1.0-rc.2

- Compact, resizable, vertically scrolling settings; Browse / Upload remains visible even with long tile filenames.
- Target tile from either window: switches to Tiles mode and captures the next clicked tile. Floating controls display tile IDs. Escape, scene change, or timeout cancels targeting.
- Automatically discover same-directory `_mask` / `_Mask` image names. PNG is preferred, with matching WebP/JPEG extensions supported.
- Save & apply masks automatically creates aligned native vision/light/movement walls and replaces only managed walls. No manual Generate/Remove step. Readable WebP and extensionless image URLs no longer trigger a misleading PNG error.
- Scene journal pins and lights are discovered automatically. Artwork transparency excludes empty ring regions; pins/lights on wall pixels can attach.
- Added in-app Help and docs/HELP.md. Simplified settings and retained start/pause/reverse in floating controls.
- Added a persistent update manifest. Existing rc.1 users should install once using the new manifest URL in README.

Live Foundry multiplayer/lighting/performance validation remains pending.

# 0.1.0-rc.1

Initial Foundry v11 release candidate. Adds two scene-selectable rotating tiles with independent direction/speed, PNG masks converted into native walls, floor-relative token movement, moving journal pins and directional scene lights, a scene opt-in checkbox, floating GM controls, radial floor regions, attachment controls, and GM coordination.

Includes 48 automated tests, CI, reproducible packaging, and a manually triggered GitHub release workflow. Live multiplayer, renderer, lighting, performance, and third-party module validation remain pending. See docs/VALIDATION.md. No user artwork or scene identifiers are included.
