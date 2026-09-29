"""Low-poly Gauntlet Valkyrie: same rig as the Warrior (rigid parts on a
simple armature), sword + round shield, exported as GLB for three.js.

  python valkyrie3d.py [out.glb] [preview_dir]
"""
import math
import sys
import bpy
import bmesh
from mathutils import Vector

OUT = sys.argv[1] if len(sys.argv) > 1 else 'valkyrie.glb'
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
    'blue': mat('Tunic', (0.07, 0.16, 0.5)),
    'cape': mat('Cape', (0.04, 0.07, 0.26), double=True),
    'skin': mat('Skin', (0.9, 0.62, 0.48)),
    'steel': mat('Steel', (0.7, 0.74, 0.82), metal=0.85, rough=0.35),
    'hair': mat('Hair', (0.95, 0.7, 0.22), rough=0.6, double=True),
    'wing': mat('Wing', (0.94, 0.94, 0.98), rough=0.55, double=True),
    'leather': mat('Leather', (0.3, 0.16, 0.07)),
    'gold': mat('Gold', (1.0, 0.72, 0.2), metal=1.0, rough=0.3),
    'boot': mat('Boots', (0.2, 0.12, 0.08)),
    'shield': mat('ShieldFace', (0.1, 0.22, 0.62), rough=0.6),
    'black': mat('Eyes', (0.02, 0.02, 0.03), rough=0.2),
    'lips': mat('Lips', (0.72, 0.28, 0.3)),
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

# ------------------------------------------------------------------ body (she faces -Y, +X is her left)
S = (1, -1)
def sd(s): return 'L' if s > 0 else 'R'
for s in S:
    x = 0.075 * s
    boot = prim('cube', (x, -0.018, 0.06), (0.085, 0.15, 0.12), 'boot', f'leg_lower_{sd(s)}')
    bev = boot.modifiers.new('bev', 'BEVEL'); bev.width = 0.02; bev.segments = 1
    bpy.ops.object.modifier_apply(modifier='bev')
    between((x, 0, 0.11), (x, 0, 0.2), 0.05, 'steel', f'leg_lower_{sd(s)}', r2=0.045)
    prim('sphere', (x, -0.035, 0.2), (0.04, 0.03, 0.035), 'gold', f'leg_lower_{sd(s)}', seg=6, rings=4)
    between((x, 0, 0.34), (x, 0, 0.18), 0.05, 'skin', f'leg_upper_{sd(s)}', r2=0.042)

# pleated skirt, belt, breastplate
prim('cone', (0, 0, 0.35), (1, 0.85, 0.2), 'blue', 'hips', r1=0.2, r2=0.14, v=10)
prim('cyl', (0, 0, 0.445), (0.148, 0.122, 0.035), 'leather', 'hips', v=10)
prim('cube', (0, -0.126, 0.445), (0.05, 0.02, 0.045), 'gold', 'hips')
prim('cone', (0, 0, 0.54), (1, 0.78, 0.2), 'blue', 'chest', r1=0.135, r2=0.16, v=8)
plate = prim('sphere', (0, -0.035, 0.575), (0.14, 0.1, 0.085), 'steel', 'chest', seg=10, rings=6)
for s in S:
    prim('sphere', (0.165 * s, 0, 0.625), (0.068, 0.068, 0.05), 'steel', 'chest', seg=8, rings=5)
    prim('sphere', (0.165 * s, 0, 0.605), (0.07, 0.07, 0.02), 'gold', 'chest', seg=8, rings=3)

# short cape
bpy.ops.mesh.primitive_grid_add(x_subdivisions=5, y_subdivisions=6, size=1)
cape = bpy.context.object
cape.rotation_euler = (math.radians(90), 0, 0)
cape.scale = (0.3, 0.36, 1)
cape.location = (0, 0.13, 0.44)
finish(cape, 'cape', 'cape')
def bend_cape(bm):
    for v in bm.verts:
        down = max(0.0, 0.62 - v.co.z)
        v.co.y += down * down * 0.5 + (v.co.x ** 2) * 1.6
edit_verts(cape, bend_cape)

# arms: bare upper arm, steel bracers
for s in S:
    side = sd(s)
    between((0.17 * s, 0, 0.6), (0.21 * s, 0, 0.48), 0.042, 'skin', f'arm_upper_{side}')
    between((0.21 * s, 0, 0.48), (0.22 * s, -0.01, 0.37), 0.036, 'skin', f'arm_lower_{side}')
    between((0.215 * s, -0.005, 0.45), (0.22 * s, -0.01, 0.38), 0.046, 'steel', f'arm_lower_{side}', r2=0.04)
    prim('sphere', (0.22 * s, -0.012, 0.345), (0.04, 0.04, 0.042), 'skin', f'arm_lower_{side}', seg=8, rings=6)

