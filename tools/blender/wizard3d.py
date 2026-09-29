"""Low-poly Gauntlet Wizard: same rig as the Warrior (rigid parts on a
simple armature), long robe, pointed hat and a staff with a glowing orb.

  python wizard3d.py [out.glb] [preview_dir]
"""
import math
import sys
import bpy
import bmesh
from mathutils import Vector

OUT = sys.argv[1] if len(sys.argv) > 1 else 'wizard.glb'
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

M = {
    'robe': mat('Robe', (0.34, 0.09, 0.55)),
    'robe_dk': mat('RobeDark', (0.15, 0.04, 0.26)),
    'cape': mat('Cape', (0.12, 0.03, 0.2), double=True),
    'skin': mat('Skin', (0.86, 0.6, 0.46)),
    'beard': mat('Beard', (0.9, 0.9, 0.94), rough=0.8),
    'gold': mat('Gold', (1.0, 0.72, 0.2), metal=1.0, rough=0.3),
    'wood': mat('Wood', (0.3, 0.17, 0.08)),
    'boot': mat('Boots', (0.22, 0.12, 0.07)),
    'black': mat('Eyes', (0.02, 0.02, 0.03), rough=0.2),
    'orb': mat('Orb', (0.55, 0.85, 1.0), rough=0.2, glow=(0.35, 0.8, 1.0)),
    'star': mat('Star', (1.0, 0.85, 0.3), rough=0.4, glow=(1.0, 0.7, 0.2)),
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

def star(center, r, material, bone, normal_axis='Y'):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        off = (math.cos(a) * rr, 0, math.sin(a) * rr) if normal_axis == 'Y' else (0, math.cos(a) * rr, math.sin(a) * rr)
        pts.append(Vector(center) + Vector(off))
    return slab(pts, material, bone, thick=0.008, axis=Vector((0, 1, 0)) if normal_axis == 'Y' else Vector((1, 0, 0)))

# ------------------------------------------------------------------ body (he faces -Y, +X is his left)
S = (1, -1)
def sd(s): return 'L' if s > 0 else 'R'
for s in S:
    x = 0.07 * s
    boot = prim('cube', (x, -0.03, 0.05), (0.08, 0.15, 0.1), 'boot', f'leg_lower_{sd(s)}')
    bev = boot.modifiers.new('bev', 'BEVEL'); bev.width = 0.02; bev.segments = 1
    bpy.ops.object.modifier_apply(modifier='bev')
    prim('cone', (x, -0.1, 0.075), (0.03, 0.05, 0.05), 'boot', f'leg_lower_{sd(s)}', rot=(math.radians(-70), 0, 0), r1=1, r2=0, v=6)
    between((x, 0, 0.1), (x, 0, 0.2), 0.05, 'robe_dk', f'leg_lower_{sd(s)}')
    # the robe's skirt is split per leg so it parts naturally when he walks
    between((x * 0.8, 0, 0.36), (x * 1.25, 0, 0.1), 0.095, 'robe', f'leg_upper_{sd(s)}', v=8, r2=0.125)
    between((x * 1.25, 0, 0.1), (x * 1.26, 0, 0.085), 0.127, 'gold', f'leg_upper_{sd(s)}', v=8)

prim('cone', (0, 0, 0.38), (1, 0.85, 0.14), 'robe', 'hips', r1=0.19, r2=0.14, v=10)
prim('cyl', (0, 0, 0.445), (0.145, 0.12, 0.03), 'gold', 'hips', v=10)
prim('sphere', (0.1, -0.1, 0.4), (0.04, 0.03, 0.05), 'robe_dk', 'hips', seg=6, rings=4)  # pouch
prim('cone', (0, 0, 0.54), (1, 0.8, 0.2), 'robe', 'chest', r1=0.13, r2=0.155, v=8)
prim('cube', (0, -0.115, 0.55), (0.04, 0.02, 0.17), 'gold', 'chest')  # robe trim
for s in S:
    prim('sphere', (0.155 * s, 0, 0.615), (0.065, 0.065, 0.05), 'robe', 'chest', seg=8, rings=5)
star((0.07, -0.13, 0.57), 0.028, 'star', 'chest')

# long cape with a high collar
bpy.ops.mesh.primitive_grid_add(x_subdivisions=5, y_subdivisions=7, size=1)
cape = bpy.context.object
cape.rotation_euler = (math.radians(90), 0, 0)
cape.scale = (0.32, 0.5, 1)
cape.location = (0, 0.13, 0.37)
finish(cape, 'cape', 'cape')
def bend_cape(bm):
    for v in bm.verts:
        down = max(0.0, 0.62 - v.co.z)
        v.co.y += down * down * 0.45 + (v.co.x ** 2) * 1.5
edit_verts(cape, bend_cape)
prim('cone', (0, 0.03, 0.665), (1, 0.9, 0.07), 'robe_dk', 'chest', r1=0.13, r2=0.16, v=10)

# arms with wide bell sleeves
for s in S:
    side = sd(s)
    between((0.17 * s, 0, 0.6), (0.21 * s, 0, 0.48), 0.045, 'robe', f'arm_upper_{side}')
    between((0.21 * s, 0, 0.49), (0.225 * s, -0.01, 0.37), 0.045, 'robe', f'arm_lower_{side}', r2=0.075)
    between((0.225 * s, -0.01, 0.375), (0.226 * s, -0.01, 0.36), 0.078, 'gold', f'arm_lower_{side}')
    prim('sphere', (0.22 * s, -0.012, 0.335), (0.038, 0.038, 0.04), 'skin', f'arm_lower_{side}', seg=8, rings=6)

# staff in the right hand. In the bind pose it leans forward by STAFF_TILT so
# that with the forearm bent (idle) it stands upright beside him.
STAFF_TILT = 1.1
HAND = Vector((-0.22, -0.012, 0.335))
D = Vector((0, -math.sin(STAFF_TILT), math.cos(STAFF_TILT)))
top, bottom = HAND + D * 0.5, HAND - D * 0.36
between(bottom, top, 0.016, 'wood', 'arm_lower_R', v=6, r2=0.02)
for k in (0.06, -0.06):
    between(HAND + D * (k - 0.012), HAND + D * (k + 0.012), 0.024, 'gold', 'arm_lower_R', v=6)
Q = D.cross(Vector((1, 0, 0))).normalized()
for i in range(4):  # gold claws holding the orb
    a = i * math.pi / 2 + math.pi / 4
    side_v = Q * math.cos(a) + Vector((1, 0, 0)) * math.sin(a)
    between(top - D * 0.01, top + D * 0.055 + side_v * 0.05, 0.009, 'gold', 'arm_lower_R', v=4)
prim('sphere', tuple(top + D * 0.07), (0.05, 0.05, 0.05), 'orb', 'arm_lower_R', seg=10, rings=7)

# head: face, bushy brows, long white beard, pointed hat with stars
prim('sphere', (0, 0, 0.77), (0.12, 0.115, 0.125), 'skin', 'head', seg=12, rings=8)
for s in S:
    prim('sphere', (0.042 * s, -0.108, 0.785), (0.02, 0.011, 0.022), 'black', 'head', seg=6, rings=4)
    prim('cube', (0.045 * s, -0.112, 0.815), (0.05, 0.02, 0.018), 'beard', 'head', rot=(0, math.radians(14 * s), 0))
    between((0.05 * s, -0.09, 0.745), (0.07 * s, -0.1, 0.7), 0.028, 'beard', 'head', v=6)  # moustache
prim('cone', (0, -0.13, 0.755), (0.022, 0.03, 0.035), 'skin', 'head', rot=(math.radians(-80), 0, 0), r1=1, r2=0.3, v=6)
prim('sphere', (0, -0.075, 0.69), (0.1, 0.07, 0.07), 'beard', 'head', seg=10, rings=6)
beard = prim('cone', (0, -0.1, 0.56), (1, 0.6, 0.2), 'beard', 'head', rot=(math.radians(180), 0, 0), r1=0.085, r2=0.0, v=8)
edit_verts(beard, lambda bm: [setattr(v.co, 'y', v.co.y + (0.66 - v.co.z) ** 2 * -0.5) for v in bm.verts])
prim('sphere', (0, 0.03, 0.75), (0.125, 0.12, 0.12), 'beard', 'head', seg=10, rings=6)  # hair at the back
prim('cyl', (0, 0, 0.84), (0.23, 0.22, 0.02), 'robe', 'head', v=14)  # brim
prim('cyl', (0, 0, 0.862), (0.135, 0.13, 0.025), 'gold', 'head', v=12)
hat = prim('cone', (0, 0, 1.02), (0.14, 0.14, 0.34), 'robe', 'head', r1=1, r2=0.05, v=10)
def droop(bm):
    for v in bm.verts:
        h = max(0.0, v.co.z - 0.9)
        v.co.y += h * h * 2.2
        v.co.z -= h * h * 0.6
edit_verts(hat, droop)
star((0.0, -0.104, 0.94), 0.028, 'star', 'head')
star((-0.075, -0.07, 0.915), 0.016, 'star', 'head')

# ------------------------------------------------------------------ join into one mesh with rigid vertex groups
for o, bone in PARTS:
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
for o, _ in PARTS:
    o.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0][0]
