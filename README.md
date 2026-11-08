# Rotating Dungeon — Tiles & Mask Walls

Foundry VTT **v11**, targeted at build **315**. System-independent; the requested D&D5e 2.4.1 configuration has not yet been tested live. This is **0.1.0-rc.1**, a release candidate with automated tests, not a claim of production validation.

## Features

- Scene Configuration checkbox **“This scene has Rotating Elements”**, disabled by default. Enabled scenes automatically show a compact floating GM panel with start/pause/reverse, pause-all, and full-settings access. Closing it is temporary; reopen from the Tiles toolbar. Disabling the scene stops simulation and hides the panel while leaving existing native walls in place. Re-enabling resumes slots that were marked running, without simulating offline time.
- Two optional, independently rotating tile slots in each scene. Each slot selects an existing scene tile by ID and image filename, or uses the currently selected tile. No scene IDs, artwork URLs, or tile IDs are hard-coded.
- Independent speed (0.01–10°/sec), direction, start, pause, and reverse. Existing placement, size, and starting rotation are retained. Other tiles remain untouched.
- Separate PNG wall mask for each tile, chosen/uploaded through Foundry's file picker. Generated native walls block vision, light, and movement according to slot settings.
- Tokens ride the floor. Ordinary dragging and supported keyboard movement are converted to floor-relative intents and committed by the controlling GM.
- Journal map pins (Foundry Note documents) ride with their rooms. Manual repositioning changes the anchor. Journal entry/page links and pin appearance remain intact.
- Scene AmbientLight documents follow floor position and orientation, including directional cones. Their brightness, color, animation, hidden state, wall behavior, and other settings are preserved. Lights have independent carry toggles and per-light attachment/opt-out.
- Automatic rectangular or radial-band floor membership, explicit token/pin attachment, and per-object opt-out. One tile can include disconnected inner and outer bands.
- Server-time-based artwork animation; authoritative, bounded-frequency geometry updates. No dependency on another module and no custom socket channel.

## Install from GitHub

In Foundry Setup → Add-on Modules → Install Module, paste this manifest URL:

```text
https://github.com/openkyle/dungeonrotate/releases/download/v0.1.0-rc.1/module.json
```

This prerelease targets Foundry v11. Live validation remains pending.

## Local installation

1. Extract `rotating-dungeon.zip` into `Data/modules/rotating-dungeon/`. The manifest must be at `Data/modules/rotating-dungeon/module.json`.
2. Restart Foundry and enable **Rotating Dungeon — Tiles & Mask Walls** under Manage Modules.
3. Open the scene as GM. In **Scene Configuration**, enable **This scene has Rotating Elements** and save. The floating panel opens automatically. Click **Settings** there, or open **Configure Settings → Module Settings → Rotating Dungeon → Configure current scene**.
4. Choose Slot A and optionally Slot B from the scene tile dropdowns. The third or any other unselected tile remains stationary.
5. Choose each tile's separate PNG mask and set speed/direction. Save configuration while both slots are paused.
6. Generate walls for each slot. Inspect them using Foundry's Walls layer before starting.
7. Choose floor regions and assign tokens/journal pins/lights where needed; save settings before running. Start each slot independently.

On The Forge, use the host's supported custom-module installation/upload process. Use the GitHub release manifest above for a hosted installation.

## Images and mask alignment

Map artwork stays on the ordinary Foundry Tile document and remains configurable there. The module's settings select existing tiles rather than duplicating their image configuration. To change the image, position, size, rotation, or texture scale of a managed tile, pause it, remove its generated walls, edit the tile normally, then regenerate the mask walls. To delete a tile, also clear its slot selection first.

The mask must represent the **unrotated image**, covering exactly the same rectangle. A tile already rotated 270° requires no preprocessing: the module rotates the mask geometry by 270° as well. Black pixels are solid; white pixels are open; alpha below 128 is open. Threshold defaults to 128. Opaque dark source pixels are conservatively retained during downsampling, so thin barriers do not disappear. Boundaries merge collinear grid edges without smoothing away holes. This can widen narrow walls and corridors; inspect the result.

Choose 64, 128, or 256 cells along the mask's longest dimension. Sources are limited to 16 megapixels; each slot is limited to 1,200 generated wall segments. Highly detailed masks may need cleaning or lower resolution. Masks may be stretched to the tile rectangle, so match the aspect ratio. Remote PNG hosts must permit pixel access (CORS); uploading the mask to Foundry/Forge storage is preferable when a remote mask fails.

Overhead tiles and non-unit texture scales are rejected. Mirroring must be baked into the artwork and mask. Tile elevation is preserved, but automatic floor attachment is 2D; elevation-aware floors/Levels are not implemented.

## Rings and overlapping tiles

Each tile rotates about **its own current center**. The module does not recenter or align artwork. If two rings need a common center, align them in Foundry before generating walls.

