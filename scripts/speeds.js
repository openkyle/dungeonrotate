import {ID} from "./core.js";
export const DEFAULT_SPEEDS = Object.freeze([.1,.2,.3,.4,.5,.6,.7,.8]);
export function validateSpeeds(values) {
  if (!Array.isArray(values) || values.length !== 8 || values.some((v,i)=>!Number.isFinite(v)||v<.01||v>10||(i>0&&v<=values[i-1])))
    throw Error("Enter eight increasing speeds between 0.01 and 10 degrees per second.");
  return values;
}
export function rotationSpeeds() {
  const values = game.settings?.get(ID,"rotationSpeeds") ?? DEFAULT_SPEEDS;
  try { return [...validateSpeeds(values)]; } catch { return [...DEFAULT_SPEEDS]; }
}
export function stepSpeed(current, direction, values = rotationSpeeds()) {
  return direction > 0 ? (values.find(v=>v>current+1e-9) ?? values.at(-1))
    : ([...values].reverse().find(v=>v<current-1e-9) ?? values[0]);
}
export function createSpeedMenuClass() {
  return class RotationSpeedMenu extends FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {id:"rotating-dungeon-speeds",title:"Custom Rotation Speeds",
        template:`modules/${ID}/templates/speeds.hbs`,width:400,height:"auto",closeOnSubmit:false,classes:["rotating-dungeon"]});
    }
    getData() { return {levels:rotationSpeeds().map((speed,i)=>({level:i+1,speed}))}; }
    activateListeners(html) {
      super.activateListeners(html);
      html.find('[data-action="defaults"]').on("click",()=>DEFAULT_SPEEDS.forEach((speed,i)=>html.find(`[name="level${i+1}"]`).val(speed)));
    }
    async _updateObject(event,data) {
      try {
        if (!game.user.isGM) throw Error("Only a GM can change rotation speed levels.");
        const values=validateSpeeds(Array.from({length:8},(_,i)=>Number(data[`level${i+1}`])));
        await game.settings.set(ID,"rotationSpeeds",values);
        ui.notifications.info("Rotation speed levels saved. Use − / + to apply them to a slot.");
        await this.close();
      } catch(error) {ui.notifications.error(error.message);}
    }
  };
}
