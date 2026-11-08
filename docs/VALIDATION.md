# Validation and release gate

## Completed locally

- 65 automated Node tests: geometry transforms, opposite rotations, normalized boundaries, conservative mask reduction, holes/islands, alpha handling, radial bands, configuration validation, drift-free local anchors, ownership checks, stale requests, serialization, queued-movement races, native-collision delegation, global/slot pause, journal-pin movement/link retention, opt-outs, overlap precedence, owned-wall cleanup, scene opt-in and disabled movement, floating-panel data, light positioning/cone rotation, manual light changes, and preservation of illumination settings.
- JavaScript syntax checks for all seven module source files.
- Release packaging and archive integrity checks.

The controller tests use a purpose-built mock of Foundry document collections and update transport. Native collision itself is mocked, not proven by those tests. No live Foundry session or actual source masks were available in the development workspace. Runtime v11 build 315 / D&D5e 2.4.1 validation is pending. The manifest intentionally does not claim a verified version.

## rc.2 additional local verification

- Actual Handlebars settings template rendered with a long-filename fixture in a browser harness. At 560 px and 380 px panel widths, content scrollWidth equals clientWidth and Browse / Upload remains within the panel, including expanded advanced settings. This harness approximates Foundry styling; it is not live Foundry validation.
- Automatic mask replacement, missing/invalid mask preservation, failed-state-save rollback, tile-switch pause, transparent floor coverage, wall-mounted pin/light discovery, target selection and cancellation, matching filenames, WebP and extensionless image decoding.
- In-app Help and updated user guide included.

## Required live checks before calling this stable

Record result, Foundry/system versions, browser, relevant modules, wall count, update rate, latency, and console errors for each case.

| Check | Expected outcome | Status |
|---|---|---|
| Enable module and open panel | No load/template errors; all scene tiles listed | Pending |
| Enable/disable scene opt-in and switch scenes | Floating GM panel appears/hides; disabled scenes do not simulate | Pending |
| Floating controls: start/pause/reverse/pause-all/settings | Operate intended slot; reopen after closing; players have no GM controls | Pending |
| Pick two tiles; leave third unselected | Only selected tiles move; no hard-coded artwork | Pending |
| Start at existing 270° rotation | No snap or doubled rotation; mask aligns | Pending |
| Different speeds and opposing directions | Independent rotation; correct centers | Pending |
| Start/pause/reverse/global pause | No discontinuity beyond bounded artwork extrapolation | Pending |
| Image mask fixture, then actual masks | Native walls match; holes retained; cap enforced | Pending |
| Player vision + token light + ambient light | Walls occlude correctly at each sampled angle | Pending |
| Player drag and keyboard movement | Intent commits without being overwritten; walls block | Pending |
| Two players moving simultaneously | No cross-token interference or stale teleports | Pending |
| Ring transitions/overlap/explicit assignment | Correct floor selected; opt-outs stationary | Pending |
| Journal pins on each ring | Pins stay in rooms; links still open correct pages | Pending |
| Ambient light and directional cone on each ring | Source stays in room; cone rotates; brightness/color/animation preserved | Pending |
| Move/turn attached light; opt-out static source | Local anchor/heading updates; opted-out light remains stationary | Pending |
| Drag pin while running | New local anchor persists | Pending |
| Join mid-rotation / refresh player | Current angle and attachments load correctly | Pending |
| GM switches scene, disconnects, second GM takes over | Rotation stops or transfers; no offline catch-up jump | Pending |
| Player connection with 200–500 ms latency | No lost intent acknowledgement; acceptable movement delay | Pending |
| 5 Hz with representative token/pin/wall counts | Acceptable FPS, network load, and vision cadence | Pending |
| 1 Hz and 10 Hz; speed range | Clear tradeoffs; no overlapping local write batches | Pending |
| Other movement/lighting/tile modules enabled | No incompatible interceptors or competing animation | Pending |
| Clear mask and save | Hand-drawn/static walls and journal links untouched | Pending |
| Reload after pause; disable/re-enable | Persisted positions retained; resume has no jump | Pending |

## Minimal test scene

Use a copy of a scene with two non-overhead, unmirrored tiles. `tests/fixtures/mask-room.png` is a tiny synthetic PNG suitable for checking generation without paid artwork; use it as both a test tile texture and its wall mask. Enable the scene opt-in, generate walls, add a sight-enabled player token, ambient light, and linked journal pin in white space, connect a player client, and exercise the cases above. Use a non-global-light scene for the vision check and disable fog exploration. Then repeat using the intended ring artwork and masks.

## Publication status

The source and installer are prepared for publication in **openkyle/dungeonrotate** as an explicitly labeled **release candidate**. A stable compatibility claim remains gated on the live checks above. The local build process does not publish; release assets are uploaded separately to GitHub.

## rc.3 large-mask verification

- Node regression: 5000 × 4000 synthetic image exceeds the old cap, is read in chunks no larger than 262,144 pixels, preserves the far-edge black pixel, clears every scratch chunk, and releases the canvas.
- Chunked occupancy equals whole-image reduction across uneven boundaries with mixed transparency and one-pixel lines.
- Native browser harness: a real 5000 × 4000 PNG decoded and converted successfully in 190 ms on the development browser, producing an expected 128 × 103 occupancy grid and eight wall segments. A one-pixel line, far-edge pixel, and transparent chunk were checked. This timing is a single local measurement, not a Foundry performance guarantee. The user's actual Forge mask has not been fetched or tested here.

## rc.5 checks

81 automated tests pass. Native-browser comparison using a supplied mask screenshot verified 1,158 exact segments reduced to 335 Balanced / 259 Strong. Regression checks cover closed loops, ring doorway preservation, small holes/islands, thin strips, corner contacts, native token animation options/deadlines, selected tile rendering, suppressed sheet renders, and dirty-form preservation. The user confirmed that global pause caused the earlier Start report. Live multi-client animation, moving vision, and input focus with the user's other modules remain to be checked in Foundry.
