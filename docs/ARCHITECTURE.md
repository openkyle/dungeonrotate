# Architecture

## Persisted data

`Scene.flags.rotating-dungeon.enabled` is the explicit scene opt-in. A standard Scene Configuration form checkbox writes it. The loop and movement interceptors are inactive while false. The floating GM Application appears only for an enabled, viewed scene; clients do not receive GM controls. Objects manually moved while disabled discard their old anchors to prevent snapping back when re-enabled.

`Scene.flags.rotating-dungeon.state` contains schema version 1, update frequency, smoothing setting, and exactly two slot configurations. Each slot stores a selected tile ID, mask path, compressed raster runs, rotation settings, carry flags, and floor-region settings. Existing tile positions/rotations remain authoritative; the scene clock is not advanced while offline.

Generated Wall documents carry `flags.rotating-dungeon.wall` with slot ID, tile ID, and normalized boundary segment. Coordinates are regenerated from the immutable normalized segment and current tile dimensions/angle; rotations never accumulate rounding drift. Only these walls are removed by slot cleanup.

Token, Note, and AmbientLight documents carry `ride` (slot ID and exact local anchor), `attachment` (null/auto, a, b, or none), `request` (movement intent), and `ack`. Light rides also store a local angular offset; their top-level `rotation` follows the floor while `config` remains untouched. Tokens additionally store a `rejected` request ID for owner feedback. Integer world coordinates are derived from exact local anchors; pin journal/page IDs are untouched.

Tile documents carry `motion` with committed angle, signed velocity, and synchronized server timestamp. Each client can extrapolate artwork for at most two geometry intervals. No polling of an external server and no raw custom socket messages are used.

## Coordinate transforms

A tile center is `(x + width/2, y + height/2)`. Local anchors are inverse-rotated offsets from that center; positive rotation is clockwise in screen coordinates. A wall endpoint normalized to `[-0.5, 0.5]` scales by tile width/height before rotating. Existing tile rotation is applied exactly once. Texture mirroring and overhead tiles are deliberately rejected until supported.

## Update flow

One GM per viewed scene owns the loop. A promise queue serializes local control actions and simulation ticks. Tick work is awaited, so slow wall/document operations cannot create overlapping local batches. Ticks do not mutate local sources directly or bypass the Foundry document transport.

Each tick calculates both tile angles, writes native wall geometry, resolves token movement against that geometry, carries/updates Notes and AmbientLights, and commits tile angles/clocks. Foundry's own document hooks rebuild geometry and perception. Cross-type updates are not atomic; this is the primary remaining live-test risk.

Movement interception replaces outgoing x/y changes with a local destination request in the same authorized document update. The controller never clears the request field: it acknowledges only the request it processed. Requests arriving during a batch remain available for the next tick. Outstanding requests older than ten seconds or associated with another slot are consumed without moving the token. No async work is attempted inside the cancellable pre-update hook.

Scene-view authority election is deterministic but not a server-side lock. Two browser sessions logged into the same GM identity, or transient stale presence during disconnect, can overlap. Use distinct GM identities and one active session per identity; live failover tests must assess presence propagation.

## Rendering and limits

Only the tile mesh is extrapolated. The read-only draw path does not deep-copy mask data or update Documents. Tokens/pins/lights/walls remain at their committed sample to keep native picking, vision, and movement on the same geometry. This favors correctness at sampled instants over claiming a continuously synchronized physics renderer. Pausing snaps any artwork extrapolation back to committed geometry.

Masks use conservative occupancy reduction and exact merged orthogonal boundary runs. Jagged source walls remain stair-stepped; there is no topology-changing polygon simplifier. Generation has a segment cap and rolls back created walls if storing the raster state fails. A whole-image black mask forms an enclosed solid area; token destination occupancy prevents placement inside it through module-managed movement.

## API references

Implementation targets Foundry's published v11 interfaces:

- [GameTime serverTime](https://foundryvtt.com/api/v11/classes/client.GameTime.html)
- [Document embedded-document updates](https://foundryvtt.com/api/v11/classes/foundry.abstract.Document.html)
- [Token collision checks](https://foundryvtt.com/api/v11/classes/client.Token.html)
- [Tile rendering interface](https://foundryvtt.com/api/v11/classes/client.Tile.html)
- [FormApplication](https://foundryvtt.com/api/v11/classes/client.FormApplication.html)
- [Settings menus](https://foundryvtt.com/api/v11/classes/client.ClientSettings.html)

- [AmbientLight schema and rotation field](https://foundryvtt.com/api/v11/classes/foundry.documents.BaseAmbientLight.html)
