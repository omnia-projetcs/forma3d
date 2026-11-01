/* CC0 KayKit models and FORMA fantasy adaptations. See assets/characters/kaykit. */
var FCharacterModels = (() => {
  const catalog = [
    {id:'knight',kind:'body',category:'fighter',height:170,color:'#ffffff',fr:'Chevalier',en:'Knight',frNote:'Armure, casque et cape · Kay Lousberg',enNote:'Armour, helmet and cape · Kay Lousberg'},
    {id:'mage',kind:'body',category:'magic',height:170,color:'#ffffff',fr:'Mage',en:'Mage',frNote:'Robe, chapeau et cape · Kay Lousberg',enNote:'Robe, hat and cape · Kay Lousberg'},
    {id:'rogue',kind:'body',category:'stealth',height:170,color:'#ffffff',fr:'Rogue',en:'Rogue',frNote:'Voleur, tenue en cuir et cape · Kay Lousberg',enNote:'Rogue, leather outfit and cape · Kay Lousberg'},
    {id:'goblin',kind:'body',category:'monster',height:115,color:'#ffffff',fr:'Gobelin',en:'Goblin',frNote:'Monstre vert, grandes oreilles et crocs · Adaptation FORMA de KayKit',enNote:'Green monster, large ears and fangs · FORMA adaptation of KayKit'},
    {id:'ogre',kind:'body',category:'monster',height:230,color:'#ffffff',fr:'Ogre',en:'Ogre',frNote:'Monstre massif, défenses et armure de cuir · Adaptation FORMA de KayKit',enNote:'Massive monster, tusks and leather armour · FORMA adaptation of KayKit'},
    {id:'dwarf',kind:'body',category:'fantasy',height:130,color:'#ffffff',fr:'Nain',en:'Dwarf',frNote:'Guerrier trapu, barbe cuivrée et casque · Adaptation FORMA de KayKit',enNote:'Stocky warrior, copper beard and helmet · FORMA adaptation of KayKit'},
    {id:'elf',kind:'body',category:'fantasy',height:175,color:'#ffffff',fr:'Elfe',en:'Elf',frNote:'Silhouette élancée, oreilles pointues et tenue verte · Adaptation FORMA de KayKit',enNote:'Slender figure, pointed ears and green outfit · FORMA adaptation of KayKit'}
  ].map(Object.freeze);
  // Older saved projects retain their original templates without adding cards.
  const legacy = [
    {id:'barbarian',kind:'body',height:180,color:'#ffffff',fr:'Barbare',en:'Barbarian'},
    {id:'ranger',kind:'body',height:170,color:'#ffffff',fr:'Rôdeur à capuche',en:'Hooded rogue'}
  ].map(Object.freeze);
  const get=id=>catalog.find(p=>p.id===id)||legacy.find(p=>p.id===id);
  function generate(id,height=get(id)?.height){
    const preset=get(id),data=FCharacterModelData[id];if(!preset||!data||!Number.isFinite(height)||height<10||height>1000)throw Error('character.parameters');
    const decode=value=>{const raw=atob(value),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new Float32Array(bytes.buffer);};
    const positions=decode(data.positions),colors=decode(data.colors),scale=height/preset.height;
    if(colors.length!==positions.length)throw Error('character.parameters');if(scale!==1)for(let i=0;i<positions.length;i++)positions[i]*=scale;
    const geo=FG.geometry(positions);geo.colors=colors;return geo;
  }
  return {catalog:Object.freeze(catalog),get,generate};
})();
