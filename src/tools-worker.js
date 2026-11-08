// Extend the existing isolated worker without changing its geometry commands.
{
  const previous = self.onmessage;
  self.onmessage = async event => {
    const {id, op, args} = event.data;
    if (!['physicalProperties', 'sectionCaps', 'autoFillet'].includes(op)) return previous(event);
    try {
      const result = op === 'autoFillet' ? FAutoFillet.run(args, progress => self.postMessage({id, progress}), await FManifold.get())
        : op === 'physicalProperties' ? FTools.physicalSummary(args.records)
        : FTools.sectionCaps(args.records, args.axis, args.position, args.above);
      self.postMessage({id, result});
    } catch (error) { self.postMessage({id, error: error.message || String(error)}); }
  };
}
