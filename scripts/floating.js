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
      return {sceneName: scene?.name, enabled: controller.enabled(scene), failed: controller.failure,
        isController: controller.authority(scene)?.id === game.user.id,
        slots: controller.state(scene).slots.map(s => ({...s, label: s.id.toUpperCase(),
          assigned: !!scene?.tiles.get(s.tileId),
          imageName: (scene?.tiles.get(s.tileId)?.texture.src ?? "Choose a tile in settings").split("/").pop(),
          directionText: s.direction === 1 ? "Clockwise" : "Counterclockwise",
          toggle: s.running ? "pause" : "start", toggleText: s.running ? "Pause" : "Start"
        }))};
    }
    activateListeners(html) {
      super.activateListeners(html);
      html.find("[data-action]").on("click", async event => {
        const button = event.currentTarget, {action, slot} = button.dataset;
        button.disabled = true;
        try {
          if (action === "settings") { openSettings(); return; }
          const scene = canvas.scene;
          controller.assertGM(scene);
          if (action === "pauseAll") {
            for (const s of controller.slots(scene)) await controller.control(scene, s.id, "pause");
          } else if (action === "resume") { controller.failure = false; controller.last = 0; }
          else await controller.control(scene, slot, action);
        } catch (error) { ui.notifications.error(error.message); }
        finally { button.disabled = false; this.render(false); }
      });
    }
  };
}