# sword in the right hand. Like the axe: in the bind pose it points forward-down
# (H), edge plane spanned by H and N, so a raised forearm holds it up in guard.
HAND = Vector((-0.22, -0.012, 0.345))
H = Vector((0, -math.cos(math.radians(35)), -math.sin(math.radians(35))))
N = Vector((0, math.sin(math.radians(35)), -math.cos(math.radians(35))))
X = Vector((1, 0, 0))
between(HAND - H * 0.06, HAND + H * 0.05, 0.016, 'leather', 'arm_lower_R', v=6)
prim('sphere', tuple(HAND - H * 0.075), (0.024,) * 3, 'gold', 'arm_lower_R', seg=6, rings=4)
g0 = HAND + H * 0.055
slab([g0 + N * 0.075 - H * 0.012, g0 + N * 0.075 + H * 0.012, g0 - N * 0.075 + H * 0.012, g0 - N * 0.075 - H * 0.012], 'gold', 'arm_lower_R', thick=0.03)
b0 = HAND + H * 0.07
slab([b0 + N * 0.03, b0 + H * 0.46 + N * 0.026, b0 + H * 0.54, b0 + H * 0.46 - N * 0.026, b0 - N * 0.03], 'steel', 'arm_lower_R', thick=0.012)

# round shield strapped to the left forearm, face pointing out (+X)
SC = Vector((0.275, -0.01, 0.415))
prim('cyl', tuple(SC), (0.15, 0.15, 0.022), 'steel', 'arm_lower_L', rot=(0, math.radians(90), 0), v=14)
prim('cyl', tuple(SC + X * 0.006), (0.13, 0.13, 0.022), 'shield', 'arm_lower_L', rot=(0, math.radians(90), 0), v=14)
prim('sphere', tuple(SC + X * 0.02), (0.022, 0.04, 0.04), 'gold', 'arm_lower_L', seg=8, rings=5)
for ang in (0, 90):  # gold cross on the face
    a = math.radians(ang)
    d = Vector((0, math.cos(a), math.sin(a)))
    slab([SC + X * 0.018 + d * 0.12 + Vector((0, -d.z, d.y)) * 0.014,
          SC + X * 0.018 + d * 0.12 - Vector((0, -d.z, d.y)) * 0.014,
          SC + X * 0.018 - d * 0.12 - Vector((0, -d.z, d.y)) * 0.014,
          SC + X * 0.018 - d * 0.12 + Vector((0, -d.z, d.y)) * 0.014], 'gold', 'arm_lower_L', thick=0.008)

# head: face, long blond hair, winged helmet
prim('sphere', (0, 0, 0.77), (0.125, 0.12, 0.13), 'skin', 'head', seg=12, rings=8)
for s in S:
    prim('sphere', (0.045 * s, -0.112, 0.775), (0.022, 0.012, 0.026), 'black', 'head', seg=6, rings=4)
prim('sphere', (0, -0.125, 0.745), (0.018, 0.02, 0.022), 'skin', 'head', seg=6, rings=4)
prim('sphere', (0, -0.112, 0.71), (0.028, 0.01, 0.009), 'lips', 'head', seg=6, rings=3)
hair = prim('sphere', (0, 0.022, 0.785), (0.14, 0.135, 0.14), 'hair', 'head', seg=12, rings=8)
edit_verts(hair, lambda bm: bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.06 and v.co.z < 0.83], context='VERTS'))
for s in S:  # locks framing the face
    between((0.105 * s, -0.06, 0.8), (0.115 * s, -0.04, 0.6), 0.03, 'hair', 'head', v=6, r2=0.012)
# thick braid down the back, on the cape bone so it sways
nape, mid, tip = Vector((0, 0.125, 0.68)), Vector((0, 0.16, 0.52)), Vector((0, 0.19, 0.36))
between(nape, mid, 0.06, 'hair', 'cape', v=8, r2=0.05)
between(mid, tip, 0.05, 'hair', 'cape', v=8, r2=0.022)
for k, r in ((0.3, 0.062), (0.65, 0.055)):
    prim('sphere', tuple(nape + (mid - nape) * k), (r, r, 0.03), 'hair', 'cape', seg=8, rings=4)
prim('cyl', tuple(mid + (tip - mid) * 0.75), (0.034, 0.034, 0.025), 'gold', 'cape', v=8)
dome = prim('sphere', (0, 0, 0.8), (0.142, 0.138, 0.14), 'steel', 'head', seg=12, rings=8)
edit_verts(dome, lambda bm: bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.81], context='VERTS'))
prim('cyl', (0, 0, 0.815), (0.146, 0.142, 0.025), 'gold', 'head', v=12)
prim('cube', (0, -0.14, 0.8), (0.022, 0.016, 0.06), 'steel', 'head')
prim('sphere', (0, -0.14, 0.845), (0.02, 0.012, 0.02), 'gold', 'head', seg=6, rings=4)
for s in S:  # white wings swept up and back
    base = Vector((0.14 * s, 0.01, 0.83))
    wing = [(-0.02, 0.0), (0.03, -0.03), (0.1, 0.02), (0.17, 0.1), (0.21, 0.2), (0.14, 0.13),
            (0.15, 0.2), (0.09, 0.11), (0.08, 0.16), (0.03, 0.07)]
    pts = [base + Vector((s * (0.01 + 0.45 * v), u, v)) for u, v in wing]
    slab(pts, 'wing', 'head', thick=0.018)

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
body.name = 'Valkyrie'
bpy.ops.object.shade_flat()

