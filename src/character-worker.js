{
  const previousCharacterJob = self.onmessage;
  self.onmessage = async event => {
    const {id,op,args} = event.data;
    if (!['characterModel','characterBase','characterRemesh','characterLoop','characterRefine','characterPose','characterThickness'].includes(op)) return previousCharacterJob(event);
    try {
      let result;
      if(op==='characterModel'){const g=FCharacterModels.generate(args.preset,args.height);result={positions:g.positions,colors:g.colors};}
      if(op==='characterBase')result={positions:FCharacter.base(args.kind,args.height,args.width,args.head,args.detail).positions};
      if(op==='characterRemesh')result=FCharacter.remesh(args.meshes,args.resolution,progress=>self.postMessage({id,progress}));
      if(op==='characterLoop'||op==='characterRefine'){const g=FG.geometry(args.positions);if(args.colors)g.colors=args.colors;const refined=op==='characterLoop'?FCharacter.loop(g):FCharacter.refine(g);result={positions:refined.positions,...(refined.colors?{colors:refined.colors}:{})};}
      if(op==='characterPose')result={positions:FCharacter.pose(FG.geometry(args.positions),args.bones).positions};
      if(op==='characterThickness')result=FCharacter.thickness(FG.geometry(args.positions),args.threshold);
      self.postMessage({id,result},result.positions?[result.positions.buffer,...(result.colors?[result.colors.buffer]:[])]:[]);
    }catch(error){self.postMessage({id,error:error.message||String(error)});}
  };
}
