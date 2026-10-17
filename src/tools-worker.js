// Extend the existing isolated worker without changing its geometry commands.
{
  const previous = self.onmessage;
  self.onmessage = event => {
    const {id, op, args} = event.data;
    if (!['physicalProperties', 'sectionCaps'].includes(op)) return previous(event);
    try {
      const result = op === 'physicalProperties' ? FTools.physicalSummary(args.records)
        : FTools.sectionCaps(args.records, args.axis, args.position, args.above);
      self.postMessage({id, result});
    } catch (error) { self.postMessage({id, error: error.message || String(error)}); }
  };
}
