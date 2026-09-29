"""Low-poly Gauntlet Elf: the Warrior rig plus two bow bones (nock, arrow),
green tunic, feathered cap, pointed ears, a bow whose string really draws.

  python elf3d.py [out.glb] [preview_dir]
"""
import math
import sys
import bpy
import bmesh
from mathutils import Vector

OUT = sys.argv[1] if len(sys.argv) > 1 else 'elf.glb'
PREVIEW = sys.argv[2] if len(sys.argv) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24

# ------------------------------------------------------------------ materials
def mat(name, rgb, metal=0.0, rough=0.75, double=False, glow=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    m.use_backface_culling = not double
    if glow:
        b.inputs['Emission Color'].default_value = (*glow, 1)
        b.inputs['Emission Strength'].default_value = 3.0
    return m

from mathutils import Matrix

M = {
    'green': mat('Tunic', (0.1, 0.46, 0.16)),
    'green_dk': mat('TunicDark', (0.04, 0.2, 0.08)),
    'cape': mat('Cloak', (0.05, 0.25, 0.1), double=True),
    'skin': mat('Skin', (0.9, 0.66, 0.5)),
    'hair': mat('Hair', (0.9, 0.7, 0.32), rough=0.6),
    'leather': mat('Leather', (0.36, 0.2, 0.08)),
    'leather_dk': mat('LeatherDark', (0.2, 0.1, 0.05)),
    'gold': mat('Gold', (1.0, 0.72, 0.2), metal=1.0, rough=0.3),
    'wood': mat('BowWood', (0.5, 0.3, 0.12)),
    'string': mat('String', (0.92, 0.9, 0.8)),
    'steel': mat('Steel', (0.7, 0.74, 0.82), metal=0.85, rough=0.35),
    'feather': mat('Feather', (0.85, 0.12, 0.1), double=True),
    'fletch': mat('Fletching', (0.95, 0.95, 0.95), double=True),
    'black': mat('Eyes', (0.02, 0.02, 0.03), rough=0.2),
}

PARTS = []  # (object, bone)

def finish(o, material, bone):
    o.data.materials.append(M[material])
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    PARTS.append((o, bone))
    return o

def prim(kind, loc, scale, material, bone, rot=(0, 0, 0), **kw):
    if kind == 'cyl':
        bpy.ops.mesh.primitive_cylinder_add(vertices=kw.get('v', 8), radius=1, depth=1)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=kw.get('v', 8), radius1=kw.get('r1', 1), radius2=kw.get('r2', 0), depth=1)
    elif kind == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=kw.get('seg', 10), ring_count=kw.get('rings', 7), radius=1)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.location, o.scale, o.rotation_euler = loc, scale, rot
    return finish(o, material, bone)

def between(p0, p1, r, material, bone, v=8, r2=None):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d.length)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r, radius2=r2, depth=d.length)
    o = bpy.context.object
    o.location = (p0 + p1) / 2
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y')
    return finish(o, material, bone)

def edit_verts(o, fn):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    fn(bm)
    bm.to_mesh(o.data)
    bm.free()


def slab(points, material, bone, thick=0.02, axis=Vector((1, 0, 0))):
    """Flat polygon (world-space points) extruded along `axis` by `thick`."""
    bm = bmesh.new()
    verts = [bm.verts.new(tuple(Vector(p) - axis * thick / 2)) for p in points]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=tuple(axis * thick), verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new('slab'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('slab', me); scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    return finish(o, material, bone)

def grid(loc, size, rot, material, bone, sub=(4, 6)):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=sub[0], y_subdivisions=sub[1], size=1)
    o = bpy.context.object
    o.rotation_euler, o.scale, o.location = rot, (*size, 1), loc
    return finish(o, material, bone)

# ------------------------------------------------------------------ body (he faces -Y, +X is his left)
S = (1, -1)
def sd(s): return 'L' if s > 0 else 'R'
for s in S:
    x = 0.07 * s
    boot = prim('cube', (x, -0.02, 0.05), (0.08, 0.15, 0.1), 'leather', f'leg_lower_{sd(s)}')
    bev = boot.modifiers.new('bev', 'BEVEL'); bev.width = 0.02; bev.segments = 1
    bpy.ops.object.modifier_apply(modifier='bev')
    between((x, 0, 0.09), (x, 0, 0.2), 0.046, 'leather', f'leg_lower_{sd(s)}', r2=0.05)
    prim('cone', (x, -0.012, 0.215), (1, 1, 0.04), 'leather_dk', f'leg_lower_{sd(s)}', r1=0.06, r2=0.05, v=8)  # boot cuff
    between((x, 0, 0.34), (x, 0, 0.18), 0.046, 'green_dk', f'leg_upper_{sd(s)}', r2=0.04)