Choose **Radial bands** for circular/elliptical floors. Distances are fractions of the tile's half-width and half-height: `0-1` is the full ellipse; `0.5-1` is an outer ring. Multiple bands such as `0-0.25,0.6-1` describe a center region plus an outer ring on one tile. These are examples, not presets for any particular artwork. Set the actual band boundaries to match your images.

Automatic attachment uses token center or pin position, excludes solid mask pixels, and gives Slot B priority for newly overlapping objects. An existing rider stays with its slot until leaving its floor region. Explicit attachment to A/B overrides automatic region selection and stays attached outside those bands. Use **Do not carry** for stationary objects. Carry tokens, carry journal pins, and carry scene lights can be enabled separately per slot.

For journal pins, choose the pin by its text/ID in the panel and apply Automatic, A, B, or Do not carry. It need not be selected on the canvas. Journal contents are never edited.

For scene lights, choose the source by ID and coordinates in the panel and apply Automatic, A, B, or Do not carry. Light icons need not be selected on the canvas. Use explicit assignment for wall-mounted torches whose source points lie inside black mask pixels. Moving or turning an attached light updates its floor-relative position or heading.

## Movement and synchronization

The active GM with the lowest user ID **viewing this scene** coordinates updates. Use one browser session per GM account. A GM must keep the scene open for movement and rotation. When that GM leaves, another viewing GM takes over; without a viewing GM, geometry stops. The module does not simulate offline scenes or elapsed offline rotation. Catch-up is capped to two update intervals to avoid large jumps.

Player-owned token changes use Foundry's normal document permissions to submit a movement intent. The GM validates current ownership, age, destination mask occupancy, scene bounds, and native movement collision before committing it. An acknowledgement never overwrites a newer intent. This does not replace server security: as in Foundry itself, owners can manipulate their token documents through other modules or console code.

Normal dragging and keyboard moves have up to a geometry interval plus network latency before commitment. Very rapid repeated input can coalesce into the latest pending destination. There is no click-to-move pathfinding, automatic route planning, or full token-footprint collision solver. Token movement uses Foundry's center-based collision behavior.

The global game pause freezes rotation. Individual slot pause freezes only that floor and still permits normal player movement when the game is unpaused. Artwork can animate smoothly, but native walls, tokens, pins, lights, and vision update in discrete steps (default 5 Hz, configurable 1–10 Hz). Turn off smooth artwork if the visual lead is distracting. Movement between independently rotating walls is checked at the current geometry sample, not with continuous swept-volume physics. Floor carrying itself is not collision-constrained against other floors/static scene walls; design rotating regions with clearance.

## Lighting, fog, and compatibility limits

Native generated Wall documents participate in Foundry's vision/light/movement engines. Attached ambient lights move through normal AmbientLight document updates, so their native light sources update with them. Opted-out lights remain in scene coordinates. Ambient sounds are not floor riders. Token light/vision sources move through normal Token document updates; token facing is not forcibly rotated.

Fog exploration is scene-space and does not rotate. Disable **Fog Exploration** in Scene settings for this encounter; the module does not silently change the scene's fog settings or erase exploration.

All cooperating clients must load this module. Modules that replace movement, attach tokens, animate tiles, implement multilevel geometry, or rewrite wall behavior may conflict. Live validation with the user's active modules remains required. Disable the module only after pausing: documents remain at their last persisted positions, including generated walls. Use Remove walls first if those walls should also be removed. Hand-drawn walls are never deleted by that action.

If an update fails, the engine stops and reports an error. Fix the cause and use **Resume engine**. Foundry offers no transaction across Wall, Token, Note, AmbientLight, and Tile batches, so partial failures can briefly leave those document types out of step; a resumed running tick reconstructs geometry from its stored anchors. Keep scene backups and test the encounter before live play.

## Development and publishing

Node 18+ and Python 3, no npm dependencies:

```sh
npm run check
npm test
python3 tools/package.py
```

The source repository includes pure geometry tests and a mocked Foundry controller harness. They do not emulate the Foundry renderer, actual network timing, or third-party modules. See `docs/VALIDATION.md` for the live release gate and `docs/ARCHITECTURE.md` for implementation details.

To build release URLs after choosing a repository:

```sh
python3 tools/package.py --repository OWNER/REPOSITORY
```

Publish the resulting `dist/module.json` and `dist/rotating-dungeon.zip` together. CI validates and builds packages on pushes/PRs. The separate **Publish manually approved release** workflow runs only when manually dispatched; pushing code does not publish a release. Candidate manifests use their exact tag URL, while stable manifests use the latest-release URL. Select a new manifest explicitly when moving between release candidates.

No paid artwork, user scene data, tile identifiers, or journal content is distributed in this repository. License: MIT for this module's source.
