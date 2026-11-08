import {ID} from "./core.js";
import {RotationController} from "./controller.js";
import {createPanelClass} from "./panel.js";
import {addSceneToggle, createFloatingClass} from "./floating.js";
const controller = new RotationController();
let Panel, Floating, floating, ticker;
function syncFloating(force = false) {
  if (!game.user?.isGM || !canvas.ready || !controller.enabled()) {
    if (floating?.rendered) floating.close();
    return;
  }
  floating ??= new Floating();
  if (force || floating.rendered) floating.render(true);
}
function attachTicker() {
  if (ticker === canvas.app?.ticker) return;
  ticker?.remove(controller.draw, controller);
  ticker = canvas.app?.ticker;
  ticker?.add(controller.draw, controller);
}
Hooks.once("init", () => {
  controller.openHelp = () => new Application({id:"rotating-dungeon-help",title:"Rotating Elements — Help",
    template:`modules/${ID}/templates/help.hbs`,width:540,height:580,resizable:true,classes:["rotating-dungeon"]}).render(true);
  Panel = createPanelClass(controller);
  Floating = createFloatingClass(controller, () => new Panel().render(true));
  game.settings.registerMenu(ID, "configuration", {name: "Rotating Dungeon", label: "Configure current scene",
    hint: "Select up to two scene tiles, masks, and independent rotation directions.", icon: "fas fa-sync-alt", type: Panel, restricted: true});
});
Hooks.once("ready", () => {
  if (String(game.version).split(".")[0] !== "11") {
    ui.notifications.error("Rotating Dungeon requires Foundry v11. The engine has not been started."); return;
  }
  game.modules.get(ID).api = {
    open: () => { if (game.user.isGM) new Panel().render(true); },
    openControls: () => syncFloating(true),
    state: () => controller.state(),
    control: (slot, action) => controller.control(canvas.scene, slot, action)
  };
  controller.start();
  attachTicker(); syncFloating(true);
});
Hooks.on("canvasReady", () => { controller.last = 0; controller.owner = null; attachTicker(); syncFloating(true); });
Hooks.on("canvasTearDown", () => { controller.last = 0; controller.owner = null; floating?.close(); });
Hooks.on("renderSceneConfig", addSceneToggle);
Hooks.on("updateScene", scene => { if (scene.id === canvas.scene?.id) syncFloating(true); });
Hooks.on("userConnected", () => syncFloating(false));
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  controls.find(c => c.name === "tiles")?.tools.push({name: ID, title: "Rotating Dungeon", icon: "fas fa-sync-alt",
    button: true, onClick: () => controller.enabled() ? syncFloating(true) : new Panel().render(true)});
});
Hooks.on("preUpdateAmbientLight", (light, change, options) => controller.interceptLight(light, change, options));
Hooks.on("preUpdateNote", (note, change, options) => controller.interceptNote(note, change, options));
Hooks.on("preUpdateToken", (token, change, options) => controller.intercept(token, change, options));
Hooks.on("updateToken", (token, change) => {
  const rejected = foundry.utils.getProperty(change, `flags.${ID}.rejected`) ?? change[`flags.${ID}.rejected`];
  if (rejected && token.getFlag(ID, "request")?.userId === game.user.id) ui.notifications.warn("Movement blocked or expired on the rotating floor.");
});
Hooks.on("preUpdateTile", (tile, change, options) => {
  if (options[ID]) return;
  const slot = controller.state(tile.parent).slots.find(s => s.tileId === tile.id);
  if (!slot) return;
  const geometric = ["x", "y", "width", "height", "rotation", "overhead", "texture"].some(k => k in change) || Object.keys(change).some(k => k.startsWith("texture."));
  if (geometric && (slot.running || tile.parent.walls.some(w => w.getFlag(ID, "wall")?.slotId === slot.id))) {
    ui.notifications.warn("Pause this slot, choose None for its tile in Settings, and save before editing placement or artwork. Target it again afterward; mask walls are applied automatically."); return false;
  }
});
Hooks.on("preDeleteTile", (tile, options) => {
  if (!options[ID] && controller.state(tile.parent).slots.some(s => s.tileId === tile.id)) {
    ui.notifications.warn("Choose None for this tile's slot and save settings before deleting it. Its mask walls are removed automatically."); return false;
  }
});
for (const event of ["preUpdateWall", "preDeleteWall"]) Hooks.on(event, (wall, change, options) => {
  const context = event === "preDeleteWall" ? change : options;
  if (wall.getFlag(ID, "wall") && !context?.[ID]) {
    ui.notifications.warn("Edit the mask and save Rotating Dungeon settings to refresh these walls. Clear the mask field and save to remove them."); return false;
  }
});