# ------------------------------------------------------------------ armature (same bone names as the Warrior)
arm_data = bpy.data.armatures.new('ValkyrieRig')
rig = bpy.data.objects.new('ValkyrieRig', arm_data)
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


# Shield guard: forearm bent forward, upper arm twisted in so the shield
# covers the front of the body. Sword guard: forearm raised, blade up-forward.
SH_UP, SH_TW, SH_EL = -0.35, 1.1, -1.45
SW_UP, SW_EL = -0.1, -1.5

def shield_guard(P, bob=0.0):
    P['arm_upper_L'].rotation_euler = (SH_UP + bob, SH_TW, 0)
    P['arm_lower_L'].rotation_euler.x = SH_EL

def run(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.85 * s
    P['leg_upper_R'].rotation_euler.x = 0.85 * s
    P['leg_lower_L'].rotation_euler.x = 0.25 + 1.1 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.25 + 1.1 * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['arm_upper_R'].rotation_euler.x = -0.55 * s
    P['arm_lower_R'].rotation_euler.x = -1.0 - 0.2 * s
    shield_guard(P, 0.08 * s)
    P['hips'].rotation_euler.y = -0.14 * s
    P['chest'].rotation_euler.x = 0.2
    P['chest'].rotation_euler.y = 0.18 * s
    P['head'].rotation_euler.x = -0.15
    P['head'].rotation_euler.y = -0.12 * s
    P['cape'].rotation_euler.x = 0.35 + 0.1 * math.sin(2 * ph + 1)
    P['root'].location.y = 0.04 * abs(c) - 0.03

def walk(t, P):
    ph = t * 2 * math.pi
    s, c = math.sin(ph), math.cos(ph)
    P['leg_upper_L'].rotation_euler.x = -0.5 * s
    P['leg_upper_R'].rotation_euler.x = 0.5 * s
    P['leg_lower_L'].rotation_euler.x = 0.1 + 0.6 * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.1 + 0.6 * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['arm_upper_R'].rotation_euler.x = -0.3 * s
    P['arm_lower_R'].rotation_euler.x = SW_EL + 0.1 * s
    shield_guard(P, 0.05 * s)
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
    shield_guard(P, 0.03 * math.sin(ph * 2))
    P['arm_upper_R'].rotation_euler.z = 0.08 + 0.03 * math.sin(ph * 2)
    P['arm_lower_R'].rotation_euler.x = SW_EL - 0.05 * math.sin(ph * 2)
    P['cape'].rotation_euler.x = 0.06 + 0.04 * math.sin(ph * 2 + 0.7)
    P['root'].location.y = -0.008 * (1 - math.cos(ph * 2))

def attack(t, P):
    # sword guard -> wind-up high over the right shoulder -> diagonal slash
    # down and across to her left -> guard. The shield stays up.
    keys = [  # t, upper x, upper z, elbow, chest twist, lean
        (0.0, SW_UP, 0.0, SW_EL, 0.0, 0.0),
        (0.34, -2.5, 0.9, -1.5, -0.55, -0.1),
        (0.5, -1.2, -0.75, -0.25, 0.6, 0.25),
        (1.0, SW_UP, 0.0, SW_EL, 0.0, 0.0),
    ]
    for (t0, *a), (t1, *b) in zip(keys, keys[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            k = k ** 0.6 if t0 == 0.34 else ease(k)
            up, side, el, twist, lean = [x + (y - x) * k for x, y in zip(a, b)]
            break
    P['arm_upper_R'].rotation_euler = (up, 0, side)
    P['arm_lower_R'].rotation_euler.x = el
    shield_guard(P)
    P['chest'].rotation_euler.x = lean
    P['chest'].rotation_euler.y = twist
    P['head'].rotation_euler.y = -twist * 0.5
    P['hips'].rotation_euler.y = twist * 0.3
    P['leg_upper_R'].rotation_euler.x = -0.3 * max(0.0, lean)
    P['leg_lower_R'].rotation_euler.x = 0.4 * max(0.0, lean)
    P['leg_upper_L'].rotation_euler.x = 0.25 * max(0.0, lean)
    P['cape'].rotation_euler.x = 0.1 + 0.3 * abs(twist)
    P['root'].location.y = -0.04 * max(0.0, lean) / 0.25

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
        shot(f'attack{i}', (0.6, -2.4, 2.2), 'Attack', f)
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