# tunic with a flared skirt, belt, quiver strap
prim('cone', (0, 0, 0.35), (1, 0.85, 0.18), 'green', 'hips', r1=0.18, r2=0.135, v=8)
prim('cyl', (0, 0, 0.44), (0.142, 0.118, 0.03), 'leather', 'hips', v=10)
prim('cube', (0, -0.118, 0.44), (0.04, 0.015, 0.04), 'gold', 'hips')
prim('sphere', (-0.12, -0.05, 0.4), (0.035, 0.03, 0.045), 'leather', 'hips', seg=6, rings=4)  # pouch
prim('cone', (0, 0, 0.54), (1, 0.78, 0.2), 'green', 'chest', r1=0.13, r2=0.15, v=8)
strap = [Vector((0.13, -0.1, 0.64)), Vector((0.1, -0.12, 0.6)), Vector((-0.12, -0.1, 0.45)), Vector((-0.1, -0.08, 0.43))]
slab([strap[0], strap[1], strap[2], strap[3]], 'leather', 'chest', thick=0.012, axis=Vector((0, 1, 0)))
for s in S:
    prim('sphere', (0.155 * s, 0, 0.615), (0.06, 0.06, 0.045), 'green', 'chest', seg=8, rings=5)

# quiver on the back with fletched arrows
q0, q1 = Vector((0.07, 0.13, 0.38)), Vector((-0.06, 0.15, 0.68))
between(q0, q1, 0.045, 'leather', 'chest', v=8)
between(q1 - (q1 - q0).normalized() * 0.02, q1, 0.05, 'leather_dk', 'chest', v=8)
qd = (q1 - q0).normalized()
for i, off in enumerate((Vector((0.015, 0, 0)), Vector((-0.015, 0.01, 0)), Vector((0, -0.015, 0.0)))):
    a0 = q1 + off
    between(a0 - qd * 0.02, a0 + qd * 0.07, 0.005, 'wood', 'chest', v=4)
    f = a0 + qd * 0.07
    side = qd.cross(Vector((0, 1, 0))).normalized()
    slab([f - qd * 0.05, f, f + side * 0.022 - qd * 0.01, f + side * 0.022 - qd * 0.05], 'fletch', 'chest', thick=0.004, axis=Vector((0, 1, 0)))

# short hooded cloak on the cape bone
bpy.ops.mesh.primitive_grid_add(x_subdivisions=5, y_subdivisions=5, size=1)
cape = bpy.context.object
cape.rotation_euler = (math.radians(90), 0, 0)
cape.scale = (0.26, 0.24, 1)
cape.location = (0, 0.12, 0.52)
finish(cape, 'cape', 'cape')
def bend_cape(bm):
    for v in bm.verts:
        down = max(0.0, 0.64 - v.co.z)
        v.co.y += down * down * 0.5 + (v.co.x ** 2) * 1.6 + 0.02
edit_verts(cape, bend_cape)

# arms: green sleeves, leather bracers
for s in S:
    side = sd(s)
    between((0.17 * s, 0, 0.6), (0.21 * s, 0, 0.48), 0.04, 'green', f'arm_upper_{side}')
    between((0.21 * s, 0, 0.48), (0.22 * s, -0.01, 0.37), 0.034, 'skin', f'arm_lower_{side}')
    between((0.213 * s, -0.004, 0.46), (0.22 * s, -0.01, 0.375), 0.042, 'leather', f'arm_lower_{side}', r2=0.038)
    prim('sphere', (0.22 * s, -0.012, 0.345), (0.037, 0.037, 0.04), 'skin', f'arm_lower_{side}', seg=8, rings=6)

