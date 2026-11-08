/** One active click-to-target session; all hooks/listeners are removed on completion or cancellation. */
export class TileTargetSession {
  static active = null;
  constructor(sceneId, onPick, onCancel = () => {}) {
    this.sceneId = sceneId; this.onPick = onPick; this.onCancel = onCancel;
    this.finished = false;
  }
  start() {
    TileTargetSession.active?.cancel();
    TileTargetSession.active = this;
    canvas.tiles.activate();
    canvas.tiles.releaseAll();
    this.controlHook = Hooks.on("controlTile", (tile, controlled) => {
      if (!controlled || tile.document.parent?.id !== this.sceneId) return;
      this.finish(); Promise.resolve(this.onPick(tile.document)).catch(error => ui.notifications.error(error.message));
    });
    this.sceneHook = Hooks.on("canvasTearDown", () => this.cancel());
    this.keyHandler = event => { if (event.key === "Escape") { event.preventDefault(); this.cancel(); } };
    window.addEventListener("keydown", this.keyHandler);
    this.timer = setTimeout(() => this.cancel(), 60000);
    ui.notifications.info("Click the map tile to use. Press Escape to cancel.");
    return this;
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    Hooks.off("controlTile", this.controlHook); Hooks.off("canvasTearDown", this.sceneHook);
    window.removeEventListener("keydown", this.keyHandler); clearTimeout(this.timer);
    if (TileTargetSession.active === this) TileTargetSession.active = null;
  }
  cancel() { if (!this.finished) { this.finish(); this.onCancel(); } }
}
