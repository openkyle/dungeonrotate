# 0.1.0-rc.6

- Removed continuously restarted native token animations for passive floor carrying. These can leave tokens busy during clicks and drags. Deliberate token moves retain bounded drag animation, which ends instead of transitioning into another carry animation. Tile artwork remains smooth; passive token carrying returns to sampled updates for interaction reliability.
- Target Tile restores the previous canvas layer on selection, Escape, or timeout. It does not override a manually selected layer or restore during scene teardown.
- Added Reset rotation per slot: pauses and returns the floor, walls, tokens, notes, and lights to its recorded setup angle. Older configurations adopt their first angle after updating as the baseline.
- Newly drawn walls attach to nearby rotating walls or the floor containing their midpoint. Doors and wall properties remain editable; mask rebuilds preserve manual walls. Walls outside rotating floors remain static.
- 88 automated tests pass. Live token interaction with the user’s Foundry environment remains to be confirmed.

# 0.1.0-rc.5

- Added Light, Balanced, Strong, and Off wall smoothing. Traces closed outlines, averages small edge details by arc length, then fits diagonal wall segments. Preserves small rectangular barriers and contact points; rejects collapsed/inverted contours and falls back to exact boundaries on crossing geometry.
- New slots default to 256-pixel mask resolution. Existing scenes retain their resolution; select 256 and Save & apply masks to rebuild finer walls. Existing walls do not change until saved.
- Supplied mask-screenshot browser preview: 1,158 exact wall segments, 335 Balanced, 259 Strong. No user artwork is included in the release.
- Smooth tile animation now also runs for selected tiles and is scheduled before canvas rendering. Carried tokens use native animation between document updates. Drag movement keeps its animation deadline through subsequent rotation updates instead of snapping; explicit nonanimated moves remain supported.
- Rotation updates use render:false to avoid repeatedly redrawing sheets. Floating controls refresh only for configuration/name changes, and settings retain unsaved input through external render requests.
- User confirmed the earlier Start issue was Foundry's global game pause. rc.4 pause/status feedback remains included.
- 81 automated tests pass, including contour closure/door openings, slow rotation, drag animation deadlines, and draft preservation. Native-browser contour preview verified; live multiplayer animation/third-party compatibility still needs user validation. Walls and scene-light geometry continue updating at the configured frequency rather than every display frame.

# 0.1.0-rc.4

- Replaced guessed mask-image downloads with one storage-provider folder listing. Auto-discovery no longer issues GET requests for nonexistent `_mask` variants. If a folder cannot be listed, select the mask with Browse / Upload.
- Floating controls now show “Waiting for unpause” when Foundry is paused. Start explains that Space resumes the game; the panel refreshes when global pause changes.
- Engine failures refresh the panel with the actual error. Start refuses to silently arm a failed engine and points to Resume engine.
- Added a compact read-only `game.modules.get("rotating-dungeon").api.diagnostics()` report for troubleshooting non-moving tiles.
- 70 automated tests pass, including slow-speed Start/pause/unpause and folder discovery without image probes. The reported live Start failure is not yet reproduced; multiplayer and Forge integration validation remain pending.

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