# bow in the left hand. BOW_TILT leans it forward in the bind pose so that
# with the arm stretched forward (shooting) it stands upright. D runs along the
# bow, B points from the archer through the grip (where the arrow flies).
BOW_TILT = 1.5
HAND = Vector((0.22, -0.012, 0.345))
D = Vector((0, -math.sin(BOW_TILT), math.cos(BOW_TILT)))
B = Vector((0, -math.cos(BOW_TILT), -math.sin(BOW_TILT)))
LIMB, PULL = 0.34, 0.1
def bow_pt(u):
    return HAND + D * (LIMB * u) - B * (PULL * u * u) + B * 0.018
pts = [bow_pt(u / 5) for u in range(-5, 6)]
for a, b in zip(pts, pts[1:]):
    mid = abs((a - HAND).dot(D)) + abs((b - HAND).dot(D))
    between(a, b, 0.018 if mid < 0.2 else 0.012, 'wood', 'arm_lower_L', v=6)
between(HAND - D * 0.05, HAND + D * 0.05, 0.022, 'leather_dk', 'arm_lower_L', v=6)
TIP_T, TIP_B = pts[-1], pts[0]
NOCK = HAND - B * (PULL - 0.018)   # middle of the string at rest

# the string: two strands whose tip ends ride on the bow and whose middle
# ends ride on the nock bone, so it bends back when the arrow is drawn
STRING_PARTS = []
for tip in (TIP_T, TIP_B):
    o = between(tip, NOCK, 0.004, 'string', 'arm_lower_L', v=4)
    STRING_PARTS.append(o)

# nocked arrow on the arrow bone (hidden by scaling right after the release)
ARROW_LEN = 0.6
a_tail, a_tip = NOCK - B * 0.015, NOCK + B * ARROW_LEN
between(a_tail, a_tip, 0.009, 'wood', 'arrow', v=5)
prim('cone', tuple(a_tip + B * 0.03), (0.022, 0.022, 0.06), 'steel', 'arrow', rot=B.to_track_quat('Z', 'Y').to_euler(), r1=1, r2=0, v=4)
for side in (Vector((1, 0, 0)), -Vector((1, 0, 0)), D, -D):
    f = NOCK + B * 0.02
    slab([f, f + B * 0.08, f + B * 0.06 + side * 0.028, f + side * 0.028], 'feather', 'arrow', thick=0.003,
         axis=side.cross(B).normalized())

# head: face, pointed ears, blond hair, feathered cap
prim('sphere', (0, 0, 0.77), (0.12, 0.115, 0.125), 'skin', 'head', seg=12, rings=8)
for s in S:
    prim('sphere', (0.043 * s, -0.108, 0.775), (0.02, 0.011, 0.026), 'black', 'head', seg=6, rings=4)
    prim('cube', (0.045 * s, -0.112, 0.81), (0.045, 0.012, 0.012), 'hair', 'head', rot=(0, math.radians(-12 * s), 0))
    ear = prim('cone', (0.14 * s, 0.01, 0.8), (0.03, 0.012, 0.09), 'skin', 'head', rot=(0, math.radians(-60 * s), 0), r1=1, r2=0, v=5)
prim('cone', (0, -0.126, 0.75), (0.02, 0.025, 0.03), 'skin', 'head', rot=(math.radians(-80), 0, 0), r1=1, r2=0.3, v=6)
prim('cube', (0, -0.114, 0.715), (0.035, 0.01, 0.008), 'leather_dk', 'head')
hair = prim('sphere', (0, 0.02, 0.775), (0.13, 0.125, 0.13), 'hair', 'head', seg=12, rings=8)
edit_verts(hair, lambda bm: bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.06 and v.co.z < 0.84], context='VERTS'))
for s in S:  # side locks
    between((0.1 * s, -0.05, 0.82), (0.105 * s, -0.04, 0.68), 0.03, 'hair', 'head', v=6, r2=0.015)
# Robin-Hood cap: a squashed cone pointing back, with a brim turned up at the front
cap = prim('cone', (0, 0.07, 0.87), (0.14, 0.14, 0.3), 'green', 'head', rot=(math.radians(-72), 0, 0), r1=1, r2=0.04, v=8)
edit_verts(cap, lambda bm: [setattr(v.co, 'z', v.co.z + max(0.0, v.co.y - 0.05) * 0.35) for v in bm.verts])
prim('cyl', (0, -0.005, 0.86), (0.14, 0.132, 0.02), 'green_dk', 'head', rot=(math.radians(-8), 0, 0), v=10)
fe0 = Vector((0.1, 0.02, 0.88))
slab([fe0, fe0 + Vector((0.02, 0.1, 0.09)), fe0 + Vector((0.03, 0.2, 0.21)), fe0 + Vector((0.0, 0.14, 0.2)), fe0 + Vector((-0.01, 0.05, 0.08))],
     'feather', 'head', thick=0.01)

