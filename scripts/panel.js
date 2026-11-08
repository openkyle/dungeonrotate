import {ID} from "./core.js";
export function createPanelClass(controller) {
  return class RotationPanel extends FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {id: "rotating-dungeon-panel", title: "Rotating Dungeon",
        template: `modules/${ID}/templates/panel.hbs`, width: 650, height: "auto", closeOnSubmit: false, classes: ["rotating-dungeon"]});
    }
    constructor(...args) { super(...args); this.sceneId = canvas.scene?.id; }
    get scene() { return game.scenes.get(this.sceneId); }
    getData() {
      const scene = this.scene;
      if (!scene) return {noScene: true};
      const state = controller.state(scene);
      return {sceneName: scene.name, enabled: controller.enabled(scene), hz: state.hz, smooth: state.smooth, failed: controller.failure,
        lights: [...scene.lights].map(n => ({id: n.id, label: `${n.id} (${Math.round(n.x)}, ${Math.round(n.y)}) [${n.getFlag(ID, "attachment") || "auto"}]`})),
        notes: [...scene.notes].map(n => ({id: n.id, label: `${n.text || n.entry?.name || "Journal pin"} — ${n.id} [${n.getFlag(ID, "attachment") || "auto"}]`})),
        authority: controller.authority(scene)?.name ?? "No GM viewing scene",
        slots: state.slots.map(s => ({...s, label: s.id.toUpperCase(),
          clockwise: s.direction === 1,
          walls: scene.walls.filter(w => w.getFlag(ID, "wall")?.slotId === s.id).length,
          tiles: [...scene.tiles].map(t => ({id: t.id, selected: t.id === s.tileId,
            label: `${t.id} — ${(t.texture.src ?? "No image").split("/").pop()} (${t.width} × ${t.height}, ${t.rotation}°)`})),
          radial: s.footprint === "radial",
          resolutions: [64,128,256].map(n => ({n, selected: n === s.resolution}))
        }))};
    }
    activateListeners(html) {
      super.activateListeners(html);
      html.find("[data-action]").on("click", async event => {
        event.preventDefault();
        const button = event.currentTarget, {action, slot} = button.dataset;
        button.disabled = true;
        try {
          controller.assertGM(this.scene);
          if (action === "selected") {
            const tile = canvas.tiles.controlled[0]?.document;
            if (!tile || canvas.tiles.controlled.length !== 1) throw Error("Select exactly one tile on the Tiles layer first.");
            html.find(`[name='${slot}.tileId']`).val(tile.id);
            return;
          }
          if (action === "noteAttach" || action === "lightAttach") {
            const prefix = action === "lightAttach" ? "light" : "note";
            const noteId = html.find(`[name='${prefix}Id']`).val();
            const attachment = html.find(`[name='${prefix}Attachment']`).val();
            const note = (prefix === "light" ? this.scene.lights : this.scene.notes).get(noteId);
            if (!note) throw Error("Choose a scene pin or light first.");
            await controller.serial(async () => {
              controller.assertGM(this.scene);
              await note.update({[`flags.${ID}.attachment`]: attachment === "auto" ? null : attachment,
                [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: note.getFlag(ID, "request")?.id ?? null}, {[ID]: true});
            });
          }
          else if (action === "resume") { controller.failure = false; controller.last = 0; }
          else if (action === "generate") {
            const count = await controller.generate(this.scene, slot);
            ui.notifications.info(`Generated ${count} native walls for slot ${slot.toUpperCase()}.`);
          } else if (action === "remove") {
            const yes = await Dialog.confirm({title: "Remove generated walls?", content: `<p>Remove only this slot's module-generated walls? Hand-drawn walls are preserved.</p>`});
            if (yes) await controller.remove(this.scene, slot);
          } else if (["auto", "none", "a", "b"].includes(action)) {
            const tokens = canvas.tokens.controlled;
            if (!tokens.length) throw Error("Select one or more tokens first.");
            await controller.serial(async () => {
              controller.assertGM(this.scene);
              await this.scene.updateEmbeddedDocuments("Token", tokens.map(t => ({_id: t.id,
                [`flags.${ID}.attachment`]: action === "auto" ? null : action,
                [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: t.document.getFlag(ID, "request")?.id ?? null})), {[ID]: true});
            });
          } else await controller.control(this.scene, slot, action);
          this.render(false);
        } catch (error) { ui.notifications.error(error.message); console.error(ID, error); }
        finally { button.disabled = false; }
      });
    }
    async _updateObject(event, form) {
      try {
        const state = controller.state(this.scene);
        state.hz = Number(form.hz); state.smooth = !!form.smooth;
        for (const slot of state.slots) {
          for (const field of ["tileId", "maskPath", "footprint", "bands"]) slot[field] = String(form[`${slot.id}.${field}`] ?? "").trim();
          for (const field of ["speed", "direction", "resolution", "threshold"]) slot[field] = Number(form[`${slot.id}.${field}`]);
          for (const field of ["carry", "carryNotes", "carryLights", "vision", "collision"]) slot[field] = !!form[`${slot.id}.${field}`];
        }
        await controller.configure(this.scene, state);
        ui.notifications.info("Rotating Dungeon configuration saved."); this.render(false);
      } catch (error) { ui.notifications.error(error.message); }
    }
  };
}
