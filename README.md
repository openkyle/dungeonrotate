# Rotating Dungeon — Tiles & Mask Walls

Foundry VTT **v11**, targeted at build **315**. Version **0.1.0-rc.3** is a release candidate. The requested D&D5e 2.4.1 / Forge environment still needs live validation.

## Install or update

In Foundry Setup → Add-on Modules → Install Module, paste:

```text
https://raw.githubusercontent.com/openkyle/dungeonrotate/main/module.json
```

This manifest tracks future versions. If you installed rc.1 using its version-specific manifest, use the new URL once to replace that pinned installation, then reload the world and player clients. The module ID stays `rotating-dungeon`; existing scene settings stay in place. If Foundry does not replace an installed module through Install Module, uninstall/reinstall only the module using this URL; do not delete your world or scene data.

You can also extract the release ZIP into `Data/modules/rotating-dungeon/`. The manifest must sit directly inside that folder. Forge users can use the hosted manifest in the host’s supported custom-module installer.

## Quick start

1. Enable **This scene has Rotating Elements** in Scene Configuration.
2. Click **Target tile** in the floating window, then click the tile on the scene. The module switches to Tiles mode, shows the tile ID, and automatically applies a matching mask if found. Use A and optionally B; other tiles are untouched.
3. If needed, open **Settings → Browse / Upload**, choose a black-and-white mask, then click **Save & apply masks**. The regular tile dropdown remains available.
4. Start, pause, or reverse each tile from the floating controls. Set independent speeds/directions in Settings.

**[Full help and mask naming examples](docs/HELP.md)** are also available through Help in both module windows.

## Automatic masks and native walls

Put `Dungeon_mask.png` or `Dungeon_Mask.png` beside `Dungeon.webp`. For WebP/JPEG artwork, matching masks with the artwork’s extension are also checked after PNG. PNG/lossless WebP is recommended to avoid compression artifacts. Browsing supports readable image URLs without requiring a `.png` filename.

Masks must match the unrotated artwork rectangle and padding. The selected tile supplies position, width, height, and current rotation. Black pixels generate real Foundry walls blocking sight, light, and movement by default; white/transparent is open. The walls turn with the tile. You do not draw them manually.

Saving automatically builds/replaces managed walls; clearing the mask and saving removes that slot’s managed walls. Hand-drawn walls remain untouched. A tile without a mask may rotate without generated walls. No Generate/Remove buttons or start/pause controls clutter Settings.

Masks are conservatively downsampled to 64/128/256 cells and exact orthogonal boundary runs are merged without removing holes. Large source masks are scanned automatically in 1024 × 256 pixel chunks; there is no module-imposed 16-megapixel limit. Scratch RGBA reads are at most 1 MiB, although the browser still needs memory to decode the original image. The generated geometry limit remains 1,200 segments per tile. Lower resolution or simplify a detailed mask if needed. Mask generation errors identify the slot and file; images are validated before scene writes and failed writes attempt to restore the previous managed-wall setup.

## Automatic scene riders

Tokens, journal pins (Notes), and ambient lights already placed on the floor move with it. Journals/lights do not require selection lists. Journal links and light appearance are preserved; directional light cones rotate too. Tile transparency determines floor coverage by default, including disconnected rings and transparent holes. Pins and lights on wall pixels still attach. Slot B wins new overlaps; current riders retain their floor until they leave it.

For opaque artwork or ambiguous overlaps, Advanced settings offer whole-rectangle or radial-band regions. Carry tokens/pins/lights can each be disabled per slot. Old rc.1 per-pin/per-light assignments are ignored; detection is automatic. Save Settings once after upgrading to initialize transparency detection for existing configurations. Unsupported image hosts may block pixel access: choose rectangle/radial regions or upload readable artwork.

## Limits and operation

- A viewing GM coordinates native document updates, elected by lowest active user ID. Keep one browser session per GM identity. Without a viewing GM, simulation stops; offline time is not replayed.
- Tile artwork animates smoothly; walls, riders, and native vision update in discrete steps (default 5 Hz, configurable 1–10 Hz). Cross-document batches are not atomic. Actual renderer, network latency, and module compatibility require live testing.
- Normal token dragging/keyboard movement is coordinated through floor-relative intents. No pathfinding, swept-volume physics, or full-token-footprint collision is implemented. Floor carrying is not collision-constrained against static walls; leave clearance around rotating floors.
- Each tile rotates about its own center. Placement and initial rotation are preserved. The module never automatically recenters artwork. Overhead tiles and non-unit texture scales are rejected; mirroring must be baked into the images.
- Disable Fog Exploration for rotating encounters. Explored fog remains in scene coordinates. Ambient sounds are not carried; token facing is preserved.
- To edit tile artwork/placement, pause its rotation, set its slot to None and save, edit the tile normally, then target it again. This keeps generated wall geometry aligned.
- Automatic attachment is 2D; elevation-aware floor selection is not implemented. Movement, attachment, lighting, and multilevel modules may conflict. Full compatibility has not been claimed.
- Saving briefly holds the rotation loop while images load. Existing tile assignments resume their prior running state; newly assigned tiles stay paused. Disabling the scene toggle stops simulation and hides controls but leaves native walls in place.

## Development

Node 18+ and Python 3; no runtime npm dependencies:

```sh
npm run check
npm test
python3 tools/package.py --repository openkyle/dungeonrotate
```

See [validation](docs/VALIDATION.md) and [architecture](docs/ARCHITECTURE.md). CI runs syntax checks/tests. The manually dispatched release workflow builds and publishes the ZIP and manifest. The public main-branch manifest tracks the latest prepared release, while each ZIP is tied to its version tag. No user artwork, tile IDs, or journal content is included. MIT license.
