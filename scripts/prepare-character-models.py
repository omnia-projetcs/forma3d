#!/usr/bin/env python3
"""Bake the bundled CC0 KayKit GLBs into compact editable meshes with colours.

Development only: numpy + Pillow. Runtime remains entirely self-contained.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/characters/kaykit'
MODELS = [('knight', 'Knight', 170), ('mage', 'Mage', 170), ('barbarian', 'Barbarian', 180), ('rogue', 'Rogue', 170), ('ranger', 'Rogue_Hooded', 170)]
VARIANTS = [('goblin', 'Rogue', 115), ('ogre', 'Barbarian', 230),
            ('dwarf', 'Barbarian', 130), ('elf', 'Rogue', 175)]


def matrix(t, q, s):
    x, y, z, w = q
    result = np.eye(4)
    result[:3, :3] = np.array([
        [1-2*y*y-2*z*z, 2*x*y-2*z*w, 2*x*z+2*y*w],
        [2*x*y+2*z*w, 1-2*x*x-2*z*z, 2*y*z-2*x*w],
        [2*x*z-2*y*w, 2*y*z+2*x*w, 1-2*x*x-2*y*y],
    ]) @ np.diag(s)
    result[:3, 3] = t
    return result


def convert(file, height, variant=None):
    raw = file.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length])
    binary = raw[28+length:]

    def accessor(index):
        a = doc['accessors'][index]
        v = doc['bufferViews'][a['bufferView']]
        dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
        components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        stride = v.get('byteStride', np.dtype(dtype).itemsize*components)
        values = np.ndarray((a['count'], components), dtype=dtype, buffer=binary,
                            offset=v.get('byteOffset', 0)+a.get('byteOffset', 0),
                            strides=(stride, np.dtype(dtype).itemsize)).copy()
        return values

    trs = [{k: n.get(k, default) for k, default in [('translation', [0, 0, 0]), ('rotation', [0, 0, 0, 1]), ('scale', [1, 1, 1])]} for n in doc['nodes']]
    # Artist-authored unarmed idle pose, with hands beside the body.
    clip = next((a for a in doc.get('animations', []) if a.get('name') == 'Unarmed_Idle'), None)
    if clip:
        for channel in clip['channels']:
            target = channel['target']
            if target['path'] not in trs[target['node']]:
                continue
            sampler = clip['samplers'][channel['sampler']]
            output = accessor(sampler['output'])
            trs[target['node']][target['path']] = output[1 if sampler.get('interpolation') == 'CUBICSPLINE' else 0].tolist()
    parents = {}
    for i, n in enumerate(doc['nodes']):
        for c in n.get('children', []):
            parents[c] = i
    globals_ = {}

    def world(i):
        if i not in globals_:
            n = doc['nodes'][i]
            local = np.array(n['matrix']).reshape(4, 4).T if 'matrix' in n else matrix(trs[i]['translation'], trs[i]['rotation'], trs[i]['scale'])
            globals_[i] = world(parents[i]) @ local if i in parents else local
        return globals_[i]

    textures = []
    for image in doc.get('images', []):
        view = doc['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset', 0)
        textures.append(np.asarray(Image.open(io.BytesIO(binary[offset:offset+view['byteLength']])).convert('RGB')))
    positions, colours, parts = [], [], []
    # Retain the complete body and outfit. Alternative weapons/shields in the
    # source scene are mutually exclusive accessories, not extra body parts.
    for node_id, node in enumerate(doc['nodes']):
        if 'mesh' not in node:
            continue
        if 'skin' not in node and not node.get('name', '').endswith(('_Hat', '_Helmet', '_Cape')):
            continue
        if variant in ('goblin', 'ogre') and 'skin' not in node:
            continue
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']
            p = accessor(attrs['POSITION']).astype(np.float64)
            homogeneous = np.column_stack([p, np.ones(len(p))])
            if 'skin' in node:
                skin = doc['skins'][node['skin']]
                inverse = accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
                transforms = np.array([world(j) @ inverse[k] for k, j in enumerate(skin['joints'])])
                joints, weights = accessor(attrs['JOINTS_0']), accessor(attrs['WEIGHTS_0'])
                transformed = np.zeros((len(p), 4))
                for k in range(4):
                    transformed += np.einsum('nij,nj->ni', transforms[joints[:, k]], homogeneous)*weights[:, k, None]
                p = transformed[:, :3]
            else:
                p = (world(node_id) @ homogeneous.T).T[:, :3]
            material = doc.get('materials', [])[primitive.get('material', 0)].get('pbrMetallicRoughness', {})
            factor = np.array(material.get('baseColorFactor', [1, 1, 1, 1])[:3], dtype=np.float64)
            rgb = np.tile(factor, (len(p), 1))
            if 'baseColorTexture' in material and 'TEXCOORD_0' in attrs:
                texture = textures[doc['textures'][material['baseColorTexture']['index']]['source']]
                uv = accessor(attrs['TEXCOORD_0'])
                # glTF image coordinates originate at the upper-left corner.
                x = np.clip(np.floor(uv[:, 0]*texture.shape[1]).astype(int), 0, texture.shape[1]-1)
                y = np.clip(np.floor(uv[:, 1]*texture.shape[0]).astype(int), 0, texture.shape[0]-1)
                rgb *= texture[y, x]/255.0
            indices = accessor(primitive['indices']).reshape(-1) if 'indices' in primitive else np.arange(len(p))
            p, rgb = p[indices].reshape(-1, 3, 3), rgb[indices].reshape(-1, 3, 3)
            valid = np.linalg.norm(np.cross(p[:, 1]-p[:, 0], p[:, 2]-p[:, 0]), axis=1) > 1e-12
            positions.append(p[valid].reshape(-1, 3))
            colours.append(rgb[valid].reshape(-1, 3))
            parts.extend([node.get('name', '')]*int(valid.sum()*3))
    p, rgb = np.concatenate(positions), np.concatenate(colours)
    # glTF Y up / facing +Z -> FORMA Z up / facing -Y.
    p = p[:, [0, 2, 1]]*np.array([1, -1, 1])
    lo, hi = p.min(axis=0), p.max(axis=0)
    p = (p-np.array([(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, lo[2]]))*170/(hi[2]-lo[2])
    if variant:
        p, rgb = fantasy_variant(p, rgb, np.array(parts), variant)
    lo, hi = p.min(axis=0), p.max(axis=0)
    p = (p-np.array([(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, lo[2]]))*height/(hi[2]-lo[2])
    encode = lambda array: base64.b64encode(np.asarray(array, dtype='<f4').tobytes()).decode()
    return {'positions': encode(p), 'colors': encode(rgb), 'triangles': len(p)//3,
            'height': height, 'sourceSha256': hashlib.sha256(raw).hexdigest(),
            **({'variant': variant, 'sourceModel': file.stem} if variant else {})}


def fantasy_variant(p, rgb, parts, kind):
    """FORMA adaptations of complete KayKit outfits, with sculpted fantasy details.

    All edits are baked once here, never generated in the runtime editor.
    Source geometry remains untouched; provenance distinguishes adaptations.
    """
    head = np.char.endswith(parts, '_Head')
    skin = (rgb[:, 0] > rgb[:, 1]*1.12) & (rgb[:, 1] > rgb[:, 2]*1.08) & (rgb[:, 0] > .52) & (rgb[:, 1] > .35)
    # Piecewise continuous proportions keep clothes and joints connected.
    if kind == 'dwarf':
        p[:, 0] *= 1.20
        p[:, 1] *= 1.12
        p[:, 2] = np.interp(p[:, 2], [0, 55, 105, 170], [0, 38, 82, 143])
        # Copper beard and warm bronze equipment on the original bearded warrior.
        beard = head & ~skin & (rgb[:, 0] > .12) & (rgb[:, 0] < .62) & (p[:, 2] < 115)
        rgb[beard] *= [1.32, .79, .49]
    elif kind == 'elf':
        p[:, 0] *= .90
        p[:, 2] = np.interp(p[:, 2], [0, 55, 105, 170], [0, 62, 115, 177])
        leather = ~head & ~skin & (rgb[:, 0] > rgb[:, 2]*1.15)
        rgb[leather] *= [.52, 1.15, .74]
    elif kind == 'goblin':
        p[:, 2] = np.interp(p[:, 2], [0, 55, 105, 170], [0, 39, 80, 150])
        p[:, 0] *= np.where(head, 1.13, .93)
        p[:, 1] *= np.where(head, 1.08, 1.)
        light = np.mean(rgb[skin], axis=1)
        rgb[skin] = light[:, None]*[.47, .94, .28]
    elif kind == 'ogre':
        p[:, 0] *= np.where(head, 1.03, 1.48)
        p[:, 1] *= np.where(head, 1.02, 1.27)
        p[:, 2] = np.interp(p[:, 2], [0, 55, 105, 170], [0, 48, 108, 167])
        light = np.mean(rgb[skin], axis=1)
        rgb[skin] = light[:, None]*[.62, .91, .41]
        # The original beard reads as a heavy jaw in the ogre's skin palette.
        jaw = head & ~skin & (p[:, 2] < 133) & (rgb[:, 0] > .14) & (rgb[:, 0] < .65)
        light = np.mean(rgb[jaw], axis=1)
        rgb[jaw] = light[:, None]*[.69, 1.05, .48]
    extras, shades = [], []

    def surface(vertices, faces, color):
        v = np.array(vertices, dtype=float)
        for face in faces:
            tri = v[list(face)]
            if np.linalg.norm(np.cross(tri[1]-tri[0], tri[2]-tri[0])) < 1e-9:
                continue
            extras.extend(tri)
            shades.extend([color]*3)

    def ear(side, anchor, width, rise, color):
        # Closed pointed pinna with a raised outer rim and inset inner bowl.
        x, y, z = anchor
        outline = np.array([[0, 0, -6], [width*.46, 0, -3],
                            [width, 1, rise], [width*.36, 1, 7], [0, 0, 5.]])
        front = outline.copy(); front[:, 1] -= 1.8
        back = outline.copy(); back[:, 1] += 1.8
        vertices = np.vstack([front, back, [width*.34, -3.6, 2]])
        vertices[:, 0] = (vertices[:, 0]+x)*side
        vertices[:, 1] += y; vertices[:, 2] += z
        faces = []
        for i in range(5):
            j = (i+1)%5
            faces.extend([(i,j,10), (5,5+j,5+i)] if i not in (0,4) else [(i,j,10)])
            faces.extend([(i,5+i,5+j), (i,5+j,j)])
        # A fan anchored at back vertex 5 triangulates the convex back.
        faces = [(i,j,k) for i,j,k in faces if len({i,j,k})==3]
        if side < 0: faces = [(a,c,b) for a,b,c in faces]
        surface(vertices, faces, color)
        inset = np.array([[x+width*.15, y-2.2, z-2],
                          [x+width*.80, y-1.7, z+rise*.78],
                          [x+width*.32, y-3.65, z+3]])
        inset[:,0] *= side
        surface(inset, [(0,1,2) if side>0 else (0,2,1)], np.array(color)*[1.02,.73,.67])

    def tusk(x, y, z, radius, length):
        rings = []
        for t, r in [(0, radius), (.45, radius*.78), (.83, radius*.35)]:
            rings.append([[x+np.cos(a)*r, y-np.sin(a)*r-length*.18*t*t, z+length*t]
                          for a in np.arange(10)*np.pi/5])
        vertices = np.array(rings).reshape(-1,3).tolist()+[[x,y-length*.27,z+length], [x,y,z]]
        faces=[]
        for j in range(10):
            k=(j+1)%10
            faces.append((31,k,j))
            for r in range(2):faces.extend([(r*10+j,r*10+k,(r+1)*10+k),(r*10+j,(r+1)*10+k,(r+1)*10+j)])
            faces.append((20+j,20+k,30))
        surface(vertices,[(a,c,b) for a,b,c in faces],[.94,.87,.65])

    if kind in ('goblin', 'ogre', 'elf'):
        h = p[head]
        lo, hi = h.min(axis=0), h.max(axis=0)
        eye_z = lo[2]+(hi[2]-lo[2])*.48
        ear_color = {'goblin':[.36,.64,.22], 'ogre':[.44,.61,.29], 'elf':[.84,.62,.43]}[kind]
        for side in (-1,1):
            ear(side, [hi[0]*.84, (lo[1]+hi[1])*.5, eye_z],
                {'goblin':21,'ogre':13,'elf':16}[kind],
                {'goblin':11,'ogre':5,'elf':19}[kind], ear_color)
        if kind == 'ogre':
            for side in (-1,1):tusk(side*10,lo[1]+3,lo[2]+(hi[2]-lo[2])*.22,3.2,12)
        if kind == 'goblin':
            for side in (-1,1):tusk(side*7,lo[1]+3,lo[2]+(hi[2]-lo[2])*.21,1.4,5)
    if extras:
        p=np.vstack([p,extras]);rgb=np.vstack([rgb,shades])
    return p, np.clip(rgb,0,1)


if __name__ == '__main__':
    data = {}
    for key, file, height in MODELS:
        data[key] = convert(SOURCE / (file+'.glb'), height)
        print(key, data[key]['triangles'], 'triangles')
    for key, file, height in VARIANTS:
        data[key] = convert(SOURCE / (file+'.glb'), height, key)
        print(key, data[key]['triangles'], 'triangles (FORMA adaptation)')
    (ROOT/'src/character-model-data.json').write_text(json.dumps(data, separators=(',', ':'))+'\n')
    source = json.loads((SOURCE/'provenance.json').read_text())
    adaptations = {
        'description': 'FORMA fantasy adaptations of complete KayKit character meshes, baked for editing. These four variants are not original named KayKit characters.',
        'sourceAuthor': source['author'], 'sourceLicense': source['license'],
        'sourceRepository': source['repository'], 'sourceRevision': source['revision'],
        'recipe': 'scripts/prepare-character-models.py',
        'recipeSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'models': [{'id': key, 'sourceFile': file+'.glb', 'sourceSha256': data[key]['sourceSha256'],
                    'heightMm': height, 'triangles': data[key]['triangles'],
                    'meshSha256': hashlib.sha256(base64.b64decode(data[key]['positions'])+base64.b64decode(data[key]['colors'])).hexdigest()}
                   for key, file, height in VARIANTS]
    }
    (SOURCE/'adaptations.json').write_text(json.dumps(adaptations, ensure_ascii=False, indent=2)+'\n')
