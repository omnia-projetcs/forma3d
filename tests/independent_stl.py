"""Optional independent validation. Requires trimesh only for this test.
Run browser_functional.py first to produce the three browser export files.
"""
from pathlib import Path
import json
import trimesh
ROOT=Path(__file__).resolve().parents[1]
files=['examples/cube_20mm_binaire.stl','examples/cube_20mm_ascii.stl','examples/support_de_fixation.stl','tests/ui-export-binary.stl','tests/ui-export-ascii.stl','tests/ui-export-fused.stl']
rows=[]
for filename in files:
    mesh=trimesh.load_mesh(ROOT/filename,process=True)
    row={'file':filename,'faces':len(mesh.faces),'watertight':bool(mesh.is_watertight),'winding_consistent':bool(mesh.is_winding_consistent),'volume':float(mesh.volume),'extent_mm':[float(v) for v in mesh.extents]}
    if filename.startswith('examples/') or filename.endswith('-fused.stl'):
        assert mesh.is_watertight and mesh.is_winding_consistent, filename
    if 'cube_20mm' in filename:
        assert abs(mesh.volume-8000)<.001, filename
    rows.append(row)
    print(filename,row)
assert rows[3]['faces']==rows[4]['faces']
assert abs(rows[3]['volume']-rows[4]['volume'])<.001
assert abs(rows[3]['volume']-rows[5]['volume'])<.01
report={'validator':'trimesh '+trimesh.__version__,'checks':rows,'note':'Non-fused multi-part exports intentionally retain coincident internal cut faces.'}
(ROOT/'tests/independent-stl-results.json').write_text(json.dumps(report,indent=2))
