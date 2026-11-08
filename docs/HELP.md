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