bpy.ops.object.join()
body = bpy.context.object
body.name = 'Wizard'
bpy.ops.object.shade_flat()

# ------------------------------------------------------------------ armature (same bone names as the Warrior)
arm_data = bpy.data.armatures.new('WizardRig')
rig = bpy.data.objects.new('WizardRig', arm_data)
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
bone('cape', (0, 0.13, 0.64), (0, 0.2, 0.3), 'chest')
for s, side in ((1, 'L'), (-1, 'R')):
    bone(f'arm_upper_{side}', (0.17 * s, 0, 0.6), (0.21 * s, 0, 0.48), 'chest')
    bone(f'arm_lower_{side}', (0.21 * s, 0, 0.48), (0.22 * s, 0, 0.345), f'arm_upper_{side}')
    bone(f'leg_upper_{side}', (0.075 * s, 0, 0.34), (0.075 * s, 0, 0.18), 'hips')
    bone(f'leg_lower_{side}', (0.075 * s, 0, 0.18), (0.075 * s, 0, 0.02), f'leg_upper_{side}')
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
        pose_fn(t, rig.pose.bones)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_euler', frame=f + 1)
            pb.keyframe_insert('location', frame=f + 1)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    rig.animation_data.action = None
    return act

# Bone axes (roll 0): for legs/arms pointing down, +X rotation swings the limb
# backwards; for the spine, +X leans forward; Y is the twist around the bone.
def ease(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)



