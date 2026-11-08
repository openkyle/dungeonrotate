# Rotating Elements — quick help

## Set up a floor by clicking it

1. Enable **This scene has Rotating Elements** in Scene Configuration.
2. In the floating **Rotating Elements** window, click **Target tile** for A or B.
3. The module switches to the Tiles layer and minimizes its window. Click the tile on the scene. You can also switch to Tiles yourself. Press **Escape** to cancel; targeting also cancels on scene changes or after one minute.
4. The floating window returns and shows the selected **tile ID**. This shortcut saves the selection and automatically applies a matching mask if found. It does not start a newly assigned tile rotating.
5. Use **Start**, **Pause**, and **Reverse** on the floating window.

In the full Settings window, **Target tile** populates the form without discarding other unsaved settings. Click **Save & apply masks** to apply that form. The scene-tile dropdown is still available as an alternative.

## Automatic mask names

Put a black-and-white mask in the **same directory as the tile image**, with the same filename stem and `_mask` or `_Mask` before the extension:

| Tile artwork | Matching wall mask |
|---|---|
| `Dungeon.webp` | `Dungeon_mask.png`, `Dungeon_Mask.png`, `Dungeon_mask.webp`, or `Dungeon_Mask.webp` |
| `Ring-2.png` | `Ring-2_mask.png` or `Ring-2_Mask.png` |

PNG is preferred; WebP and other browser-readable images also work. Automatic discovery checks PNG first, then the artwork’s extension when it is WebP or JPEG. Spelling, spaces, and the rest of the filename must match. Lowercase `_mask` wins if both exist. This checks only those matching filenames beside the chosen image; it does not search your whole storage. If neither exists, use **Browse / Upload** in Settings. The Foundry file picker lets you select an existing image or upload one to a location where your account has upload permission. Forge uses its configured file picker/storage.

A guessed matching file can be displayed even if the image host later denies pixel access; saving will explain that error and preserve your previous wall configuration. Use storage with CORS support or upload a readable copy manually.

## Masks become walls automatically

Choose a tile and mask image, then click **Save & apply masks**. There are no Generate/Remove Walls buttons. The module reads the masks, creates native Foundry walls, and replaces only its own previous walls. Clearing a mask field and saving removes that slot's mask walls. Choosing None for a tile and saving also removes that slot's walls. Hand-drawn walls remain untouched.

Saving also refreshes an image edited at the same path. All masks are checked before scene changes begin. An unreadable or overly complex mask leaves the previous setup intact. You can save while rotating: processing briefly holds the update loop, then unchanged tile assignments resume their prior running state. A newly assigned tile stays paused.

Large masks are processed automatically in small chunks; you do not need to resize them to satisfy a 16-megapixel limit. Thin black source pixels are preserved in the reduced wall grid. Very large images must still be decodable by your browser.

Black is solid; white or transparent is open. Match the mask to the **unrotated tile image**, including transparent padding. The existing tile rotation is applied automatically. Walls block vision, light, and movement by default. A tile with no mask can rotate without generated walls.

## Journal pins, lights, and tokens

There is nothing to select from a journal or light list. The module finds **Note pins and AmbientLight sources already placed in the scene** and attaches them to the floor under their positions. It does not move journal content or create lights. Links, light color/intensity/animation, and other properties stay intact. Directional light cones turn with their floor.

By default, floor detection follows the **opaque artwork**, so transparent holes in a ring do not capture objects on another ring. Wall-mounted lights and pins are included even when their point lies on a black wall-mask pixel. Objects off both floors stay stationary. Slot B wins a new overlap; existing objects keep their floor until moved off it. Drag a pin or light to change its relative position. New scene pins and lights are detected on the next update.

If the artwork has an opaque background, the module cannot infer invisible ring boundaries. In **Advanced settings**, choose radial bands: `0-1` is the full ellipse, `0.5-1` is an outer ring, and `0-0.25,0.6-1` is a center plus outer ring. Values run from tile center (0) to its edge (1). Whole rectangle is also available. Use one region per slot to distinguish overlapping artwork. Remote artwork must permit pixel access for transparency detection; use rectangle/radial regions if it does not.

The Carry tokens, Carry scene journal pins, and Carry scene lights toggles apply to the whole slot. Old per-pin/per-light selections from rc.1 are ignored; detection is automatic. Token manual attachment flags remain supported internally, but routine use requires no per-object selection.

## Controls and window size

