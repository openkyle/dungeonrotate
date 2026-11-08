import {ID, defaultState, validateState, normalize, toLocal, toWorld, onFloor, solidAt, wallCoordinates, visualAngle} from "./core.js";
import {readMask, readFloor} from "./mask.js";
const clone = value => foundry.utils.deepClone(value);
const point = a => ({x: a[0], y: a[1]});

export class RotationController {
  constructor() {
    this.requestAuthors = new Map();
    this.queue = Promise.resolve(); this.last = 0; this.owner = null; this.timer = null;
    this.readMask = readMask; this.readFloor = readFloor;
    this.failure = false; this.lastError = ""; this.stopped = true;
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
        this.failure = true; this.lastError = error.message;
        this.onStatusChange?.();
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
      return s[carryKey] && onFloor(local, tile, s) && !(carryKey === "carry" && s.mask && solidAt(s.mask, local, tile));
    });
  }
  assigned(scene, state, center, flags, carryKey = "carry") {
    if (carryKey !== "carry") flags = {ride: flags.ride}; // Pins/lights are detected from the scene, never manually selected.
    if (flags.attachment === "none") return undefined;
    const desired = flags.attachment || flags.ride?.slotId;
    const slot = this.slots(scene, state).find(s => s[carryKey] && s.id === desired);
    // Explicit attachments never silently switch to a different floor.
    return slot ?? (flags.attachment ? undefined : this.pick(scene, state, center, new Map(), carryKey));
  }
  center(token, scene) { return [token.x + token.width * scene.grid.size / 2, token.y + token.height * scene.grid.size / 2]; }
  observeTokenRequest(token, change, userId) {
    const request = change[`flags.${ID}.request`] ?? change.flags?.[ID]?.request;
    if (request?.id) this.requestAuthors.set(`${token.parent.id}:${token.id}`, {id:request.id,userId});
  }
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
      local: toLocal(target, tile), at: game.time.serverTime, userId: game.user.id,
      animate: options.animate !== false, duration: Number.isFinite(options.animation?.duration) ? Math.max(0, Math.min(10000, options.animation.duration)) : null};
    delete change.x; delete change.y;
  }
  async tick() {
    if (this.failure || !canvas.ready || !canvas.scene) return;
    const scene = canvas.scene, authority = this.authority(scene);
    if (!this.enabled(scene)) { this.last = 0; this.owner = null; return; }
    if (authority?.id !== game.user.id) { this.last = 0; this.owner = null; return; }
    const now = game.time.serverTime, state = this.state(scene);
    let originChanged = false;
    for (const slot of this.slots(scene, state)) if (!Number.isFinite(slot.startRotation)) {
      slot.startRotation = scene.tiles.get(slot.tileId).rotation; originChanged = true;
    }
    if (originChanged) await scene.setFlag(ID, "state", state);
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
        if (f?.slotId === s.id && (!f.tileId || f.tileId === tile.id)) wallUpdates.push({_id: wall.id, c: wallCoordinates(f.segment, tile, angle)});
      }
    }
    // Foundry has no cross-document transaction. Walls first, then token positions, then tile clock.
    if (wallUpdates.length) await scene.updateEmbeddedDocuments("Wall", wallUpdates, {[ID]: true, render: false});
    if (canvas.scene?.id !== scene.id || this.authority(scene)?.id !== game.user.id) return;
    const tokenUpdates = new Map();
    for (const token of scene.tokens) {
      if (token.getFlag(ID, "attachment") === "none") continue;
      const f = token.flags[ID] ?? {}, center = this.center(token, scene);
      let slot = this.assigned(scene, state, center, f);
      if (!slot) continue;
      const tile = scene.tiles.get(slot.tileId), angle = angles.get(slot.id);
      let local = f.ride?.slotId === slot.id ? f.ride.local : toLocal(center, tile);
      if (!Array.isArray(local) || local.length !== 2 || !local.every(Number.isFinite)) local = toLocal(center, tile);
      let animationUntil = Number.isFinite(f.ride?.animationUntil) && f.ride.animationUntil > now ? f.ride.animationUntil : 0;
      let explicitInstant = false;
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
          const author = this.requestAuthors.get(`${scene.id}:${token.id}`);
          const gmMove = requester.isGM && author?.id === request.id && author.userId === requester.id;
          const inSolid = !gmMove && slots.some(s => s.collision && s.mask && solidAt(s.mask, toLocal(target, scene.tiles.get(s.tileId), angles.get(s.id)), scene.tiles.get(s.tileId)));
          // Native movement collision tests include static scene walls and both rotating wall sets.
          const blocked = !gmMove && (!token.object || token.object.checkCollision(point(target), {origin: point(destination), type: "move", mode: "any"}));
          const bounds = scene.dimensions;
          const insideScene = target[0] >= bounds.sceneX && target[1] >= bounds.sceneY && target[0] < bounds.sceneX + bounds.sceneWidth && target[1] < bounds.sceneY + bounds.sceneHeight;
          if (!inSolid && !blocked && insideScene) {
            const distance = Math.hypot(target[0]-destination[0],target[1]-destination[1]);
            const duration = Number.isFinite(request.duration) ? Math.max(0,Math.min(10000,request.duration)) : Math.min(10000,distance/scene.grid.size/6*1000);
            explicitInstant = request.animate === false;
            animationUntil = explicitInstant ? 0 : now + duration;
            local = request.local; destination = target;
          }
          else update[`flags.${ID}.rejected`] = request.id;
        } else update[`flags.${ID}.rejected`] = request.id;
      }
      if (!f.attachment && !onFloor(local, tile, slot)) {
        slot = this.pick(scene, state, destination, angles);
        local = slot ? toLocal(destination, scene.tiles.get(slot.tileId), angles.get(slot.id)) : null;
      }
      const ride = slot ? {slotId: slot.id, local, ...(animationUntil ? {animationUntil} : {})} : null;
      if (JSON.stringify(ride) !== JSON.stringify(f.ride ?? null)) update[`flags.${ID}.ride`] = ride;
      const x = Math.round(destination[0] - token.width * scene.grid.size / 2), y = Math.round(destination[1] - token.height * scene.grid.size / 2);
      if (Math.abs(x - token.x) > .001) update.x = x;
      if (Math.abs(y - token.y) > .001) update.y = y;
      if (Object.keys(update).length > 1) {
        // Animate deliberate moves only. Repeated native carry animations keep
        // Foundry tokens continuously busy and can block click/drag interactions.
        const duration = explicitInstant ? 0 : Math.max(animationUntil-now, 0);
        const key = Math.round(duration);
        if (!tokenUpdates.has(key)) tokenUpdates.set(key, []);
        tokenUpdates.get(key).push(update);
      }
    }
    for (const [duration, updates] of tokenUpdates) await scene.updateEmbeddedDocuments("Token", updates,
      {[ID]: true, render: false, animate: duration > 0, animation: {duration}});
    const noteUpdates = this.noteUpdates(scene, state, slots, angles, now);
    if (noteUpdates.length) await scene.updateEmbeddedDocuments("Note", noteUpdates, {[ID]: true, render: false});
    const lightUpdates = this.anchoredUpdates(scene, state, angles, now, "AmbientLight");
    if (lightUpdates.length) await scene.updateEmbeddedDocuments("AmbientLight", lightUpdates, {[ID]: true, render: false});
    if (tileUpdates.length) await scene.updateEmbeddedDocuments("Tile", tileUpdates, {[ID]: true, render: false});
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
      if (!onFloor(local, tile, slot)) {
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
      if (!mesh || tile.object?._preview) continue;
      const moving = this.enabled() && state.smooth && s.running && !game.paused && authority;
      const angle = moving ? visualAngle(tile.getFlag(ID, "motion"), game.time.serverTime, state.hz) : tile.rotation;
      mesh.rotation = (angle ?? tile.rotation) * Math.PI / 180;
    }
  }
  wallData(slot, tile, segments) {
    return segments.map(segment => ({c: wallCoordinates(segment, tile, tile.rotation),
      move: slot.collision ? CONST.WALL_MOVEMENT_TYPES.NORMAL : CONST.WALL_MOVEMENT_TYPES.NONE,
      sight: slot.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
      light: slot.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
      sound: CONST.WALL_SENSE_TYPES.NONE, door: CONST.WALL_DOOR_TYPES.NONE,
      flags: {[ID]: {wall: {slotId: slot.id, tileId: tile.id, segment}}}}));
  }
  async configure(scene, next) {
    return this.serial(async () => {
      this.assertGM(scene); validateState(next, scene.tiles);
      const previous = this.state(scene), prepared = clone(next), data = [];
      // Validate every image before changing any scene documents. Saving also refreshes a mask edited in place.
      for (const slot of prepared.slots) {
        const old = previous.slots.find(s => s.id === slot.id), tile = scene.tiles.get(slot.tileId);
        slot.running = !!tile && old.tileId === slot.tileId && old.running;
        slot.startRotation = tile ? (old.tileId === tile.id && Number.isFinite(old.startRotation) ? old.startRotation : tile.rotation) : null;
        slot.mask = null; slot.floor = null;
        if (!tile) continue;
        if (slot.footprint === "artwork") slot.floor = await this.readFloor(tile.texture?.src);
        if (!slot.maskPath) continue;
        let result;
        try { result = await this.readMask(slot.maskPath, slot.resolution, slot.threshold, slot.wallSmoothing ?? 1, slot.wallMargin ?? 0); }
        catch (error) {
          const filename = slot.maskPath.split("/").pop().split(/[?#]/)[0];
          throw Error(`Slot ${slot.id.toUpperCase()} — ${filename}: ${error.message}`);
        }
        slot.mask = result.mask; data.push(...this.wallData(slot, tile, result.segments));
      }
      this.assertGM(scene);
      prepared.autoFloor = true;
      const oldWalls = scene.walls.filter(w => w.getFlag(ID, "wall") && w.getFlag(ID, "wall").source !== "manual");
      const snapshots = oldWalls.map(w => w.toObject());
      let created = [];
      try {
        if (data.length) created = await scene.createEmbeddedDocuments("Wall", data, {[ID]: true, render: false});
        await scene.setFlag(ID, "state", prepared);
        if (oldWalls.length) await scene.deleteEmbeddedDocuments("Wall", oldWalls.map(w => w.id), {[ID]: true, render: false});
        await this.clearRiders(scene);
        this.last = game.time.serverTime;
      } catch (error) {
        try {
          const missing = snapshots.filter(w => !scene.walls.has(w._id));
          if (missing.length) await scene.createEmbeddedDocuments("Wall", missing, {[ID]: true, keepId: true});
          await scene.setFlag(ID, "state", previous);
          const ids = created.filter(w => scene.walls.has(w.id)).map(w => w.id);
          if (ids.length) await scene.deleteEmbeddedDocuments("Wall", ids, {[ID]: true, render: false});
        } catch (rollbackError) {
          this.failure = true; this.lastError = error.message;
        this.onStatusChange?.();
          console.error(ID, "Could not restore previous wall configuration", rollbackError);
          throw Error(`${error.message} Automatic restoration failed; engine stopped. Restore the scene backup before resuming.`);
        }
        throw error;
      }
      return data.length;
    });
  }
  async clearRiders(scene, slotId = null) {
    const updates = scene.tokens.filter(t => !slotId || t.getFlag(ID, "ride")?.slotId === slotId).map(t => ({_id: t.id,
      [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: t.getFlag(ID, "request")?.id ?? null}));
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates, {[ID]: true, render: false});
    const notes = scene.notes.filter(n => !slotId || n.getFlag(ID, "ride")?.slotId === slotId).map(n => ({_id: n.id,
      [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: n.getFlag(ID, "request")?.id ?? null}));
    if (notes.length) await scene.updateEmbeddedDocuments("Note", notes, {[ID]: true, render: false});
    const lights = scene.lights.filter(n => !slotId || n.getFlag(ID, "ride")?.slotId === slotId).map(n => ({_id: n.id,
      [`flags.${ID}.ride`]: null, [`flags.${ID}.ack`]: n.getFlag(ID, "request")?.id ?? null}));
    if (lights.length) await scene.updateEmbeddedDocuments("AmbientLight", lights, {[ID]: true, render: false});
  }
  manualWallAttachment(scene, coordinates, existing = null) {
    if (!this.enabled(scene) || !Array.isArray(coordinates) || coordinates.length !== 4 || !coordinates.every(Number.isFinite)) return null;
    const state = this.state(scene), slots = this.slots(scene, state);
    let slot = existing?.source === "manual" ? slots.find(s => s.id === existing.slotId && s.tileId === existing.tileId) : null;
    const endpoints = [coordinates.slice(0,2), coordinates.slice(2)];
    if (!slot) {
      const distance = (p,c) => {
        const dx=c[2]-c[0],dy=c[3]-c[1],d=dx*dx+dy*dy;
        const t=d?Math.max(0,Math.min(1,((p[0]-c[0])*dx+(p[1]-c[1])*dy)/d)):0;
        return Math.hypot(p[0]-c[0]-t*dx,p[1]-c[1]-t*dy);
      };
      let best = Math.max(2, scene.grid.size * .15);
      for (const wall of scene.walls) {
        const f=wall.getFlag(ID,"wall"), candidate=slots.find(s=>s.id===f?.slotId && (!f.tileId || s.tileId===f.tileId));
        if (!candidate) continue;
        const d=Math.min(...endpoints.map(p=>distance(p,wall.c)));
        if (d<best) {best=d;slot=candidate;}
      }
      if (!slot) {
        const center=[(coordinates[0]+coordinates[2])/2,(coordinates[1]+coordinates[3])/2];
        slot=slots.reverse().find(s=>onFloor(toLocal(center,scene.tiles.get(s.tileId)),scene.tiles.get(s.tileId),s));
      }
    }
    if (!slot) return null;
    const tile=scene.tiles.get(slot.tileId);
    const segment=endpoints.flatMap(p=>{const local=toLocal(p,tile);return [local[0]/tile.width,local[1]/tile.height];});
    return {slotId:slot.id,tileId:tile.id,source:"manual",segment};
  }
  async resetSlot(scene, state, slot, tile) {
    slot.running=false;
    await scene.setFlag(ID,"state",state);
    const angle=slot.startRotation, options={[ID]:true,render:false,animate:false};
    try {
      const walls=scene.walls.filter(w=>{const f=w.getFlag(ID,"wall");return f?.slotId===slot.id&&(!f.tileId||f.tileId===tile.id);});
      if(walls.length)await scene.updateEmbeddedDocuments("Wall",walls.map(w=>({_id:w.id,c:wallCoordinates(w.getFlag(ID,"wall").segment,tile,angle)})),options);
      for(const [kind,collection,key] of [["Token",scene.tokens,"carry"],["Note",scene.notes,"carryNotes"],["AmbientLight",scene.lights,"carryLights"]]) {
        const updates=[];
        for(const doc of collection) {
          const flags=doc.flags[ID]??{},center=kind==="Token"?this.center(doc,scene):[doc.x,doc.y];
          if(this.assigned(scene,state,center,flags,key)?.id!==slot.id)continue;
          const local=flags.ride?.slotId===slot.id?flags.ride.local:toLocal(center,tile);
          const world=toWorld(local,tile,angle),update={_id:doc.id,x:Math.round(world[0]-(kind==="Token"?doc.width*scene.grid.size/2:0)),y:Math.round(world[1]-(kind==="Token"?doc.height*scene.grid.size/2:0))};
          const ride={slotId:slot.id,local};
          if(kind==="AmbientLight") {ride.rotation=flags.ride?.rotation??normalize(doc.rotation-tile.rotation);update.rotation=normalize(ride.rotation+angle);}
          update[`flags.${ID}.ride`]=ride;
          update[`flags.${ID}.ack`]=flags.request?.id??null;
          updates.push(update);
        }
        if(updates.length)await scene.updateEmbeddedDocuments(kind,updates,options);
      }
      await tile.update({rotation:angle,[`flags.${ID}.motion`]:{angle,velocity:0,at:game.time.serverTime}},options);
      this.last=game.time.serverTime;
    } catch(error) {
      this.failure=true;this.lastError=`Reset stopped partway: ${error.message}`;this.onStatusChange?.();throw Error(this.lastError);
    }
  }
  async control(scene, slotId, action) {
    return this.serial(async () => {
      this.assertGM(scene);
      const state = this.state(scene), s = state.slots.find(s => s.id === slotId), tile = scene.tiles.get(s?.tileId);
      if (!tile) throw Error("Select and save a tile first.");
      if (!Number.isFinite(s.startRotation)) s.startRotation = tile.rotation;
      if (action === "setDefault") {
        s.startRotation = normalize(tile.rotation);
        await scene.setFlag(ID, "state", state);
        return;
      }
      if (action === "reset") { await this.resetSlot(scene, state, s, tile); return; }
      if (action === "start") {
        if (this.failure) throw Error(`Engine stopped: ${this.lastError || "previous update failed"}. Use Resume engine first.`);
        if (!this.enabled(scene)) throw Error('Enable "This scene has Rotating Elements" in Scene Configuration first.');
        validateState(state, scene.tiles);
        if (s.maskPath && (s.vision || s.collision) && (!s.mask || !scene.walls.some(w => w.getFlag(ID, "wall")?.slotId === slotId))) throw Error("Choose a wall mask and save settings first, or disable vision and collision in Advanced settings.");
        s.running = true;
      } else if (action === "pause") s.running = false;
      else if (action === "reverse") s.direction *= -1;
      else throw Error("Unknown rotation action.");
      await scene.setFlag(ID, "state", state);
      await tile.update({[`flags.${ID}.motion`]: {angle: tile.rotation, velocity: s.running && !game.paused ? s.speed * s.direction : 0, at: game.time.serverTime}}, {[ID]: true, render: false});
      this.last = game.time.serverTime;
      if (action === "start" && game.paused) ui.notifications.warn("Rotation is armed, but Foundry is paused. Press Space to unpause the game and begin rotation.");
    });
  }
  async generate(scene, slotId) {
    return this.serial(async () => {
      this.assertGM(scene);
      const state = this.state(scene), s = state.slots.find(s => s.id === slotId), tile = scene.tiles.get(s?.tileId);
      if (!tile || s.running) throw Error("Select a tile and pause this slot before generating walls.");
      validateState(state, scene.tiles);
      if (scene.walls.some(w => w.getFlag(ID, "wall")?.slotId === slotId)) throw Error("Remove this slot's existing generated walls first.");
      const {mask, segments} = await readMask(s.maskPath, s.resolution, s.threshold, s.wallSmoothing ?? 1, s.wallMargin ?? 0);
      this.assertGM(scene);
      const data = segments.map(segment => ({c: wallCoordinates(segment, tile, tile.rotation),
        move: s.collision ? CONST.WALL_MOVEMENT_TYPES.NORMAL : CONST.WALL_MOVEMENT_TYPES.NONE,
        sight: s.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
        light: s.vision ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
        sound: CONST.WALL_SENSE_TYPES.NONE, door: CONST.WALL_DOOR_TYPES.NONE,
        flags: {[ID]: {wall: {slotId, tileId: tile.id, segment}}}}));
      const created = await scene.createEmbeddedDocuments("Wall", data, {[ID]: true, render: false});
      try { s.mask = mask; await scene.setFlag(ID, "state", state); }
      catch (error) { await scene.deleteEmbeddedDocuments("Wall", created.map(w => w.id), {[ID]: true, render: false}); throw error; }
      return created.length;
    });
  }
  async remove(scene, slotId) {
    return this.serial(async () => {
      this.assertGM(scene);
      const state = this.state(scene), s = state.slots.find(s => s.id === slotId);
      if (s.running) throw Error("Pause this slot before removing walls.");
      const ids = scene.walls.filter(w => w.getFlag(ID, "wall")?.slotId === slotId && w.getFlag(ID, "wall").source !== "manual").map(w => w.id);
      if (ids.length) await scene.deleteEmbeddedDocuments("Wall", ids, {[ID]: true, render: false});
      s.mask = null;
      await scene.setFlag(ID, "state", state);
      await this.clearRiders(scene, slotId);
    });
  }
}