# The staff stands upright when arm_upper_R.x + arm_lower_R.x == -STAFF_TILT.
ST_UP, ST_EL = 0.0, -STAFF_TILT

def run(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.75 * s
    P['leg_upper_R'].rotation_euler.x = 0.75 * s
    P['leg_lower_L'].rotation_euler.x = 0.25 + 1.0 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.25 + 1.0 * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['arm_upper_R'].rotation_euler.x = -0.35 * s
    P['arm_lower_R'].rotation_euler.x = ST_EL + 0.25 - 0.15 * s  # staff leans forward a bit
    P['arm_upper_L'].rotation_euler.x = 0.7 * s
    P['arm_lower_L'].rotation_euler.x = -0.9 + 0.2 * s
    P['arm_upper_L'].rotation_euler.z = 0.1
    P['hips'].rotation_euler.y = -0.12 * s
    P['chest'].rotation_euler.x = 0.22
    P['chest'].rotation_euler.y = 0.16 * s
    P['head'].rotation_euler.x = -0.15
    P['head'].rotation_euler.y = -0.1 * s
    P['cape'].rotation_euler.x = 0.45 + 0.1 * math.sin(2 * ph + 1)
    P['root'].location.y = 0.035 * abs(c) - 0.03

def walk(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.45 * s
    P['leg_upper_R'].rotation_euler.x = 0.45 * s
    P['leg_lower_L'].rotation_euler.x = 0.1 + 0.55 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.1 + 0.55 * max(0.0, math.sin(ph + 1.9 + math.pi))
    # walking-stick rhythm: the staff swings forward with the left leg
    P['arm_upper_R'].rotation_euler.x = -0.25 * s
    P['arm_lower_R'].rotation_euler.x = ST_EL + 0.1 * s
    P['arm_upper_L'].rotation_euler.x = 0.35 * s
    P['arm_lower_L'].rotation_euler.x = -0.4
    P['hips'].rotation_euler.y = -0.08 * s
    P['chest'].rotation_euler.x = 0.08
    P['chest'].rotation_euler.y = 0.1 * s
    P['cape'].rotation_euler.x = 0.18 + 0.06 * math.sin(2 * ph)
    P['root'].location.y = 0.016 * abs(c) - 0.012

def idle(t, P):
    ph = t * 2 * math.pi
    P['chest'].rotation_euler.x = 0.06 + 0.035 * math.sin(ph * 2)  # a slight stoop
    P['hips'].rotation_euler.z = 0.03 * math.sin(ph)
    P['chest'].rotation_euler.z = -0.04 * math.sin(ph)
    P['leg_upper_L'].rotation_euler.z = -0.03 * math.sin(ph)
    P['leg_upper_R'].rotation_euler.z = -0.03 * math.sin(ph)
    P['head'].rotation_euler.y = 0.3 * math.sin(ph) * max(0.0, math.sin(ph))
    P['head'].rotation_euler.x = -0.08 - 0.04 * math.sin(ph * 2)
    P['arm_upper_R'].rotation_euler = (ST_UP - 0.1, 0, 0.1)
    P['arm_lower_R'].rotation_euler.x = ST_EL + 0.1
    # left hand stirs the air, as if weaving a spell
    P['arm_upper_L'].rotation_euler = (-0.25 - 0.08 * math.sin(ph * 2), 0.5, 0.08)
    P['arm_lower_L'].rotation_euler.x = -0.9 - 0.2 * math.sin(ph * 2)
    P['cape'].rotation_euler.x = 0.05 + 0.04 * math.sin(ph * 2 + 0.7)
    P['root'].location.y = -0.008 * (1 - math.cos(ph * 2))

def attack(t, P):
    # cast: pull the staff back over the shoulder while the left hand gathers
    # power, then swing the orb up and forward and thrust the left palm out.
    keys = [  # t, R upper x, R elbow, L upper x, L elbow, lean, twist
        (0.0, ST_UP, ST_EL, -0.25, -0.9, 0.05, 0.0),
        (0.36, -0.35, -1.95, 0.35, -1.6, -0.18, 0.3),
        (0.5, -1.55, -0.1, -1.5, -0.05, 0.28, -0.25),
        (0.72, -1.45, -0.15, -1.4, -0.1, 0.24, -0.2),
        (1.0, ST_UP, ST_EL, -0.25, -0.9, 0.05, 0.0),
    ]
    for (t0, *a), (t1, *b) in zip(keys, keys[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            k = k ** 0.6 if t0 == 0.36 else ease(k)
            ru, re, lu, le, lean, twist = [x + (y - x) * k for x, y in zip(a, b)]
            break
    P['arm_upper_R'].rotation_euler.x = ru
    P['arm_lower_R'].rotation_euler.x = re
    P['arm_upper_L'].rotation_euler = (lu, 0.15, 0.05)
    P['arm_lower_L'].rotation_euler.x = le
    P['chest'].rotation_euler.x = lean
    P['chest'].rotation_euler.y = twist
    P['head'].rotation_euler.x = -lean * 0.5
    P['head'].rotation_euler.y = -twist * 0.5
    P['leg_upper_L'].rotation_euler.x = -0.3 * max(0.0, lean)
    P['leg_lower_L'].rotation_euler.x = 0.4 * max(0.0, lean)
    P['leg_upper_R'].rotation_euler.x = 0.25 * max(0.0, lean)
    P['cape'].rotation_euler.x = 0.08 + 0.4 * max(0.0, lean)
    P['root'].location.y = -0.04 * max(0.0, lean) / 0.28

make_action('Idle', 48, idle)
make_action('Walk', 20, walk)
make_action('Run', 16, run)
make_action('Attack', 14, attack)

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
    for i, f in enumerate((1, 4, 6, 7, 8, 11)):
        shot(f'attack{i}', (2.6, -0.9, 1.1), 'Attack', f)
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
