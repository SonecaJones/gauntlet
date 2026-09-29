"""Low-poly Gauntlet Warrior: rigid parts skinned to a simple armature,
with Idle / Walk / Attack actions, exported as GLB for three.js.

  python warrior3d.py [out.glb] [preview_dir]
"""
import math
import sys
import bpy
import bmesh
from mathutils import Vector

OUT = sys.argv[1] if len(sys.argv) > 1 else 'warrior.glb'
PREVIEW = sys.argv[2] if len(sys.argv) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24

# ------------------------------------------------------------------ materials
def mat(name, rgb, metal=0.0, rough=0.75, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    m.use_backface_culling = not double
    return m

M = {
    'red': mat('Tunic', (0.52, 0.05, 0.06)),
    'cape': mat('Cape', (0.22, 0.02, 0.05), double=True),
    'skin': mat('Skin', (0.86, 0.5, 0.34)),
    'steel': mat('Steel', (0.62, 0.66, 0.74), metal=0.85, rough=0.35),
    'ivory': mat('Horn', (0.9, 0.84, 0.66), rough=0.5),
    'beard': mat('Beard', (0.78, 0.3, 0.05)),
    'leather': mat('Leather', (0.28, 0.13, 0.05)),
    'gold': mat('Gold', (1.0, 0.68, 0.18), metal=1.0, rough=0.3),
    'boot': mat('Boots', (0.1, 0.07, 0.09)),
    'pants': mat('Pants', (0.16, 0.12, 0.2)),
    'wood': mat('Wood', (0.32, 0.18, 0.07)),
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

# ------------------------------------------------------------------ body (character faces -Y, +X is his left)
S = (1, -1)
for s in S:
    x = 0.085 * s
    boot = prim('cube', (x, -0.02, 0.065), (0.1, 0.16, 0.13), 'boot', f'leg_lower_{"L" if s > 0 else "R"}')
    bev = boot.modifiers.new('bev', 'BEVEL'); bev.width = 0.02; bev.segments = 1
    bpy.ops.object.modifier_apply(modifier='bev')
    between((x, 0, 0.12), (x, 0, 0.17), 0.058, 'leather', f'leg_lower_{"L" if s > 0 else "R"}')
    between((x, 0, 0.34), (x, 0, 0.16), 0.055, 'pants', f'leg_upper_{"L" if s > 0 else "R"}')

prim('cone', (0, 0, 0.35), (1, 0.85, 0.16), 'red', 'hips', r1=0.2, r2=0.165, v=8)
prim('cyl', (0, 0, 0.435), (0.172, 0.142, 0.045), 'leather', 'hips', v=10)
prim('cube', (0, -0.148, 0.435), (0.06, 0.02, 0.05), 'gold', 'hips')
torso = prim('cone', (0, 0, 0.54), (1, 0.8, 0.22), 'red', 'chest', r1=0.16, r2=0.19, v=8)
for s in S:
    prim('sphere', (0.2 * s, 0, 0.625), (0.078, 0.078, 0.055), 'steel', 'chest', seg=8, rings=5)

# cape: a bent grid behind the back
bpy.ops.mesh.primitive_grid_add(x_subdivisions=5, y_subdivisions=7, size=1)
cape = bpy.context.object
cape.rotation_euler = (math.radians(90), 0, 0)
cape.scale = (0.36, 0.44, 1)
cape.location = (0, 0.15, 0.4)
finish(cape, 'cape', 'cape')
def bend_cape(bm):
    for v in bm.verts:
        down = max(0.0, 0.62 - v.co.z)
        v.co.y += down * down * 0.55 + (v.co.x ** 2) * 1.6
edit_verts(cape, bend_cape)

# arms
for s in S:
    side = 'L' if s > 0 else 'R'
    between((0.2 * s, 0, 0.6), (0.24 * s, 0, 0.48), 0.05, 'red', f'arm_upper_{side}')
    between((0.24 * s, 0, 0.48), (0.25 * s, -0.01, 0.37), 0.042, 'skin', f'arm_lower_{side}')
    between((0.245 * s, -0.005, 0.44), (0.25 * s, -0.01, 0.385), 0.052, 'leather', f'arm_lower_{side}')
    prim('sphere', (0.25 * s, -0.012, 0.34), (0.048, 0.048, 0.05), 'skin', f'arm_lower_{side}', seg=8, rings=6)

# axe in the left hand (viewer's right). The hand grips the handle near its
# end; in the bind pose the handle points forward-down (H) and the blade edge
# faces N. With the forearm raised (idle/run) the axe is held up in guard, and
# during the chop the blade, not the handle, comes down in front.
HAND = Vector((0.25, -0.012, 0.34))
H = Vector((0, -math.cos(math.radians(35)), -math.sin(math.radians(35))))
N = Vector((0, math.sin(math.radians(35)), -math.cos(math.radians(35))))
X = Vector((1, 0, 0))
butt, tip = HAND - H * 0.07, HAND + H * 0.6
between(butt, tip, 0.017, 'wood', 'arm_lower_L', v=6)
prim('sphere', tuple(butt - H * 0.015), (0.024, 0.024, 0.024), 'gold', 'arm_lower_L', seg=6, rings=4)
def slab(outline, material):
    bm = bmesh.new()
    verts = [bm.verts.new(tuple(tip + H * u + N * v - X * 0.013)) for u, v in outline]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=tuple(X * 0.026), verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('axehead'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('axehead', me); scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    finish(o, material, 'arm_lower_L')
# broad crescent blade on the edge side, small spike on the back
slab([(-0.13, -0.02), (0.01, -0.02), (0.04, 0.08), (0.02, 0.17), (-0.05, 0.21), (-0.12, 0.18), (-0.16, 0.09)], 'steel')
slab([(-0.1, 0.0), (-0.07, -0.09), (-0.04, 0.0)], 'steel')

# head
prim('sphere', (0, 0, 0.775), (0.15, 0.14, 0.14), 'skin', 'head', seg=12, rings=8)
for s in S:
    prim('sphere', (0.055 * s, -0.13, 0.772), (0.026, 0.014, 0.03), 'black', 'head', seg=6, rings=4)
    prim('sphere', (0.042 * s, -0.142, 0.72), (0.045, 0.022, 0.018), 'beard', 'head', rot=(0, math.radians(-12 * s), 0), seg=6, rings=4)
prim('sphere', (0, -0.15, 0.745), (0.03, 0.028, 0.032), 'skin', 'head', seg=6, rings=4)
prim('sphere', (0, -0.085, 0.66), (0.115, 0.075, 0.095), 'beard', 'head', seg=10, rings=6)
prim('cone', (0, -0.1, 0.565), (1, 0.7, 0.14), 'beard', 'head', rot=(math.radians(180), 0, 0), r1=0.085, r2=0.0, v=8)
dome = prim('sphere', (0, 0, 0.8), (0.163, 0.155, 0.155), 'steel', 'head', seg=12, rings=8)
edit_verts(dome, lambda bm: bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.795], context='VERTS'))
prim('cyl', (0, 0, 0.8), (0.168, 0.16, 0.035), 'steel', 'head', v=12)
prim('cube', (0, -0.165, 0.765), (0.028, 0.022, 0.085), 'steel', 'head')
prim('sphere', (0, 0, 0.965), (0.022, 0.022, 0.022), 'gold', 'head', seg=6, rings=4)
for s in S:  # horns: tapered bevelled curves
    cu = bpy.data.curves.new('horn', 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(2)
    for bp, co, r in zip(sp.bezier_points, [(0.14 * s, 0, 0.84), (0.29 * s, 0, 0.87), (0.31 * s, 0, 1.04)], [1.0, 0.7, 0.05]):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = r
    cu.bevel_depth = 0.034
    cu.bevel_resolution = 1
    cu.resolution_u = 5
    horn = bpy.data.objects.new('horn', cu)
    scene.collection.objects.link(horn)
    bpy.ops.object.select_all(action='DESELECT')
    horn.select_set(True)
    bpy.context.view_layer.objects.active = horn
    bpy.ops.object.convert(target='MESH')
    finish(bpy.context.object, 'ivory', 'head')

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
body.name = 'Warrior'
bpy.ops.object.shade_flat()

# ------------------------------------------------------------------ armature
arm_data = bpy.data.armatures.new('WarriorRig')
rig = bpy.data.objects.new('WarriorRig', arm_data)
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
bone('cape', (0, 0.15, 0.62), (0, 0.2, 0.3), 'chest')
for s, side in ((1, 'L'), (-1, 'R')):
    bone(f'arm_upper_{side}', (0.2 * s, 0, 0.6), (0.24 * s, 0, 0.48), 'chest')
    bone(f'arm_lower_{side}', (0.24 * s, 0, 0.48), (0.25 * s, 0, 0.34), f'arm_upper_{side}')
    bone(f'leg_upper_{side}', (0.085 * s, 0, 0.34), (0.085 * s, 0, 0.18), 'hips')
    bone(f'leg_lower_{side}', (0.085 * s, 0, 0.18), (0.085 * s, 0, 0.02), f'leg_upper_{side}')
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

def run(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.85 * s
    P['leg_upper_R'].rotation_euler.x = 0.85 * s
    # knee folds while the foot travels forward, straightens for the contact
    P['leg_lower_L'].rotation_euler.x = 0.25 + 1.1 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.25 + 1.1 * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['arm_upper_R'].rotation_euler.x = -0.75 * s
    P['arm_lower_R'].rotation_euler.x = -1.0 - 0.25 * s
    P['arm_upper_L'].rotation_euler.x = 0.3 * s - 0.15
    P['arm_lower_L'].rotation_euler.x = -1.25 - 0.1 * s
    P['arm_upper_L'].rotation_euler.z = 0.12
    P['arm_upper_R'].rotation_euler.z = -0.12
    P['hips'].rotation_euler.y = -0.14 * s
    P['chest'].rotation_euler.x = 0.2
    P['chest'].rotation_euler.y = 0.2 * s
    P['head'].rotation_euler.x = -0.15
    P['head'].rotation_euler.y = -0.12 * s
    P['cape'].rotation_euler.x = 0.55 + 0.12 * math.sin(2 * ph + 1)
    P['root'].location.y = 0.04 * abs(c) - 0.03

def walk(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.5 * s
    P['leg_upper_R'].rotation_euler.x = 0.5 * s
    P['leg_lower_L'].rotation_euler.x = 0.1 + 0.6 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.1 + 0.6 * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['arm_upper_R'].rotation_euler.x = -0.4 * s
    P['arm_lower_R'].rotation_euler.x = -0.35
    P['arm_upper_L'].rotation_euler.x = 0.15 * s
    P['arm_lower_L'].rotation_euler.x = -1.3
    P['hips'].rotation_euler.y = -0.08 * s
    P['chest'].rotation_euler.y = 0.1 * s
    P['cape'].rotation_euler.x = 0.2 + 0.06 * math.sin(2 * ph)
    P['root'].location.y = 0.018 * abs(c) - 0.012

def idle(t, P):
    ph = t * 2 * math.pi
    P['chest'].rotation_euler.x = 0.035 * math.sin(ph * 2)
    P['hips'].rotation_euler.z = 0.035 * math.sin(ph)
    P['chest'].rotation_euler.z = -0.05 * math.sin(ph)
    P['leg_upper_L'].rotation_euler.z = -0.035 * math.sin(ph)
    P['leg_upper_R'].rotation_euler.z = -0.035 * math.sin(ph)
    P['head'].rotation_euler.y = 0.35 * math.sin(ph) * max(0.0, math.sin(ph))
    P['head'].rotation_euler.x = -0.04 * math.sin(ph * 2)
    P['arm_upper_R'].rotation_euler.z = -0.08 - 0.04 * math.sin(ph * 2)
    P['arm_upper_L'].rotation_euler.z = 0.08 + 0.04 * math.sin(ph * 2)
    P['arm_lower_R'].rotation_euler.x = -0.15
    P['arm_lower_L'].rotation_euler.x = -1.35 - 0.05 * math.sin(ph * 2)
    P['cape'].rotation_euler.x = 0.06 + 0.04 * math.sin(ph * 2 + 0.7)
    P['root'].location.y = -0.008 * (1 - math.cos(ph * 2))

def attack(t, P):
    # guard (forearm raised) -> wind-up behind the head -> chop down -> guard
    G_UP, G_EL = 0.0, -1.35
    if t < 0.34:
        k = ease(t / 0.34)
        up, el = G_UP + (-2.8 - G_UP) * k, G_EL + (-0.9 - G_EL) * k
        lean, twist, drop = -0.15 * k, 0.3 * k, 0.0
    elif t < 0.48:
        k = ((t - 0.34) / 0.14) ** 0.6
        up, el = -2.8 + 2.45 * k, -0.9 + 0.75 * k
        lean, twist, drop = -0.15 + 0.45 * k, 0.3 - 0.55 * k, -0.04 * k
    else:
        k = ease((t - 0.48) / 0.52)
        up, el = -0.35 + (G_UP + 0.35) * k, -0.15 + (G_EL + 0.15) * k
        lean, twist, drop = 0.3 * (1 - k), -0.25 * (1 - k), -0.04 * (1 - k)
    P['arm_upper_L'].rotation_euler.x = up
    P['arm_lower_L'].rotation_euler.x = el
    P['chest'].rotation_euler.x = lean
    P['chest'].rotation_euler.y = twist
    P['head'].rotation_euler.x = -lean * 0.5
    P['arm_upper_R'].rotation_euler.x = 0.5 * lean
    P['arm_lower_R'].rotation_euler.x = -0.5
    P['leg_upper_L'].rotation_euler.x = -0.3 * max(0.0, lean)
    P['leg_lower_L'].rotation_euler.x = 0.4 * max(0.0, lean)
    P['leg_upper_R'].rotation_euler.x = 0.25 * max(0.0, lean)
    P['cape'].rotation_euler.x = 0.1 + 0.3 * max(0.0, -twist)
    P['root'].location.y = drop

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
    shot('idle', (0.9, -2.4, 1.3), 'Idle', 13)
    for i, f in enumerate((1, 5, 9, 13)):
        shot(f'run{i}', (2.4, -0.6, 0.9), 'Run', f)
    shot('run_front', (1.2, -2.2, 1.2), 'Run', 5)
    for i, f in enumerate((1, 4, 6, 7, 8, 11)):
        shot(f'attack{i}', (2.6, -0.2, 0.9), 'Attack', f)
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
