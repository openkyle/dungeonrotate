import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelClass} from '../scripts/panel.js';
test('dirty settings survive external renders and can render after saving',()=>{
 let renders=0;
 globalThis.FormApplication=class {render(){renders++;return this;}};
 globalThis.canvas={scene:{id:'scene'}};
 const Panel=createPanelClass({});const panel=new Panel();panel.rendered=true;panel.dirty=true;
 assert.equal(panel.render(true),panel);assert.equal(renders,0);
 panel.dirty=false;panel.render(false);assert.equal(renders,1);
});