# ------------------------------------------------------------------ join into one mesh with rigid vertex groups
# (the string strands are split: bow end on the forearm, middle end on the nock)
for o, bone in PARTS:
    if o in STRING_PARTS:
        vg_bow, vg_nock = o.vertex_groups.new(name='arm_lower_L'), o.vertex_groups.new(name='nock')
        for v in o.data.vertices:
            near_nock = (v.co - NOCK).length < (v.co - TIP_T).length and (v.co - NOCK).length < (v.co - TIP_B).length
            (vg_nock if near_nock else vg_bow).add([v.index], 1.0, 'REPLACE')
        continue
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
for o, _ in PARTS:
    o.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0][0]
bpy.ops.object.join()
body = bpy.context.object
body.name = 'Elf'
bpy.ops.object.shade_flat()

# ------------------------------------------------------------------ armature (Warrior bones + nock/arrow)
arm_data = bpy.data.armatures.new('ElfRig')
rig = bpy.data.objects.new('ElfRig', arm_data)
scene.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, head, tail, parent=None):
    b = eb.new(name)
    b.head, b.tail = head, tail
    b.roll = 0
    if parent:
        b.parent = eb[parent]
    return b
bone('root', (0, 0, 0), (0, 0, 0.1))
bone('hips', (0, 0, 0.34), (0, 0, 0.45), 'root')
bone('chest', (0, 0, 0.45), (0, 0, 0.65), 'hips')
bone('head', (0, 0, 0.65), (0, 0, 0.98), 'chest')
bone('cape', (0, 0.12, 0.64), (0, 0.18, 0.36), 'chest')
for s, side in ((1, 'L'), (-1, 'R')):
    bone(f'arm_upper_{side}', (0.17 * s, 0, 0.6), (0.21 * s, 0, 0.48), 'chest')
    bone(f'arm_lower_{side}', (0.21 * s, 0, 0.48), (0.22 * s, 0, 0.345), f'arm_upper_{side}')
    bone(f'leg_upper_{side}', (0.07 * s, 0, 0.34), (0.07 * s, 0, 0.18), 'hips')
    bone(f'leg_lower_{side}', (0.07 * s, 0, 0.18), (0.07 * s, 0, 0.02), f'leg_upper_{side}')
bone('nock', tuple(NOCK), tuple(NOCK - D * 0.05), 'arm_lower_L')
bone('arrow', tuple(NOCK), tuple(NOCK + B * 0.1), 'nock')
bpy.ops.object.mode_set(mode='OBJECT')
body.parent = rig
mod = body.modifiers.new('rig', 'ARMATURE')
mod.object = rig

# ------------------------------------------------------------------ animations
rig.animation_data_create()
for pb in rig.pose.bones:
    pb.rotation_mode = 'XYZ'

def make_action(name, frames, pose_fn):
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    for f in range(frames + 1):
        t = f / frames
        for pb in rig.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        pose_fn(t, rig.pose.bones)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_euler', frame=f + 1)
            pb.keyframe_insert('location', frame=f + 1)
            pb.keyframe_insert('scale', frame=f + 1)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    rig.animation_data.action = None
    return act

def ease(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)

