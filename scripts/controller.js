import {ID, defaultState, validateState, normalize, toLocal, toWorld, onFloor, solidAt, wallCoordinates, visualAngle} from "./core.js";
import {readMask} from "./mask.js";
const clone = value => foundry.utils.deepClone(value);
const point = a => ({x: a[0], y: a[1]});

export class RotationController {
  constructor() {
    this.queue = Promise.resolve(); this.last = 0; this.owner = null; this.timer = null;
    this.failure = false; this.stopped = true;
  }
  enabled(scene = canvas.scene) { return scene?.getFlag(ID, "enabled") === true; }
  state(scene = canvas.scene) { return clone(scene?.getFlag(ID, "state") ?? defaultState()); }
  authority(scene = canvas.scene) {
    return game.users.filter(u => u.active && u.isGM && u.viewedScene === scene?.id).sort((a, b) => a.id.localeCompare(b.id))[0];
  }
  assertGM(scene) {
    if (!game.user.isGM) throw Error("Only a GM can configure rotating tiles.");
    if (this.authority(scene)?.id !== game.user.id) throw Error("Use the controlling GM's window (lowest user ID among GMs viewing this scene).");
    if (canvas.scene?.id !== scene.id) throw Error("Return to the scene where this panel was opened.");
  }
  serial(fn) {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  start() {
    this.stop(); this.stopped = false;
    const loop = async () => {
      if (this.stopped) return;
      try { await this.serial(() => this.tick()); }
      catch (error) {
        console.error(ID, error);
        this.failure = true;
        ui.notifications.error(`Rotating Dungeon stopped: ${error.message}. Fix the issue, then use Resume engine in the panel.`);
      }
      if (!this.stopped) this.timer = setTimeout(loop, 50);
    };
    loop();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.last = 0; this.owner = null; }
  slots(scene, state = this.state(scene)) { return state.slots.filter(s => s.tileId && scene.tiles.has(s.tileId)); }
  pick(scene, state, center, angles = new Map(), carryKey = "carry") {
    // B wins an initial overlap; an existing rider keeps its slot until it exits.
    return this.slots(scene, state).reverse().find(s => {
      const tile = scene.tiles.get(s.tileId), local = toLocal(center, tile, angles.get(s.id) ?? tile.rotation);
      return s[carryKey] && onFloor(local, tile, s) && !(s.mask && solidAt(s.mask, local, tile));
    });
  }
  assigned(scene, state, center, flags, carryKey = "carry") {
    if (flags.attachment === "none") return undefined;
    const desired = flags.attachment || flags.ride?.slotId;
    const slot = this.slots(scene, state).find(s => s[carryKey] && s.id === desired);
    // Explicit attachments never silently switch to a different floor.
    return slot ?? (flags.attachment ? undefined : this.pick(scene, state, center, new Map(), carryKey));
  }
  center(token, scene) { return [token.x + token.width * scene.grid.size / 2, token.y + token.height * scene.grid.size / 2]; }
  intercept(token, change, options) {
    if (options[ID] || (!Object.hasOwn(change, "x") && !Object.hasOwn(change, "y"))) return;
    const scene = token.parent;
    if (scene?.id !== canvas.scene?.id) return;
    if (!this.enabled(scene)) {
      if (token.getFlag(ID, "ride")) change[`flags.${ID}.ride`] = null;
      if (token.getFlag(ID, "request")) change[`flags.${ID}.ack`] = token.getFlag(ID, "request").id;
      return;
    }
    if (token.getFlag(ID, "attachment") === "none") return;
    const state = this.state(scene), center = this.center(token, scene);
    const s = this.assigned(scene, state, center, token.flags[ID] ?? {});
    if (!s) return;
    if (!this.authority(scene)) {
      ui.notifications.warn("A GM must view this scene to coordinate movement on the rotating floor."); return false;
    }
    if (game.paused && !game.user.isGM) return false;
    const target = [(change.x ?? token.x) + token.width * scene.grid.size / 2,
      (change.y ?? token.y) + token.height * scene.grid.size / 2];
    if (!target.every(Number.isFinite)) return false;
    const tile = scene.tiles.get(s.tileId);
    // Persist an owner-authorized intent, not competing world coordinates. No custom socket trust.
    change[`flags.${ID}.request`] = {id: foundry.utils.randomID(), slotId: s.id,
      local: toLocal(target, tile), at: game.time.serverTime, userId: game.user.id};
    delete change.x; delete change.y;
  }
  async tick() {
    if (this.failure || !canvas.ready || !canvas.scene) return;
    const scene = canvas.scene, authority = this.authority(scene);
    if (!this.enabled(scene)) { this.last = 0; this.owner = null; return; }
    if (authority?.id !== game.user.id) { this.last = 0; this.owner = null; return; }
    const now = game.time.serverTime, state = this.state(scene);
    if (!this.last || this.owner !== scene.id) { this.last = now; this.owner = scene.id; return; }
    if (now - this.last < 1000 / state.hz) return;
    const dt = Math.max(0, Math.min((now - this.last) / 1000, 2 / state.hz));
    this.last = now;
    const slots = this.slots(scene, state);
    if (!slots.length) return;
    validateState(state, scene.tiles);
    const angles = new Map(), tileUpdates = [], wallUpdates = [];
    for (const s of slots) {
      const tile = scene.tiles.get(s.tileId), velocity = s.running && !game.paused ? s.speed * s.direction : 0;
      const angle = normalize(tile.rotation + dt * velocity);
      angles.set(s.id, angle);
      if (velocity || tile.getFlag(ID, "motion")?.velocity) tileUpdates.push({_id: tile.id, rotation: angle,
        [`flags.${ID}.motion`]: {angle, velocity, at: now}});
      if (velocity) for (const wall of scene.walls) {
        const f = wall.getFlag(ID, "wall");
        if (f?.slotId === s.id) wallUpdates.push({_id: wall.id, c: wallCoordinates(f.segment, tile, angle)});
      }
    }
    // Foundry has no cross-document transaction. Walls first, then token positions, then tile clock.
    if (wallUpdates.length) await scene.updateEmbeddedDocuments("Wall", wallUpdates, {[ID]: true});
    if (canvas.scene?.id !== scene.id || this.authority(scene)?.id !== game.user.id) return;
    const tokenUpdates = [];
    for (const token of scene.tokens) {
      if (token.getFlag(ID, "attachment") === "none") continue;
      const f = token.flags[ID] ?? {}, center = this.center(token, scene);
      let slot = this.assigned(scene, state, center, f);
      if (!slot) continue;
      const tile = scene.tiles.get(slot.tileId), angle = angles.get(slot.id);
      let local = f.ride?.slotId === slot.id ? f.ride.local : toLocal(center, tile);
      if (!Array.isArray(local) || local.length !== 2 || !local.every(Number.isFinite)) local = toLocal(center, tile);
      let destination = toWorld(local, tile, angle);
      const update = {_id: token.id};
      const request = f.request;
      if (request && request.id !== f.ack) {
        update[`flags.${ID}.ack`] = request.id;
        const requester = game.users.get(request.userId);
        const valid = request.slotId === slot.id && Array.isArray(request.local) && request.local.length === 2 && request.local.every(Number.isFinite)
          && now - request.at < 10000 && now >= request.at - 1000 && requester && token.testUserPermission(requester, "OWNER")
          && (!game.paused || requester.isGM);
        if (valid) {
          const target = toWorld(request.local, tile, angle);
          const inSolid = slots.some(s => s.collision && s.mask && solidAt(s.mask, toLocal(target, scene.tiles.get(s.tileId), angles.get(s.id)), scene.tiles.get(s.tileId)));
          // Native movement collision tests include static scene walls and both rotating wall sets.
          const blocked = !token.object || token.object.checkCollision(point(target), {origin: point(destination), type: "move", mode: "any"});
          const bounds = scene.dimensions;
          const insideScene = target[0] >= bounds.sceneX && target[1] >= bounds.sceneY && target[0] < bounds.sceneX + bounds.sceneWidth && target[1] < bounds.sceneY + bounds.sceneHeight;
          if (!inSolid && !blocked && insideScene) { local = request.local; destination = target; }
          else update[`flags.${ID}.rejected`] = request.id;
        } else update[`flags.${ID}.rejected`] = request.id;
      }
      if (!f.attachment && !onFloor(local, tile, slot)) {
        slot = this.pick(scene, state, destination, angles);
        local = slot ? toLocal(destination, scene.tiles.get(slot.tileId), angles.get(slot.id)) : null;
      }
      const ride = slot ? {slotId: slot.id, local} : null;
      if (JSON.stringify(ride) !== JSON.stringify(f.ride ?? null)) update[`flags.${ID}.ride`] = ride;
      const x = Math.round(destination[0] - token.width * scene.grid.size / 2), y = Math.round(destination[1] - token.height * scene.grid.size / 2);
      if (Math.abs(x - token.x) > .001) update.x = x;
      if (Math.abs(y - token.y) > .001) update.y = y;
      if (Object.keys(update).length > 1) tokenUpdates.push(update);
    }
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates, {[ID]: true, animate: false});
    const noteUpdates = this.noteUpdates(scene, state, slots, angles, now);
    if (noteUpdates.length) await scene.updateEmbeddedDocuments("Note", noteUpdates, {[ID]: true});
    const lightUpdates = this.anchoredUpdates(scene, state, angles, now, "AmbientLight");
    if (lightUpdates.length) await scene.updateEmbeddedDocuments("AmbientLight", lightUpdates, {[ID]: true});
    if (tileUpdates.length) await scene.updateEmbeddedDocuments("Tile", tileUpdates, {[ID]: true});
  }
  interceptNote(note, change, options) { return this.interceptAnchored(note, change, options, "Note"); }
  interceptLight(light, change, options) { return this.interceptAnchored(light, change, options, "AmbientLight"); }
  interceptAnchored(doc, change, options, kind) {
    const isLight = kind === "AmbientLight", carryKey = isLight ? "carryLights" : "carryNotes";
    if (options[ID] || !["x", "y", ...(isLight ? ["rotation"] : [])].some(k => Object.hasOwn(change, k))) return;
    const scene = doc.parent;
    if (scene?.id !== canvas.scene?.id) return;
    if (!this.enabled(scene)) {
      if (doc.getFlag(ID, "ride")) change[`flags.${ID}.ride`] = null;
      if (doc.getFlag(ID, "request")) change[`flags.${ID}.ack`] = doc.getFlag(ID, "request").id;
      return;
    }
    const state = this.state(scene), f = doc.flags[ID] ?? {};
    const slot = this.assigned(scene, state, [doc.x, doc.y], f, carryKey);
    if (!slot) return;
    if (!this.authority(scene)) { ui.notifications.warn("A GM must view this scene to move attached pins or lights."); return false; }
    const target = [change.x ?? doc.x, change.y ?? doc.y], tile = scene.tiles.get(slot.tileId);
    if (!target.every(Number.isFinite)) return false;
    const request = {id: foundry.utils.randomID(), slotId: slot.id,
      local: toLocal(target, tile), at: game.time.serverTime, userId: game.user.id};
    if (isLight && Object.hasOwn(change, "rotation")) {
      if (!Number.isFinite(change.rotation)) return false;
      request.rotation = normalize(change.rotation - tile.rotation); delete change.rotation;
    }
    change[`flags.${ID}.request`] = request;
    delete change.x; delete change.y;
  }
  noteUpdates(scene, state, slots, angles, now) { return this.anchoredUpdates(scene, state, angles, now, "Note"); }
  anchoredUpdates(scene, state, angles, now, kind) {
    const updates = [], isLight = kind === "AmbientLight", carryKey = isLight ? "carryLights" : "carryNotes";
    for (const doc of isLight ? scene.lights : scene.notes) {
      const f = doc.flags[ID] ?? {};
      let slot = this.assigned(scene, state, [doc.x, doc.y], f, carryKey);
      if (!slot) continue;
      const tile = scene.tiles.get(slot.tileId), angle = angles.get(slot.id);
      let local = f.ride?.slotId === slot.id ? f.ride.local : toLocal([doc.x, doc.y], tile);
      let localRotation = isLight && f.ride?.slotId === slot.id && Number.isFinite(f.ride.rotation)
        ? f.ride.rotation : normalize((doc.rotation ?? 0) - tile.rotation);
      if (!Array.isArray(local) || local.length !== 2 || !local.every(Number.isFinite)) local = toLocal([doc.x, doc.y], tile);
      const update = {_id: doc.id}, request = f.request;
      if (request && request.id !== f.ack) {
        update[`flags.${ID}.ack`] = request.id;
        const user = game.users.get(request.userId);
        if (request.slotId === slot.id && Array.isArray(request.local) && request.local.length === 2 && request.local.every(Number.isFinite)
            && now - request.at < 10000 && now >= request.at - 1000 && user && doc.canUserModify(user, "update")) {
          local = request.local;
          if (isLight && Number.isFinite(request.rotation)) localRotation = request.rotation;
        }
      }
      const destination = toWorld(local, tile, angle), worldRotation = normalize(localRotation + angle);
      if (!f.attachment && !onFloor(local, tile, slot)) {
        slot = this.pick(scene, state, destination, angles, carryKey);
        local = slot ? toLocal(destination, scene.tiles.get(slot.tileId), angles.get(slot.id)) : null;
        if (slot && isLight) localRotation = normalize(worldRotation - angles.get(slot.id));
      }
      const ride = slot ? {slotId: slot.id, local, ...(isLight ? {rotation: localRotation} : {})} : null;
      if (JSON.stringify(ride) !== JSON.stringify(f.ride ?? null)) update[`flags.${ID}.ride`] = ride;
      if (Math.round(destination[0]) !== doc.x) update.x = Math.round(destination[0]);
      if (Math.round(destination[1]) !== doc.y) update.y = Math.round(destination[1]);
      if (isLight && Math.abs(worldRotation - doc.rotation) > .001) update.rotation = worldRotation;
      if (Object.keys(update).length > 1) updates.push(update);
    }
    return updates;
  }
  draw() {
    if (!canvas.ready || !canvas.scene) return;
    const state = canvas.scene.getFlag(ID, "state"), authority = this.authority();
    if (!state) return;
    for (const s of this.slots(canvas.scene, state)) {
      const tile = canvas.scene.tiles.get(s.tileId), mesh = tile.object?.mesh;
      if (!mesh || tile.object.controlled) continue;
      const moving = this.enabled() && state.smooth && s.running && !game.paused && authority;
      const angle = moving ? visualAngle(tile.getFlag(ID, "motion"), game.time.serverTime, state.hz) : tile.rotation;
      mesh.rotation = (angle ?? tile.rotation) * Math.PI / 180;
    }
  }
  async configure(scene, next) {
    return this.serial(async () => {
      this.assertGM(scene); validateState(next, scene.tiles);
      const previous = this.state(scene);
      if (previous.slots.some(s => s.running)) throw Error("Pause both slots before saving configuration or replacing masks.");
      for (const s of next.slots) {
        const old = previous.slots.find(o => o.id === s.id);
        const walls = scene.walls.filter(w => w.getFlag(ID, "wall")?.slotId === s.id);
        if (walls.length && ["tileId", "maskPath", "resolution", "threshold"].some(k => s[k] !== old[k]))
          throw Error(`Remove slot ${s.id.toUpperCase()}'s generated walls before changing its tile or mask settings.`);
        s.mask = old.mask; s.running = false;
      }
      await scene.setFlag(ID, "state", next);
      const updates = scene.walls.filter(w => w.getFlag(ID, "wall")).map(w => {
        const s = next.slots.find(s => s.id === w.getFlag(ID, "wall").slotId);
        return {_id: w.id, move: s.collision ? CONST.WALL_MOVEMENT_TYPES.NORMAL : CONST.WALL_MOVEMENT_TYPES.NONE,
          sight: s.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
          light: s.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE};
      });
      if (updates.length) await scene.updateEmbeddedDocuments("Wall", updates, {[ID]: true});
      await this.clearRiders(scene);
    });
  }
  async clearRiders(scene, slotId = null) {
    const updates = scene.tokens.filter(t => !slotId || t.getFlag(ID, "ride")?.slotId === slotId).map(t => ({_id: t.id,
      [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: t.getFlag(ID, "request")?.id ?? null}));
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates, {[ID]: true});
    const notes = scene.notes.filter(n => !slotId || n.getFlag(ID, "ride")?.slotId === slotId).map(n => ({_id: n.id,
      [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: n.getFlag(ID, "request")?.id ?? null}));
    if (notes.length) await scene.updateEmbeddedDocuments("Note", notes, {[ID]: true});
    const lights = scene.lights.filter(n => !slotId || n.getFlag(ID, "ride")?.slotId === slotId).map(n => ({_id: n.id,
      [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: n.getFlag(ID, "request")?.id ?? null}));
    if (lights.length) await scene.updateEmbeddedDocuments("AmbientLight", lights, {[ID]: true});
  }
  async control(scene, slotId, action) {
    return this.serial(async () => {
      this.assertGM(scene);
      const state = this.state(scene), s = state.slots.find(s => s.id === slotId), tile = scene.tiles.get(s?.tileId);
      if (!tile) throw Error("Select and save a tile first.");
      if (action === "start") {
        if (!this.enabled(scene)) throw Error('Enable "This scene has Rotating Elements" in Scene Configuration first.');
        validateState(state, scene.tiles);
        if ((s.vision || s.collision) && (!s.mask || !scene.walls.some(w => w.getFlag(ID, "wall")?.slotId === slotId))) throw Error("Generate mask walls before starting, or disable vision and collision.");
        s.running = true;
      } else if (action === "pause") s.running = false;
      else if (action === "reverse") s.direction *= -1;
      else throw Error("Unknown rotation action.");
      await scene.setFlag(ID, "state", state);
      await tile.update({[`flags.${ID}.motion`]: {angle: tile.rotation, velocity: s.running && !game.paused ? s.speed * s.direction : 0, at: game.time.serverTime}}, {[ID]: true});
      this.last = game.time.serverTime;
    });
  }
  async generate(scene, slotId) {
    return this.serial(async () => {
      this.assertGM(scene);
      const state = this.state(scene), s = state.slots.find(s => s.id === slotId), tile = scene.tiles.get(s?.tileId);
      if (!tile || s.running) throw Error("Select a tile and pause this slot before generating walls.");
      validateState(state, scene.tiles);
      if (scene.walls.some(w => w.getFlag(ID, "wall")?.slotId === slotId)) throw Error("Remove this slot's existing generated walls first.");
      const {mask, segments} = await readMask(s.maskPath, s.resolution, s.threshold);
      this.assertGM(scene);
      const data = segments.map(segment => ({c: wallCoordinates(segment, tile, tile.rotation),
        move: s.collision ? CONST.WALL_MOVEMENT_TYPES.NORMAL : CONST.WALL_MOVEMENT_TYPES.NONE,
        sight: s.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
        light: s.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
        sound: CONST.WALL_SENSE_TYPES.NONE, door: CONST.WALL_DOOR_TYPES.NONE,
        flags: {[ID]: {wall: {slotId, tileId: tile.id, segment}}}}));
      const created = await scene.createEmbeddedDocuments("Wall", data, {[ID]: true});
      try { s.mask = mask; await scene.setFlag(ID, "state", state); }
      catch (error) { await scene.deleteEmbeddedDocuments("Wall", created.map(w => w.id), {[ID]: true}); throw error; }
      return created.length;
    });
  }
  async remove(scene, slotId) {
    return this.serial(async () => {
      this.assertGM(scene);
      const state = this.state(scene), s = state.slots.find(s => s.id === slotId);
      if (s.running) throw Error("Pause this slot before removing walls.");
      const ids = scene.walls.filter(w => w.getFlag(ID, "wall")?.slotId === slotId).map(w => w.id);
      if (ids.length) await scene.deleteEmbeddedDocuments("Wall", ids, {[ID]: true});
      s.mask = null;
      await scene.setFlag(ID, "state", state);
      await this.clearRiders(scene, slotId);
    });
  }
}
