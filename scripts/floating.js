import {TileTargetSession} from "./target.js";
import {findMatchingMask} from "./mask.js";
import {ID} from "./core.js";

export function addSceneToggle(app, html) {
  const name = `flags.${ID}.enabled`;
  if (html.find(`[name='${name}']`).length) return;
  const enabled = app.object.getFlag(ID, "enabled") === true;
  const group = `<div class="form-group rotating-elements-scene-option"><label>This scene has Rotating Elements</label><input type="checkbox" name="${name}" ${enabled ? "checked" : ""}><p class="notes">Enable rotating floors on this scene and show the floating GM controls. Configure tiles, masks, riders, journal pins, and lights from that panel.</p></div>`;
  let target = html.find('.tab[data-tab="basic"]');
  if (!target.length) target = html.find("form");
  if (!target.length && html.is("form")) target = html;
  target.first().append(group);
  app.setPosition({height: "auto"});
}

export function createFloatingClass(controller, openSettings) {
  return class FloatingRotationControls extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {id: "rotating-elements-controls", title: "Rotating Elements",
        template: `modules/${ID}/templates/floating.hbs`, width: 350, height: "auto", top: 90, left: 120,
        resizable: false, minimizable: true, classes: ["rotating-dungeon", "rotating-elements-floating"]});
    }
    getData() {
      const scene = canvas.scene;
      return {sceneName: scene?.name, enabled: controller.enabled(scene), failed: controller.failure, lastError: controller.lastError, gamePaused: !!game.paused,
        isController: controller.authority(scene)?.id === game.user.id,
        slots: controller.state(scene).slots.map(s => ({...s, label: s.id.toUpperCase(),
          assigned: !!scene?.tiles.get(s.tileId),
          status: controller.failure ? "Engine stopped" : !s.running ? "Paused" : game.paused ? "Waiting for unpause" : "Running",
          imageName: (scene?.tiles.get(s.tileId)?.texture.src ?? "Choose a tile in settings").split("/").pop(),
          directionText: s.direction === 1 ? "Clockwise" : "Counterclockwise",
          toggle: s.running ? "pause" : "start", toggleText: s.running ? "Pause" : "Start"
        }))};
    }
    async close(options) { this.targetSession?.finish(); return super.close(options); }
    activateListeners(html) {
      super.activateListeners(html);
      html.find("[data-action]").on("click", async event => {
        const button = event.currentTarget, {action, slot} = button.dataset;
        button.disabled = true;
        try {
          if (action === "settings") { openSettings(); return; }
          const scene = canvas.scene;
          controller.assertGM(scene);
          if (action === "help") { controller.openHelp(); return; }
          if (action === "target") {
            await this.minimize();
            this.targetSession = new TileTargetSession(scene.id, async tile => {
              await this.maximize();
              const mask = await findMatchingMask(tile.texture.src);
              const state = controller.state(scene), selected = state.slots.find(s => s.id === slot);
              if (selected.tileId !== tile.id) selected.maskPath = mask;
              else if (!selected.maskPath && mask) selected.maskPath = mask;
              selected.tileId = tile.id;
              selected.footprint = selected.footprint === "radial" ? "radial" : "artwork";
              const count = await controller.configure(scene, state);
              ui.notifications.info(`Slot ${slot.toUpperCase()}: ${tile.id}. ${count} scene mask walls applied.${mask ? " Matching mask found." : " No matching mask; use Settings to browse."}`);
              this.render(false);
            }, () => { if (this.rendered) this.maximize(); }).start();
          }
          else if (action === "pauseAll") {
            for (const s of controller.slots(scene)) await controller.control(scene, s.id, "pause");
          } else if (action === "resume") { controller.failure = false; controller.lastError = ""; controller.last = 0; }
          else {
            await controller.control(scene, slot, action);
            if (action === "setDefault") ui.notifications.info(`Slot ${slot.toUpperCase()}: default rotation saved. Reset rotation will return here.`);
          }
        } catch (error) { ui.notifications.error(error.message); }
        finally { button.disabled = false; if (action !== "target") this.render(false); }
      });
    }
  };
}