Settings contains setup only. **Start/Pause/Reverse** controls live in the floating window. Resize Settings by its corner if needed; its content scrolls vertically and **Save & apply masks** stays at the bottom. Advanced and performance options are collapsed initially.

To change a tile's artwork or placement, pause it, set its slot to None and save, edit it normally in Foundry, then target it again. This prevents the mask walls from drifting away from the image.

A GM must keep this scene open for synchronized rotation. Use one browser session per GM account. Disable Fog Exploration for rotating encounters: explored fog does not rotate. Vision and geometry update in discrete samples; this release candidate still needs testing in your live Foundry setup.

## Start appears to do nothing

Foundry's global game pause freezes the rotating floors too. The floating panel displays **Waiting for unpause**; press Space to resume the game. Start arms the selected slot while paused. At the default 0.5°/second, the tile turns only 5° in ten seconds.

If the panel shows **Engine stopped**, read the displayed error, resolve the cause, and use **Resume engine**. The controlling GM must remain on this scene. If the game is unpaused but motion still fails, run `game.modules.get("rotating-dungeon").api.diagnostics()` in the browser console and share the result. Run it again after ten seconds to compare the rotation and last-update clock.

Automatic mask discovery lists the tile's storage folder through Foundry's file picker, including its configured hosting provider. It selects only a matching file in that folder. Hosts without folder-listing access require **Browse / Upload**; the module does not download guessed missing filenames.

## Smoother walls and movement

Select **Wall smoothing → Balanced** (default), then **Save & apply masks** to replace the existing generated walls. **Strong** averages more of the small bumps; **Light** retains more detail; **Off** restores exact pixel edges. For your existing scene, set **Advanced settings → Mask resolution → 256 pixels** before saving. New slots already default to 256. Native Foundry walls are straight segments, so curves are represented by a closed sequence of short diagonal walls.

Smoothing can shift an edge by a few processing pixels. Inspect narrow doors and thin partitions; use Light or Off if a small feature needs exact tracing. Destination occupancy still uses the conservative raster. Smoothing does not modify the mask image.

Under **Performance**, keep **Smooth tile and token motion** enabled. Selected tiles now animate too, and tokens glide between rotation updates. Drag animation is retained across those updates. Explicit nonanimated moves are respected. Wall/vision and scene-light geometry still update at the selected frequency; try 10 updates/second if the vision edge steps noticeably and your group’s performance allows it.

Rotation no longer refreshes sheets each tick. Unsaved Settings inputs remain in place until you save or close the form.

## rc.6 interaction correction

Passive floor carrying no longer starts native token animations on every update. This avoids an uninterrupted animation state interfering with clicks and drags. Intentional drag movement retains a bounded animation deadline. Tile artwork remains smooth; passive token positions update at the configured geometry frequency. The Performance checkbox is now labeled Smooth tile artwork. Target Tile restores the previous canvas layer unless you have switched modes manually.

## Reset and hand-drawn walls

**Reset rotation** returns that slot and its riders, lights, and walls to the recorded setup angle and pauses the slot. Each tile remembers its angle when first assigned. Older saved scenes have no historical baseline; the first angle observed after this update becomes their reset angle. To establish a new baseline, click **Set as default rotation** for that slot. It saves the current committed tile angle immediately without moving objects or changing whether rotation is running. Pause first if you want to choose a precise angle.

New walls automatically attach when an endpoint is within 15% of a grid square of an attached wall, otherwise to the rotating floor containing the wall midpoint (Slot B wins overlapping floor regions). Walls outside these regions stay static. Draw while rotation is paused for accurate placement. Doors, door state, and other properties remain editable. Editing coordinates updates the local attachment; deletion works normally. Saving a mask replaces only mask-generated walls, preserving your additions. Reassigning a slot to another tile leaves old manual walls stationary instead of transferring them to the new tile. Existing static walls are not retroactively adopted.

## Reveal more floor around room edges

Choose **Wall margin → Widen rooms — small**, then **Save & apply masks** for each affected slot. This moves the wall boundary into the solid mask, revealing more of the room. Medium widens farther. Original outline restores zero margin. Thicken walls does the opposite.

Small/medium target one/two pixels of the processing grid (not original image pixels). With a 4,620-pixel tile and resolution 256, Small is approximately 18 scene pixels. Higher resolution gives a finer margin. Thin barriers and narrow openings keep a reduced margin locally to protect their shape. Mask-generated walls and destination collision occupancy use the adjusted mask. Existing hand-drawn walls stay where you placed them. Inspect room edges and door connections after saving.
