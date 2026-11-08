import {ID} from "./core.js";
import {findMatchingMask} from "./mask.js";
import {TileTargetSession} from "./target.js";
export function createPanelClass(controller) {
  return class RotationPanel extends FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {id: "rotating-dungeon-panel", title: "Rotating Dungeon",
        template: `modules/${ID}/templates/panel.hbs`, width: 560, height: 640, resizable: true,
        closeOnSubmit: false, classes: ["rotating-dungeon", "rd-settings"]});
    }
    constructor(...args) {
      super(...args); this.sceneId = canvas.scene?.id; this.targetSession = null; this.lookup = {};
    }
    get scene() { return game.scenes.get(this.sceneId); }
    getData() {
      const scene = this.scene;
      if (!scene) return {noScene: true};
      const state = controller.state(scene);
      return {sceneName: scene.name, enabled: controller.enabled(scene), hz: state.hz, smooth: state.smooth, failed: controller.failure,
        authority: controller.authority(scene)?.name ?? "No GM viewing scene",
        slots: state.slots.map(s => {
          const footprint = !state.autoFloor && s.footprint === "rectangle" ? "artwork" : s.footprint;
          const notes = scene.notes.filter(n => controller.assigned(scene, state, [n.x,n.y], n.flags[ID] ?? {}, "carryNotes")?.id === s.id).length;
          const lights = scene.lights.filter(n => controller.assigned(scene, state, [n.x,n.y], n.flags[ID] ?? {}, "carryLights")?.id === s.id).length;
          return {...s, label: s.id.toUpperCase(), notes, lights, clockwise: s.direction === 1,
            walls: scene.walls.filter(w => w.getFlag(ID, "wall")?.slotId === s.id).length,
            tiles: [...scene.tiles].map(t => { const name = (t.texture.src ?? "No image").split("/").pop(); return {id: t.id, selected: t.id === s.tileId,
              label: `${t.id} — ${name.length > 48 ? name.slice(0,45)+"…" : name}`}; }),
            footprints: [{value:"artwork",label:"Automatic — tile transparency"},{value:"rectangle",label:"Whole rectangle"},{value:"radial",label:"Radial bands (rings)"}].map(f=>({...f,selected:f.value===footprint})),
            resolutions: [64,128,256].map(n => ({n, selected: n === s.resolution}))};
        })};
    }
    async populateTile(html, slot, tile) {
      const revision = this.lookup[slot] = (this.lookup[slot] ?? 0) + 1;
      const tileField = html.find(`[name='${slot}.tileId']`), maskField = html.find(`[name='${slot}.maskPath']`);
      const changed = this.selectedTiles?.[slot] !== tile?.id;
      this.selectedTiles ??= {}; this.selectedTiles[slot] = tile?.id ?? "";
      tileField.val(tile?.id ?? "");
      html.find(`[data-tile-id='${slot}']`).text(tile?.id ?? "Not selected");
      if (changed) maskField.val("");
      if (!tile || maskField.val()) return;
      html.find(`[data-mask-status='${slot}']`).text("Looking for a matching mask…");
      const mask = await findMatchingMask(tile.texture.src);
      if (this.lookup[slot] !== revision || !this.rendered || tileField.val() !== tile.id) return;
      if (!maskField.val() && mask) maskField.val(mask);
      html.find(`[data-mask-status='${slot}']`).text(mask ? "Matching mask found. Save to apply walls." : "No matching mask found. Browse / Upload a mask image, or leave empty for no walls.");
    }
    activateListeners(html) {
      super.activateListeners(html);
      this.selectedTiles = Object.fromEntries(controller.state(this.scene).slots.map(s => [s.id, s.tileId]));
      html.find("select[data-slot-select]").on("change", event => {
        const slot = event.currentTarget.dataset.slotSelect;
        this.populateTile(html, slot, this.scene.tiles.get(event.currentTarget.value)).catch(e => ui.notifications.error(e.message));
      });
      html.find("[data-action]").on("click", async event => {
        event.preventDefault();
        const button = event.currentTarget, {action, slot} = button.dataset;
        try {
          controller.assertGM(this.scene);
          if (action === "browse") {
            const field = html.find(`[name='${slot}.maskPath']`);
            new FilePicker({type:"image", current:field.val(), callback:path => {
              field.val(path); html.find(`[data-mask-status='${slot}']`).text("Save to turn this mask into walls.");
            }}).render(true);
          } else if (action === "target") {
            await this.minimize();
            this.targetSession = new TileTargetSession(this.sceneId, async tile => {
              await this.maximize(); await this.populateTile(html, slot, tile);
            }, () => { if (this.rendered) this.maximize(); }).start();
          } else if (action === "resume") { controller.failure = false; controller.last = 0; this.render(false); }
          else if (action === "help") controller.openHelp();
        } catch (error) { ui.notifications.error(error.message); }
      });
    }
    async close(options) { this.targetSession?.finish(); this.lookup = {}; return super.close(options); }
    async _updateObject(event, form) {
      const button = this.element.find("button[type='submit']"); button.prop("disabled", true).text("Applying masks…");
      try {
        const state = controller.state(this.scene);
        state.hz = Number(form.hz); state.smooth = !!form.smooth;
        for (const slot of state.slots) {
          for (const field of ["tileId", "maskPath", "footprint", "bands"]) slot[field] = String(form[`${slot.id}.${field}`] ?? "").trim();
          for (const field of ["speed", "direction", "resolution", "threshold"]) slot[field] = Number(form[`${slot.id}.${field}`]);
          for (const field of ["carry", "carryNotes", "carryLights", "vision", "collision"]) slot[field] = !!form[`${slot.id}.${field}`];
        }
        const count = await controller.configure(this.scene, state);
        ui.notifications.info(`Saved. ${count} mask walls applied; journal pins and lights are detected automatically.`); this.render(false);
      } catch (error) { ui.notifications.error(error.message); }
      finally { button.prop("disabled", false).text("Save & apply masks"); }
    }
  };
}
