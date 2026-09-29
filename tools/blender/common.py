"""Shared helpers for the procedural Blender models: materials, rigid parts
bound to one bone each, a simple armature, baked actions, previews and GLB
export. Used by enemies3d.py (the hero scripts are self-contained)."""
import math
import bpy
import bmesh
from mathutils import Vector

scene = None
PARTS = []  # (object, bone or callable(vertex_co) -> bone)
M = {}


def reset():
    global scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    PARTS.clear()
    M.clear()


def mat(name, rgb, metal=0.0, rough=0.75, double=False, glow=None, glow_strength=3.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if glow:
        b.inputs['Emission Color'].default_value = (*glow, 1)
        b.inputs['Emission Strength'].default_value = glow_strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = not double
    M[name] = m
    return m


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
    elif kind == 'ico':
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=kw.get('sub', 1), radius=1)
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


def each_vert(o, fn):
    """fn(co) mutates a vertex position in place."""
    edit_verts(o, lambda bm: [fn(v.co) for v in bm.verts])


def slab(points, material, bone, thick=0.02, axis=Vector((1, 0, 0))):
    """Flat polygon (world-space points) extruded along `axis` by `thick`."""
    bm = bmesh.new()
    verts = [bm.verts.new(tuple(Vector(p) - axis * thick / 2)) for p in points]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=tuple(axis * thick), verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new('slab')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('slab', me)
    scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    return finish(o, material, bone)


def tube(rings, material, bone, v=10, cap_top=True):
    """Lofted tube through rings [(z, rx, ry, yoff, jag)], bottom edge jagged
    by `jag` (tattered cloth hems). Returns the object."""
    bm = bmesh.new()
    loops = []
    for z, rx, ry, yoff, jag in rings:
        loop = []
        for i in range(v):
            a = i / v * math.tau
            zz = z + (jag * (1 if i % 2 else -1) if jag else 0)
            loop.append(bm.verts.new((math.cos(a) * rx, math.sin(a) * ry + yoff, zz)))
        loops.append(loop)
    for l0, l1 in zip(loops, loops[1:]):
        for i in range(v):
            bm.faces.new((l0[i], l0[(i + 1) % v], l1[(i + 1) % v], l1[i]))
    if cap_top:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tube')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('tube', me)
    scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    return finish(o, material, bone)


def curve_tube(points, radii, bevel, material, bone, res=5):
    """Tapered tube along a smooth Bezier through `points` (horns, tails)."""
    cu = bpy.data.curves.new('curve', 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, co, r in zip(sp.bezier_points, points, radii):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = r
    cu.bevel_depth = bevel
    cu.bevel_resolution = 1
    cu.resolution_u = res
    o = bpy.data.objects.new('curve', cu)
    scene.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object, material, bone)


# ------------------------------------------------------------------ rig
def humanoid_bones(arm_x=0.17, elbow_x=0.21, hand=(0.22, 0.345), leg_x=0.07, hip_z=0.34, knee_z=0.18,
                   chest_z=0.45, neck_z=0.65, head_top=0.98, shoulder_z=0.6, elbow_z=0.48):
    b = [('root', (0, 0, 0), (0, 0, 0.1), None),
         ('hips', (0, 0, hip_z), (0, 0, chest_z), 'root'),
         ('chest', (0, 0, chest_z), (0, 0, neck_z), 'hips'),
         ('head', (0, 0, neck_z), (0, 0, head_top), 'chest'),
         ('cape', (0, 0.13, neck_z - 0.01), (0, 0.2, 0.3), 'chest')]
    for s, side in ((1, 'L'), (-1, 'R')):
        b += [(f'arm_upper_{side}', (arm_x * s, 0, shoulder_z), (elbow_x * s, 0, elbow_z), 'chest'),
              (f'arm_lower_{side}', (elbow_x * s, 0, elbow_z), (hand[0] * s, 0, hand[1]), f'arm_upper_{side}'),
              (f'leg_upper_{side}', (leg_x * s, 0, hip_z), (leg_x * s, 0, knee_z), 'hips'),
              (f'leg_lower_{side}', (leg_x * s, 0, knee_z), (leg_x * s, 0, 0.02), f'leg_upper_{side}')]
    return b


def build(name, bones):
    """Join all parts into one mesh (one vertex group per part) and skin it
    to an armature built from `bones` [(name, head, tail, parent)]."""
    for o, bone in PARTS:
        if callable(bone):
            groups = {}
            for v in o.data.vertices:
                bn = bone(v.co)
                if bn not in groups:
                    groups[bn] = o.vertex_groups.new(name=bn)
                groups[bn].add([v.index], 1.0, 'REPLACE')
        else:
            o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for o, _ in PARTS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0][0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = name
    bpy.ops.object.shade_flat()
    if not bones:
        return body, None
    arm_data = bpy.data.armatures.new(name + 'Rig')
    rig = bpy.data.objects.new(name + 'Rig', arm_data)
    scene.collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    for bname, head, tail, parent in bones:
        b = eb.new(bname)
        b.head, b.tail, b.roll = head, tail, 0
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    body.parent = rig
    body.modifiers.new('rig', 'ARMATURE').object = rig
    rig.animation_data_create()
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
    return body, rig


def make_action(rig, name, frames, pose_fn):
    """Bake pose_fn(t, pose_bones) at every frame into an NLA track."""
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
            for path in ('rotation_euler', 'location', 'scale'):
                pb.keyframe_insert(path, frame=f + 1)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    rig.animation_data.action = None
    return act


def ease(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


def keyed(t, keys, shape=None):
    """Interpolate a list of (t, v0, v1, ...) keyframes with smoothstep."""
    for (t0, *a), (t1, *b) in zip(keys, keys[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0) if t1 > t0 else 1.0
            k = shape(t0, k) if shape else ease(k)
            return [x + (y - x) * k for x, y in zip(a, b)]
    return list(keys[-1][1:])


# ------------------------------------------------------------------ previews and export
def render_previews(folder, rig, shots, target_z=0.5):
    """shots: [(name, camera_location, action or None, frame)]"""
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 260, 300
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.02, 0.05, 1)
    bpy.ops.object.light_add(type='SUN', location=(1, -2, 3))
    sun = bpy.context.object
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(45), math.radians(20), math.radians(-30))
    bpy.ops.object.light_add(type='POINT', location=(-1.2, -1.0, 1.2))
    bpy.context.object.data.energy = 60
    bpy.context.object.data.color = (1.0, 0.6, 0.3)
    bpy.ops.object.light_add(type='POINT', location=(0.5, 1.5, 1.5))
    bpy.context.object.data.energy = 80
    bpy.context.object.data.color = (0.6, 0.6, 1.0)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    scene.camera = cam
    cam.data.lens = 60
    for name, loc, action, frame in shots:
        cam.location = loc
        cam.rotation_mode = 'QUATERNION'
        cam.rotation_quaternion = (Vector((0, 0, target_z)) - Vector(loc)).to_track_quat('-Z', 'Y')
        if rig:
            rig.animation_data.action = bpy.data.actions[action] if action else None
        scene.frame_set(frame)
        scene.render.filepath = f'{folder}/{name}.png'
        bpy.ops.render.render(write_still=True)
    if rig:
        rig.animation_data.action = None


def export(path, body, rig):
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    if rig:
        rig.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animations=bool(rig), export_animation_mode='NLA_TRACKS',
        export_skins=bool(rig), export_apply=True, export_yup=True,
    )
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    acts = [a.name for a in bpy.data.actions]
    print(f'EXPORTED {path} triangles~{tris} bones={len(rig.data.bones) if rig else 0} actions={acts}')