def draw_string(P, w, arrow_scale=1.0):
    """Pull the nock (string middle + arrow) toward the right hand by w and
    aim the arrow from there through the bow grip."""
    bpy.context.view_layer.update()
    nock, arrow = P['nock'], P['arrow']
    rest = nock.matrix.copy()                       # armature space, unposed nock
    hand = P['arm_lower_R'].tail.copy()
    grip = P['arm_lower_L'].tail.copy()
    # never draw past the arrow: keep the nock within reach of the grip
    if (hand - grip).length > ARROW_LEN - 0.12:
        hand = grip + (hand - grip).normalized() * (ARROW_LEN - 0.12)
    target = rest.translation.lerp(hand, w)
    m = rest.copy(); m.translation = target
    nock.matrix = m
    bpy.context.view_layer.update()
    if w > 0.01:
        aim = (grip - target).normalized()
        rest_dir = (arrow.matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
        blend = rest_dir.lerp(aim, w).normalized()
        am = blend.to_track_quat('Y', 'Z').to_matrix().to_4x4()
        am.translation = target
        arrow.matrix = am
        bpy.context.view_layer.update()
    arrow.scale = (arrow_scale,) * 3

# Bow carried low and tilted forward; shooting pose: side-on stance, bow arm
# straight at the target, right hand drawing the string back to the chin.
BASE = dict(hips=0.0, chest=0.0, head=0.0, lux=0.05, luy=0.0, lel=-1.0, rux=0.0, ruy=0.0, ruz=0.05, rel=-0.25)
SHOOT = dict(hips=-0.35, chest=-0.75, head=0.95, lux=-1.5, luy=-1.1, lel=-0.05, rux=-0.6, ruy=0.5, ruz=1.4, rel=-2.3)

def apply_arms(P, p):
    P['hips'].rotation_euler.y = p['hips']
    P['chest'].rotation_euler.y = p['chest']
    P['head'].rotation_euler.y = p['head']
    P['arm_upper_L'].rotation_euler = (p['lux'], p['luy'], 0)
    P['arm_lower_L'].rotation_euler.x = p['lel']
    P['arm_upper_R'].rotation_euler = (p['rux'], p['ruy'], p['ruz'])
    P['arm_lower_R'].rotation_euler.x = p['rel']

def run(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.9 * s
    P['leg_upper_R'].rotation_euler.x = 0.9 * s
    P['leg_lower_L'].rotation_euler.x = 0.25 + 1.15 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.25 + 1.15 * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['arm_upper_R'].rotation_euler.x = -0.8 * s
    P['arm_lower_R'].rotation_euler.x = -0.9 - 0.3 * s
    P['arm_upper_L'].rotation_euler.x = 0.45 * s - 0.1
    P['arm_lower_L'].rotation_euler.x = -0.8 + 0.15 * s
    P['hips'].rotation_euler.y = -0.15 * s
    P['chest'].rotation_euler.x = 0.25
    P['chest'].rotation_euler.y = 0.2 * s
    P['head'].rotation_euler.x = -0.18
    P['head'].rotation_euler.y = -0.12 * s
    P['cape'].rotation_euler.x = 0.55 + 0.12 * math.sin(2 * ph + 1)
    P['root'].location.y = 0.045 * abs(c) - 0.03

    P['arrow'].scale = (0, 0, 0)   # arrow only appears when he shoots

def walk(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.5 * s
    P['leg_upper_R'].rotation_euler.x = 0.5 * s
    P['leg_lower_L'].rotation_euler.x = 0.1 + 0.6 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.1 + 0.6 * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['arm_upper_R'].rotation_euler.x = -0.45 * s
    P['arm_lower_R'].rotation_euler.x = -0.35
    P['arm_upper_L'].rotation_euler.x = 0.25 * s
    P['arm_lower_L'].rotation_euler.x = BASE['lel']
    P['hips'].rotation_euler.y = -0.08 * s
    P['chest'].rotation_euler.y = 0.1 * s
    P['cape'].rotation_euler.x = 0.2 + 0.06 * math.sin(2 * ph)
    P['root'].location.y = 0.018 * abs(c) - 0.012

    P['arrow'].scale = (0, 0, 0)   # arrow only appears when he shoots

def idle(t, P):
    ph = t * 2 * math.pi
    P['chest'].rotation_euler.x = 0.03 * math.sin(ph * 2)
    P['hips'].rotation_euler.z = 0.035 * math.sin(ph)
    P['chest'].rotation_euler.z = -0.05 * math.sin(ph)
    P['leg_upper_L'].rotation_euler.z = -0.035 * math.sin(ph)
    P['leg_upper_R'].rotation_euler.z = -0.035 * math.sin(ph)
    # an elf keeps watch: the head scans left and right
    P['head'].rotation_euler.y = 0.45 * math.sin(ph)
    P['head'].rotation_euler.x = -0.04 * math.sin(ph * 2)
    P['arm_upper_L'].rotation_euler.x = BASE['lux']
    P['arm_lower_L'].rotation_euler.x = BASE['lel'] - 0.05 * math.sin(ph * 2)
    P['arm_upper_R'].rotation_euler.z = BASE['ruz'] + 0.03 * math.sin(ph * 2)
    P['arm_lower_R'].rotation_euler.x = BASE['rel']
    P['cape'].rotation_euler.x = 0.06 + 0.04 * math.sin(ph * 2 + 0.7)
    P['root'].location.y = -0.008 * (1 - math.cos(ph * 2))

    P['arrow'].scale = (0, 0, 0)   # arrow only appears when he shoots

def attack(t, P):
    if t < 0.3:
        k = ease(t / 0.3)
    elif t < 0.55:
        k = 1.0
    else:
        k = 1 - ease((t - 0.55) / 0.45)
    pose = {n: BASE[n] + (SHOOT[n] - BASE[n]) * k for n in BASE}
    if 0.5 <= t < 0.62:   # follow-through: the drawing hand flies back
        pose['ruz'] += 0.25
        pose['rel'] += 0.4
    apply_arms(P, pose)
    P['chest'].rotation_euler.x = -0.05 * k
    P['leg_upper_L'].rotation_euler.x = -0.2 * k
    P['leg_upper_R'].rotation_euler.x = 0.2 * k
    P['cape'].rotation_euler.x = 0.08 + 0.15 * k
    if t < 0.12:
        w = 0.0
    elif t < 0.42:
        w = ease((t - 0.12) / 0.3)
    elif t < 0.5:
        w = 1.0
    else:
        w = 0.0            # released: the string snaps back
    draw_string(P, w, 1.0 if 0.06 <= t < 0.5 else 0.0)

make_action('Idle', 48, idle)
make_action('Walk', 20, walk)
make_action('Run', 16, run)
make_action('Attack', 16, attack)

# ------------------------------------------------------------------ previews
def render_previews(folder):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 260, 300
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w'); scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.02, 0.05, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    bpy.ops.object.light_add(type='SUN', location=(1, -2, 3))
    sun = bpy.context.object; sun.data.energy = 3.5; sun.rotation_euler = (math.radians(45), math.radians(20), math.radians(-30))
    bpy.ops.object.light_add(type='POINT', location=(-1.2, -1.0, 1.2))
    fill = bpy.context.object; fill.data.energy = 60; fill.data.color = (1.0, 0.6, 0.3)
    bpy.ops.object.light_add(type='POINT', location=(0.5, 1.5, 1.5))
    rim = bpy.context.object; rim.data.energy = 80; rim.data.color = (0.6, 0.6, 1.0)
    bpy.ops.object.camera_add()
    cam = bpy.context.object; scene.camera = cam
    cam.data.lens = 60
    def shot(name, loc, action=None, frame=1):
        cam.location = loc
        d = Vector((0, 0, 0.52)) - Vector(loc)
        cam.rotation_mode = 'QUATERNION'
        cam.rotation_quaternion = d.to_track_quat('-Z', 'Y')
        rig.animation_data.action = bpy.data.actions[action] if action else None
        scene.frame_set(frame)
        scene.render.filepath = f'{folder}/{name}.png'
        bpy.ops.render.render(write_still=True)
    shot('bind', (0.9, -2.4, 1.3))
    shot('back', (-0.9, 2.4, 1.3))
    shot('idle', (0.9, -2.4, 1.3), 'Idle', 13)
    for i, f in enumerate((1, 5, 9, 13)):
        shot(f'run{i}', (2.4, -0.6, 0.9), 'Run', f)
    shot('run_front', (1.2, -2.2, 1.2), 'Run', 5)
    for i, f in enumerate((1, 5, 8, 9, 10, 14)):
        shot(f'attack{i}', (0.4, -2.2, 2.4), 'Attack', f)
    for i, f in enumerate((8, 10)):
        shot(f'attack_side{i}', (2.3, -1.6, 1.0), 'Attack', f)
    rig.animation_data.action = None

if PREVIEW:
    render_previews(PREVIEW)

# ------------------------------------------------------------------ export
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS',
    export_skins=True, export_apply=True, export_yup=True,
)
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print(f'EXPORTED {OUT} triangles~{tris} bones={len(rig.data.bones)} actions={[a.name for a in bpy.data.actions]}')
