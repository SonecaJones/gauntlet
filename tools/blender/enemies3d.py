"""Low-poly Gauntlet monsters and generators, built by code like the heroes.

  python enemies3d.py <name|all> <out_dir> [preview_dir]

Monsters: ghost, grunt, demon, lobber, sorcerer, death (Idle / Walk / Attack).
Generators: gen_bones (ghost and death), gen_hut (the others), static.
Every monster faces -Y with +X on its left, like the heroes. Bone axes:
limbs pointing down swing back with +X; the spine leans forward with +X and
turns toward its left with +Y; arms raise sideways with +Z (right) / -Z (left).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import Vector, prim, between, slab, tube, curve_tube, each_vert, mat, ease, keyed  # noqa: E402

S = (1, -1)
def sd(s): return 'L' if s > 0 else 'R'

FRONT, SIDE, HIGH = (0.9, -2.4, 1.3), (2.4, -0.6, 0.9), (0.5, -2.2, 2.3)


def pose(P, **rot):
    """pose(P, arm_upper_R=(x, y, z), chest_x=0.2, ...) - tuples set all
    three axes, name_x / name_y / name_z set one."""
    for k, v in rot.items():
        if isinstance(v, tuple):
            P[k].rotation_euler = v
        else:
            name, axis = k.rsplit('_', 1)
            setattr(P[name].rotation_euler, axis, v)


def walk_legs(P, ph, swing=0.5, knee=0.6, lift=0.02):
    s = math.sin(ph)
    P['leg_upper_L'].rotation_euler.x = -swing * s
    P['leg_upper_R'].rotation_euler.x = swing * s
    P['leg_lower_L'].rotation_euler.x = 0.1 + knee * max(0.0, math.sin(ph + 1.9))
    P['leg_lower_R'].rotation_euler.x = 0.1 + knee * max(0.0, math.sin(ph + 1.9 + math.pi))
    P['root'].location.y = lift * abs(math.cos(ph)) - lift * 0.6


# ======================================================================= GRUNT
def grunt():
    mat('Hide', (0.55, 0.36, 0.18)); mat('Belly', (0.68, 0.5, 0.3)); mat('Leather', (0.2, 0.12, 0.07))
    mat('Tusk', (0.94, 0.9, 0.8), rough=0.5); mat('Eye', (1, 0.2, 0.1), glow=(1, 0.15, 0.05), glow_strength=4)
    mat('Wood', (0.36, 0.22, 0.1)); mat('Iron', (0.35, 0.33, 0.36), metal=0.8, rough=0.45)
    for s in S:
        x = 0.1 * s
        foot = prim('cube', (x, -0.03, 0.05), (0.11, 0.16, 0.09), 'Hide', f'leg_lower_{sd(s)}')
        for k in (-1, 0, 1):
            prim('cone', (x + 0.03 * k, -0.11, 0.04), (0.018, 0.018, 0.03), 'Tusk', f'leg_lower_{sd(s)}', rot=(math.radians(-90), 0, 0), v=4)
        between((x, 0, 0.08), (x, 0, 0.17), 0.06, 'Hide', f'leg_lower_{sd(s)}')
        between((x, 0, 0.3), (x, 0, 0.16), 0.075, 'Hide', f'leg_upper_{sd(s)}', r2=0.065)
    prim('cone', (0, 0, 0.29), (1, 0.85, 0.12), 'Leather', 'hips', r1=0.2, r2=0.18, v=8)
    prim('cyl', (0, 0, 0.37), (0.2, 0.17, 0.035), 'Leather', 'hips', v=10)
    prim('cube', (0, -0.17, 0.37), (0.06, 0.02, 0.05), 'Iron', 'hips')
    prim('sphere', (0, 0, 0.52), (0.22, 0.18, 0.2), 'Hide', 'chest', seg=12, rings=8)
    prim('sphere', (0, -0.07, 0.47), (0.16, 0.12, 0.13), 'Belly', 'chest', seg=10, rings=6)
    prim('sphere', (0.2, 0.0, 0.64), (0.09, 0.09, 0.06), 'Leather', 'chest', seg=8, rings=5)  # shoulder pad
    for k in (-1, 1):
        prim('cone', (0.2 + 0.035 * k, 0.0, 0.7), (0.02, 0.02, 0.05), 'Iron', 'chest', v=4)
    # head sunk between the shoulders: heavy brow, red eyes, underbite tusks
    prim('sphere', (0, -0.08, 0.72), (0.11, 0.1, 0.1), 'Hide', 'head', seg=10, rings=7)
    prim('cube', (0, -0.165, 0.76), (0.16, 0.04, 0.035), 'Hide', 'head', rot=(math.radians(-15), 0, 0))
    prim('sphere', (0, -0.14, 0.66), (0.09, 0.06, 0.05), 'Belly', 'head', seg=8, rings=5)  # jaw
    for s in S:
        prim('sphere', (0.045 * s, -0.18, 0.735), (0.022, 0.012, 0.016), 'Eye', 'head', seg=6, rings=4)
        prim('cone', (0.05 * s, -0.19, 0.69), (0.016, 0.016, 0.05), 'Tusk', 'head', rot=(math.radians(-10), 0, 0), v=5)
        prim('cone', (0.11 * s, -0.06, 0.75), (0.035, 0.015, 0.05), 'Hide', 'head', rot=(0, math.radians(-70 * s), 0), v=4)
    prim('cone', (0, -0.2, 0.71), (0.025, 0.03, 0.03), 'Belly', 'head', rot=(math.radians(-90), 0, 0), r1=1, r2=0.5, v=5)
    for s in S:
        side = sd(s)
        between((0.2 * s, 0, 0.6), (0.25 * s, 0, 0.45), 0.065, 'Hide', f'arm_upper_{side}', r2=0.055)
        between((0.25 * s, 0, 0.45), (0.26 * s, -0.01, 0.32), 0.055, 'Hide', f'arm_lower_{side}', r2=0.05)
        between((0.255 * s, -0.005, 0.42), (0.26 * s, -0.01, 0.34), 0.06, 'Leather', f'arm_lower_{side}')
        prim('sphere', (0.26 * s, -0.012, 0.29), (0.06, 0.06, 0.06), 'Hide', f'arm_lower_{side}', seg=8, rings=6)
    # spiked club in the right hand, pointing forward-down in the bind pose
    hand = Vector((-0.26, -0.012, 0.29))
    H = Vector((0, -math.cos(math.radians(35)), -math.sin(math.radians(35))))
    between(hand - H * 0.06, hand + H * 0.22, 0.025, 'Wood', 'arm_lower_R', v=6)
    between(hand + H * 0.2, hand + H * 0.5, 0.045, 'Wood', 'arm_lower_R', v=7, r2=0.07)
    up = H.cross(Vector((1, 0, 0))).normalized()
    for k in range(6):
        a = k * math.tau / 6
        d = up * math.cos(a) + Vector((1, 0, 0)) * math.sin(a)
        c = hand + H * (0.33 + 0.1 * (k % 2))
        between(c + d * 0.05, c + d * 0.1, 0.018, 'Iron', 'arm_lower_R', v=4, r2=0.0)
    body, rig = C.build('Grunt', C.humanoid_bones(arm_x=0.2, elbow_x=0.25, hand=(0.26, 0.29), leg_x=0.1, hip_z=0.3,
                                                  knee_z=0.16, chest_z=0.4, neck_z=0.64, shoulder_z=0.6, elbow_z=0.45))

    GUARD = -1.2
    def idle(t, P):
        ph = t * math.tau
        pose(P, chest_x=0.12 + 0.04 * math.sin(ph * 2), head_x=-0.1, head_y=0.25 * math.sin(ph),
             arm_upper_L=(0.05, 0, -0.12 - 0.04 * math.sin(ph * 2)), arm_lower_L_x=-0.3,
             arm_upper_R=(0.0, 0, 0.1), arm_lower_R_x=GUARD - 0.05 * math.sin(ph * 2))
        P['root'].location.y = -0.01 * (1 - math.cos(ph * 2))

    def walk(t, P):
        ph = t * math.tau
        s = math.sin(ph)
        walk_legs(P, ph, 0.45, 0.5, 0.025)
        pose(P, hips_z=0.1 * s, chest_z=-0.12 * s, chest_x=0.18, head_x=-0.12,
             arm_upper_L=(0.4 * s, 0, -0.15), arm_lower_L_x=-0.4, arm_upper_R=(-0.2 * s, 0, 0.12), arm_lower_R_x=GUARD)

    def attack(t, P):
        up, el, lean = keyed(t, [(0, 0.0, GUARD, 0.12), (0.4, -2.7, -1.0, -0.15), (0.55, -0.45, -0.1, 0.45), (1, 0.0, GUARD, 0.12)],
                             lambda t0, k: k ** 0.5 if t0 == 0.4 else ease(k))
        pose(P, arm_upper_R=(up, 0, 0.1), arm_lower_R_x=el, chest_x=lean, head_x=-lean * 0.5,
             arm_upper_L=(-0.4 * max(0.0, lean), 0, -0.2), arm_lower_L_x=-0.6,
             leg_upper_L_x=-0.3 * max(0.0, lean), leg_lower_L_x=0.35 * max(0.0, lean), leg_upper_R_x=0.25 * max(0.0, lean))
        P['root'].location.y = -0.05 * max(0.0, lean)

    return body, rig, [('Idle', 48, idle), ('Walk', 22, walk), ('Attack', 16, attack)], 0.45


# ======================================================================= DEMON
def demon():
    mat('Skin', (0.72, 0.12, 0.08)); mat('SkinDark', (0.3, 0.04, 0.04)); mat('Wing', (0.28, 0.04, 0.05), double=True)
    mat('Horn', (0.92, 0.86, 0.7), rough=0.5); mat('Eye', (1, 0.9, 0.2), glow=(1, 0.85, 0.1), glow_strength=5)
    mat('Mouth', (1, 0.45, 0.05), glow=(1, 0.4, 0.0), glow_strength=4); mat('Claw', (0.12, 0.08, 0.06))
    for s in S:
        x = 0.075 * s
        prim('cube', (x, -0.04, 0.035), (0.08, 0.13, 0.06), 'SkinDark', f'leg_lower_{sd(s)}')
        for k in (-1, 1):
            prim('cone', (x + 0.025 * k, -0.115, 0.03), (0.014, 0.014, 0.04), 'Claw', f'leg_lower_{sd(s)}', rot=(math.radians(-90), 0, 0), v=4)
        between((x, 0.02, 0.06), (x, -0.02, 0.18), 0.04, 'Skin', f'leg_lower_{sd(s)}', r2=0.045)
        between((x, -0.02, 0.18), (x, 0, 0.32), 0.055, 'Skin', f'leg_upper_{sd(s)}', r2=0.045)
    prim('sphere', (0, 0, 0.35), (0.13, 0.11, 0.08), 'SkinDark', 'hips', seg=8, rings=5)
    prim('sphere', (0, -0.01, 0.5), (0.15, 0.12, 0.15), 'Skin', 'chest', seg=10, rings=7)
    prim('sphere', (0, -0.08, 0.47), (0.1, 0.06, 0.1), 'SkinDark', 'chest', seg=8, rings=5)  # belly
    # head: snout with a glowing maw, yellow eyes, curled horns
    prim('sphere', (0, -0.05, 0.72), (0.11, 0.1, 0.1), 'Skin', 'head', seg=10, rings=7)
    prim('sphere', (0, -0.14, 0.68), (0.065, 0.06, 0.05), 'Skin', 'head', seg=8, rings=5)
    prim('sphere', (0, -0.18, 0.66), (0.045, 0.02, 0.02), 'Mouth', 'head', seg=6, rings=4)
    for s in S:
        prim('sphere', (0.045 * s, -0.14, 0.75), (0.022, 0.012, 0.018), 'Eye', 'head', rot=(0, math.radians(-15 * s), 0), seg=6, rings=4)
        prim('cube', (0.045 * s, -0.15, 0.775), (0.05, 0.02, 0.012), 'SkinDark', 'head', rot=(0, math.radians(20 * s), 0))
        curve_tube([(0.07 * s, -0.04, 0.8), (0.14 * s, -0.02, 0.88), (0.12 * s, 0.05, 0.96)], [1.0, 0.6, 0.05], 0.028, 'Horn', 'head')
        prim('cone', (0.1 * s, -0.02, 0.73), (0.04, 0.012, 0.05), 'Skin', 'head', rot=(0, math.radians(-65 * s), 0), v=4)
    for s in S:
        side = sd(s)
        between((0.14 * s, 0, 0.58), (0.19 * s, -0.02, 0.46), 0.04, 'Skin', f'arm_upper_{side}')
        between((0.19 * s, -0.02, 0.46), (0.2 * s, -0.03, 0.34), 0.035, 'Skin', f'arm_lower_{side}', r2=0.03)
        prim('sphere', (0.2 * s, -0.035, 0.32), (0.04, 0.04, 0.035), 'SkinDark', f'arm_lower_{side}', seg=6, rings=4)
        for k in (-1, 0, 1):
            between((0.2 * s + 0.018 * k, -0.05, 0.3), (0.2 * s + 0.022 * k, -0.08, 0.26), 0.009, 'Claw', f'arm_lower_{side}', v=4, r2=0.0)
    # bat wings on their own bones, pointing up from the shoulder blades
    for s in S:
        b = Vector((0.06 * s, 0.1, 0.6))
        pts = [(0.0, 0.0), (0.12, 0.12), (0.3, 0.2), (0.34, 0.08), (0.27, 0.02), (0.24, -0.1), (0.16, -0.04), (0.12, -0.16), (0.06, -0.06)]
        slab([b + Vector((u * s, 0.04 * u, v)) for u, v in pts], 'Wing', f'wing_{sd(s)}', thick=0.012, axis=Vector((0, 1, 0)))
        curve_tube([tuple(b), tuple(b + Vector((0.12 * s, 0.005, 0.12))), tuple(b + Vector((0.3 * s, 0.012, 0.2)))], [1, 0.7, 0.2], 0.012, 'SkinDark', f'wing_{sd(s)}')
    # tail on the cape bone, ending in an arrowhead
    curve_tube([(0, 0.1, 0.36), (0, 0.24, 0.3), (0, 0.34, 0.2), (0.04, 0.42, 0.18)], [1.0, 0.8, 0.5, 0.3], 0.025, 'Skin', 'cape')
    slab([(0.04, 0.42, 0.21), (0.08, 0.5, 0.18), (0.04, 0.44, 0.14), (0.0, 0.42, 0.16)], 'SkinDark', 'cape', thick=0.015, axis=Vector((0, 0, 1)))
    bones = C.humanoid_bones(arm_x=0.14, elbow_x=0.19, hand=(0.2, 0.32), leg_x=0.075, hip_z=0.32, knee_z=0.18,
                             chest_z=0.42, neck_z=0.64, shoulder_z=0.58, elbow_z=0.46)
    bones = [b for b in bones if b[0] != 'cape'] + [('cape', (0, 0.1, 0.36), (0, 0.3, 0.3), 'hips')]
    bones += [(f'wing_{sd(s)}', (0.06 * s, 0.1, 0.6), (0.06 * s, 0.1, 0.72), 'chest') for s in S]
    body, rig = C.build('Demon', bones)

    def wings(P, flap):
        P['wing_L'].rotation_euler.z = flap
        P['wing_R'].rotation_euler.z = -flap

    def idle(t, P):
        ph = t * math.tau
        pose(P, chest_x=0.25 + 0.04 * math.sin(ph * 2), head_x=-0.25, head_y=0.3 * math.sin(ph),
             arm_upper_L=(-0.3, 0, -0.15), arm_lower_L_x=-0.7, arm_upper_R=(-0.3, 0, 0.15), arm_lower_R_x=-0.7,
             leg_upper_L_x=-0.25, leg_lower_L_x=0.5, leg_upper_R_x=-0.25, leg_lower_R_x=0.5,
             cape_z=0.4 * math.sin(ph), cape_x=0.1 * math.sin(ph * 2))
        wings(P, 0.15 + 0.1 * math.sin(ph * 2))
        P['root'].location.y = -0.03 - 0.01 * math.sin(ph * 2)

    def walk(t, P):
        ph = t * math.tau
        s = math.sin(ph)
        walk_legs(P, ph, 0.55, 0.7, 0.03)
        P['leg_upper_L'].rotation_euler.x -= 0.2
        P['leg_upper_R'].rotation_euler.x -= 0.2
        pose(P, chest_x=0.4, head_x=-0.35, chest_y=0.15 * s,
             arm_upper_L=(0.5 * s - 0.3, 0, -0.2), arm_lower_L_x=-0.8, arm_upper_R=(-0.5 * s - 0.3, 0, 0.2), arm_lower_R_x=-0.8,
             cape_z=0.35 * math.sin(ph * 2))
        wings(P, 0.3 + 0.45 * math.sin(ph * 2))

    def attack(t, P):
        # rear back with wings spread, then lunge and breathe fire
        lean, head, flap = keyed(t, [(0, 0.25, -0.25, 0.15), (0.4, -0.2, 0.3, 0.9), (0.55, 0.6, -0.7, -0.2), (0.75, 0.55, -0.6, -0.1), (1, 0.25, -0.25, 0.15)])
        pose(P, chest_x=lean, head_x=head, arm_upper_L=(-1.0, 0, -0.5), arm_lower_L_x=-0.6,
             arm_upper_R=(-1.0, 0, 0.5), arm_lower_R_x=-0.6, leg_upper_L_x=-0.25, leg_lower_L_x=0.5,
             leg_upper_R_x=-0.25 + 0.3 * max(0.0, lean - 0.25), leg_lower_R_x=0.5, cape_x=-0.3 * max(0.0, -lean))
        wings(P, flap)

    return body, rig, [('Idle', 48, idle), ('Walk', 16, walk), ('Attack', 16, attack)], 0.5


# ======================================================================= LOBBER
def lobber():
    mat('Skin', (0.35, 0.62, 0.22)); mat('SkinDark', (0.16, 0.34, 0.1)); mat('EyeWhite', (0.96, 0.96, 0.92), rough=0.3)
    mat('Pupil', (0.02, 0.02, 0.03), rough=0.2); mat('Mouth', (0.25, 0.04, 0.06)); mat('Rock', (0.5, 0.47, 0.44), rough=0.9)
    mat('Tooth', (0.95, 0.93, 0.8))
    for s in S:
        x = 0.07 * s
        prim('sphere', (x, -0.035, 0.03), (0.05, 0.07, 0.03), 'SkinDark', f'leg_lower_{sd(s)}', seg=6, rings=4)
        between((x, 0, 0.03), (x, 0, 0.11), 0.022, 'Skin', f'leg_lower_{sd(s)}')
        between((x, 0, 0.11), (x, 0, 0.2), 0.026, 'Skin', f'leg_upper_{sd(s)}')
    # a round body that is mostly head
    prim('sphere', (0, 0, 0.32), (0.17, 0.15, 0.16), 'Skin', 'chest', seg=12, rings=9)
    prim('sphere', (0, -0.06, 0.25), (0.12, 0.09, 0.08), 'SkinDark', 'chest', seg=8, rings=5)
    for s in S:
        prim('sphere', (0.06 * s, -0.12, 0.38), (0.055, 0.04, 0.06), 'EyeWhite', 'chest', seg=10, rings=6)
        prim('sphere', (0.06 * s, -0.16, 0.38), (0.022, 0.012, 0.025), 'Pupil', 'chest', seg=6, rings=4)
        prim('cone', (0.16 * s, 0.0, 0.42), (0.03, 0.012, 0.08), 'Skin', 'head', rot=(0, math.radians(-55 * s), 0), v=4)
    prim('sphere', (0, -0.14, 0.27), (0.07, 0.03, 0.025), 'Mouth', 'chest', seg=8, rings=4)
    for k in (-1, 1):
        prim('cone', (0.03 * k, -0.155, 0.285), (0.01, 0.008, 0.02), 'Tooth', 'chest', rot=(math.radians(180), 0, 0), v=4)
    between((0, 0.02, 0.47), (0.02, 0.06, 0.53), 0.02, 'SkinDark', 'head', v=5, r2=0.005)
    for s in S:
        side = sd(s)
        between((0.15 * s, 0, 0.34), (0.21 * s, 0, 0.26), 0.022, 'Skin', f'arm_upper_{side}')
        between((0.21 * s, 0, 0.26), (0.22 * s, -0.01, 0.2), 0.02, 'Skin', f'arm_lower_{side}')
        prim('sphere', (0.22 * s, -0.012, 0.18), (0.032, 0.03, 0.03), 'SkinDark', f'arm_lower_{side}', seg=6, rings=4)
    rock = prim('ico', (-0.22, -0.03, 0.12), (0.055, 0.05, 0.05), 'Rock', 'rock', sub=1)
    each_vert(rock, lambda co: setattr(co, 'x', co.x + 0.006 * math.sin(co.z * 90)))
    bones = C.humanoid_bones(arm_x=0.15, elbow_x=0.21, hand=(0.22, 0.18), leg_x=0.07, hip_z=0.2, knee_z=0.11,
                             chest_z=0.24, neck_z=0.46, head_top=0.56, shoulder_z=0.34, elbow_z=0.26)
    bones += [('rock', (-0.22, -0.03, 0.14), (-0.22, -0.03, 0.08), 'arm_lower_R')]
    body, rig = C.build('Lobber', bones)

    def idle(t, P):
        ph = t * math.tau
        pose(P, chest_x=0.05 * math.sin(ph * 2), chest_y=0.3 * math.sin(ph), arm_upper_L=(0, 0, -0.3), arm_lower_L_x=-0.5,
             arm_upper_R=(-0.2, 0, 0.3), arm_lower_R_x=-1.2 + 0.2 * math.sin(ph * 4))
        P['root'].location.y = 0.02 * abs(math.sin(ph * 2))

    def walk(t, P):
        ph = t * math.tau
        s = math.sin(ph)
        walk_legs(P, ph, 0.7, 0.7, 0.05)
        pose(P, chest_x=0.12, chest_z=0.12 * s, arm_upper_L=(0.6 * s, 0, -0.4), arm_lower_L_x=-0.3,
             arm_upper_R=(-0.3, 0, 0.35), arm_lower_R_x=-1.2)

    def attack(t, P):
        # hop, rock up behind the head, overhand throw; a new rock appears later
        up, el, lean, hop = keyed(t, [(0, -0.2, -1.2, 0.0, 0.0), (0.4, -2.9, -1.2, -0.2, 0.06), (0.55, -1.2, -0.1, 0.35, 0.0), (1, -0.2, -1.2, 0.0, 0.0)])
        pose(P, arm_upper_R=(up, 0, 0.35), arm_lower_R_x=el, chest_x=lean, arm_upper_L=(-0.6, 0, -0.5), arm_lower_L_x=-0.4,
             leg_lower_L_x=0.4 * hop / 0.06, leg_lower_R_x=0.4 * hop / 0.06)
        P['root'].location.y = hop
        P['rock'].scale = (0, 0, 0) if 0.5 <= t < 0.9 else (1, 1, 1)

    return body, rig, [('Idle', 32, idle), ('Walk', 12, walk), ('Attack', 16, attack)], 0.3


# ==================================================================== SORCERER
def sorcerer():
    mat('Robe', (0.85, 0.62, 0.12)); mat('RobeDark', (0.45, 0.3, 0.05)); mat('Shadow', (0.02, 0.01, 0.03), rough=1.0)
    mat('Eye', (0.5, 1, 1), glow=(0.45, 1.0, 1.0), glow_strength=6); mat('Wood', (0.3, 0.17, 0.08))
    mat('Orb', (0.5, 1, 1), glow=(0.3, 0.95, 1.0), glow_strength=4); mat('Hand', (0.55, 0.5, 0.42)); mat('Gold', (1.0, 0.72, 0.2), metal=1.0, rough=0.3)
    for s in S:
        x = 0.07 * s
        between((x * 0.8, 0, 0.36), (x * 1.3, -0.01, 0.03), 0.09, 'Robe', f'leg_upper_{sd(s)}', v=8, r2=0.13)
        between((x * 1.3, -0.01, 0.045), (x * 1.31, -0.01, 0.025), 0.132, 'RobeDark', f'leg_upper_{sd(s)}', v=8)
    prim('cone', (0, 0, 0.39), (1, 0.85, 0.12), 'Robe', 'hips', r1=0.18, r2=0.14, v=10)
    prim('cyl', (0, 0, 0.445), (0.145, 0.12, 0.025), 'RobeDark', 'hips', v=10)
    prim('cone', (0, 0, 0.55), (1, 0.8, 0.2), 'Robe', 'chest', r1=0.13, r2=0.16, v=8)
    for s in S:
        prim('sphere', (0.155 * s, 0, 0.615), (0.065, 0.065, 0.05), 'Robe', 'chest', seg=8, rings=5)
    # deep rounded cowl with nothing but two glowing eyes inside
    hood = prim('sphere', (0, 0.01, 0.78), (0.15, 0.145, 0.15), 'Robe', 'head', seg=12, rings=8)
    C.edit_verts(hood, lambda bm: C.bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.08 and 0.66 < v.co.z < 0.86], context='VERTS'))
    prim('sphere', (0, -0.03, 0.76), (0.11, 0.1, 0.1), 'Shadow', 'head', seg=10, rings=6)
    for s in S:
        prim('sphere', (0.035 * s, -0.115, 0.765), (0.018, 0.01, 0.012), 'Eye', 'head', seg=6, rings=4)
    prim('cone', (0, 0.12, 0.72), (0.06, 0.05, 0.14), 'Robe', 'head', rot=(math.radians(150), 0, 0), r1=1, r2=0.1, v=6)  # cowl tail
    prim('cyl', (0, -0.005, 0.66), (0.15, 0.14, 0.03), 'RobeDark', 'head', v=10)
    prim('ico', (0, -0.14, 0.56), (0.025, 0.012, 0.03), 'Orb', 'chest', sub=1)  # amulet
    between((-0.06, -0.12, 0.64), (0, -0.14, 0.58), 0.005, 'Gold', 'chest', v=4)
    between((0.06, -0.12, 0.64), (0, -0.14, 0.58), 0.005, 'Gold', 'chest', v=4)
    prim('cone', (0, -0.1, 0.6), (1, 0.6, 0.1), 'RobeDark', 'chest', r1=0.1, r2=0.13, v=8)  # mantle
    for s in S:
        side = sd(s)
        between((0.17 * s, 0, 0.6), (0.21 * s, 0, 0.48), 0.045, 'Robe', f'arm_upper_{side}')
        between((0.21 * s, 0, 0.49), (0.225 * s, -0.01, 0.37), 0.045, 'Robe', f'arm_lower_{side}', r2=0.075)
        prim('sphere', (0.22 * s, -0.012, 0.335), (0.032, 0.032, 0.036), 'Hand', f'arm_lower_{side}', seg=6, rings=4)
    tilt = 1.1
    hand = Vector((-0.22, -0.012, 0.335))
    D = Vector((0, -math.sin(tilt), math.cos(tilt)))
    top = hand + D * 0.52
    curve_tube([tuple(hand - D * 0.34), tuple(hand + D * 0.1 + Vector((0.015, 0, 0))), tuple(hand + D * 0.35 - Vector((0.015, 0, 0))), tuple(top)],
               [1, 1, 1, 1.3], 0.016, 'Wood', 'arm_lower_R')
    prim('cyl', tuple(top), (0.03, 0.03, 0.02), 'Gold', 'arm_lower_R', rot=D.to_track_quat('Z', 'Y').to_euler(), v=8)
    prim('ico', tuple(top + D * 0.05), (0.045, 0.045, 0.045), 'Orb', 'arm_lower_R', sub=1)
    body, rig = C.build('Sorcerer', C.humanoid_bones())

    def idle(t, P):
        ph = t * math.tau
        pose(P, chest_x=0.08 + 0.03 * math.sin(ph * 2), head_x=-0.05, head_y=0.25 * math.sin(ph),
             arm_upper_R=(-0.1, 0, 0.1), arm_lower_R_x=-tilt + 0.1,
             arm_upper_L=(-0.35, 0.4, 0.05), arm_lower_L_x=-1.0 - 0.25 * math.sin(ph * 3))
        P['root'].location.y = 0.015 * math.sin(ph * 2)

    def walk(t, P):
        ph = t * math.tau
        s = math.sin(ph)
        walk_legs(P, ph, 0.45, 0.4, 0.015)
        pose(P, chest_x=0.12, chest_y=0.1 * s, arm_upper_R=(-0.25 * s, 0, 0.05), arm_lower_R_x=-tilt + 0.1 * s,
             arm_upper_L=(0.35 * s, 0, -0.05), arm_lower_L_x=-0.5)

    def attack(t, P):
        # staff and palm thrust forward; the eyes and orb flare (in game)
        ru, re, lu, le, lean = keyed(t, [(0, -0.1, -tilt, -0.35, -1.0, 0.08), (0.35, -0.6, -1.8, 0.4, -1.6, -0.15),
                                         (0.5, -1.55, -0.05, -1.5, -0.05, 0.3), (0.75, -1.45, -0.1, -1.4, -0.1, 0.25),
                                         (1, -0.1, -tilt, -0.35, -1.0, 0.08)])
        pose(P, arm_upper_R=(ru, 0, 0.05), arm_lower_R_x=re, arm_upper_L=(lu, 0.15, 0.05), arm_lower_L_x=le,
             chest_x=lean, head_x=-lean * 0.5)

    return body, rig, [('Idle', 48, idle), ('Walk', 20, walk), ('Attack', 16, attack)], 0.5


# ======================================================================= GHOST
def ghost():
    mat('Sheet', (0.8, 0.85, 1.0), rough=0.6, glow=(0.45, 0.55, 0.9), glow_strength=0.5, alpha=0.78, double=True)
    mat('Hollow', (0.02, 0.01, 0.05), rough=1.0)
    rings = [(0.1, 0.19, 0.17, 0.02, 0.05), (0.22, 0.185, 0.165, 0.015, 0), (0.4, 0.17, 0.15, 0.0, 0), (0.56, 0.15, 0.14, 0.0, 0),
             (0.68, 0.145, 0.135, 0.0, 0), (0.79, 0.12, 0.115, 0.0, 0), (0.86, 0.07, 0.07, 0.0, 0), (0.89, 0.02, 0.02, 0.0, 0)]
    def sheet_bone(co):
        if co.z > 0.5:
            return 'chest'
        if co.z > 0.3:
            return 'hips'
        return 'leg_upper_L' if co.x > 0 else 'leg_upper_R'
    tube(rings, 'Sheet', sheet_bone, v=12)
    for s in S:
        prim('sphere', (0.05 * s, -0.125, 0.7), (0.03, 0.02, 0.045), 'Hollow', 'chest', seg=6, rings=4)
    prim('sphere', (0, -0.14, 0.59), (0.035, 0.02, 0.05), 'Hollow', 'chest', seg=6, rings=4)
    for s in S:
        side = sd(s)
        between((0.13 * s, -0.02, 0.6), (0.19 * s, -0.03, 0.47), 0.04, 'Sheet', f'arm_upper_{side}', v=6, r2=0.035)
        between((0.19 * s, -0.03, 0.47), (0.2 * s, -0.04, 0.35), 0.035, 'Sheet', f'arm_lower_{side}', v=6, r2=0.012)
        for k in (-1, 0, 1):
            between((0.2 * s, -0.04, 0.36), (0.2 * s + 0.02 * k, -0.06, 0.3), 0.01, 'Sheet', f'arm_lower_{side}', v=4, r2=0.0)
    body, rig = C.build('Ghost', C.humanoid_bones(arm_x=0.13, elbow_x=0.19, hand=(0.2, 0.35), leg_x=0.08, hip_z=0.32, knee_z=0.15))

    def float_base(P, ph, amp=0.04):
        P['root'].location.y = 0.1 + amp * math.sin(ph * 2)
        pose(P, leg_upper_L_x=0.25 * math.sin(ph * 2), leg_upper_R_x=0.25 * math.sin(ph * 2 + 1.5))

    def idle(t, P):
        ph = t * math.tau
        float_base(P, ph)
        pose(P, chest_z=0.12 * math.sin(ph), head_y=0.2 * math.sin(ph),
             arm_upper_L=(-0.6 + 0.15 * math.sin(ph * 2), 0, -0.2), arm_lower_L_x=-0.4,
             arm_upper_R=(-0.6 + 0.15 * math.sin(ph * 2 + 1), 0, 0.2), arm_lower_R_x=-0.4)

    def walk(t, P):
        ph = t * math.tau
        float_base(P, ph, 0.03)
        pose(P, hips_x=0.25, chest_x=0.15, leg_upper_L_x=0.7 + 0.25 * math.sin(ph * 2), leg_upper_R_x=0.7 + 0.25 * math.sin(ph * 2 + 1.5),
             arm_upper_L=(-1.2 + 0.2 * math.sin(ph * 2), 0, -0.15), arm_lower_L_x=-0.2,
             arm_upper_R=(-1.2 + 0.2 * math.sin(ph * 2 + math.pi), 0, 0.15), arm_lower_R_x=-0.2)

    def attack(t, P):
        lean, arms, fwd = keyed(t, [(0, 0.1, -0.6, 0.0), (0.35, -0.25, -2.4, -0.05), (0.55, 0.45, -1.3, 0.14), (1, 0.1, -0.6, 0.0)])
        float_base(P, t * math.tau, 0.02)
        pose(P, hips_x=lean * 0.5, chest_x=lean, arm_upper_L=(arms, 0, -0.35), arm_lower_L_x=-0.3,
             arm_upper_R=(arms, 0, 0.35), arm_lower_R_x=-0.3, leg_upper_L_x=0.5, leg_upper_R_x=0.5)
        P['root'].location.z = fwd

    return body, rig, [('Idle', 32, idle), ('Walk', 24, walk), ('Attack', 16, attack)], 0.55


# ======================================================================= DEATH
def death():
    mat('Robe', (0.06, 0.04, 0.09), rough=0.9, double=True); mat('Bone', (0.9, 0.88, 0.8), rough=0.5)
    mat('Socket', (0.6, 0.3, 1.0), glow=(0.6, 0.25, 1.0), glow_strength=8)
    mat('Trim', (0.4, 0.15, 0.8), glow=(0.5, 0.2, 1.0), glow_strength=2)
    mat('Pole', (0.2, 0.18, 0.2)); mat('Blade', (0.78, 0.8, 0.86), metal=0.9, rough=0.3)
    rings = [(0.06, 0.2, 0.18, 0.03, 0.06), (0.2, 0.19, 0.17, 0.02, 0), (0.4, 0.16, 0.14, 0.0, 0), (0.58, 0.16, 0.14, 0.0, 0),
             (0.66, 0.13, 0.12, 0.0, 0), (0.8, 0.14, 0.14, 0.02, 0), (0.9, 0.1, 0.11, 0.04, 0), (0.95, 0.03, 0.04, 0.06, 0)]
    def robe_bone(co):
        if co.z > 0.64:
            return 'head' if co.z > 0.7 else 'chest'
        if co.z > 0.3:
            return 'hips'
        return 'leg_upper_L' if co.x > 0 else 'leg_upper_R'
    robe = tube(rings, 'Robe', robe_bone, v=12)
    # open the hood: push the front verts of the top rings back
    each_vert(robe, lambda co: setattr(co, 'y', co.y + 0.05) if co.z > 0.68 and co.y < -0.08 else None)
    prim('sphere', (0, -0.04, 0.78), (0.085, 0.085, 0.09), 'Bone', 'head', seg=10, rings=7)
    prim('cube', (0, -0.085, 0.71), (0.07, 0.05, 0.035), 'Bone', 'head')
    for s in S:
        prim('sphere', (0.032 * s, -0.115, 0.79), (0.022, 0.012, 0.024), 'Socket', 'head', seg=6, rings=4)
    for k in (-2, -1, 0, 1, 2):
        prim('cube', (0.013 * k, -0.112, 0.705), (0.008, 0.006, 0.015), 'Socket' if k == 0 else 'Robe', 'head')
    for s in S:
        side = sd(s)
        between((0.15 * s, 0, 0.6), (0.2 * s, 0, 0.48), 0.05, 'Robe', f'arm_upper_{side}', v=6)
        between((0.2 * s, 0, 0.49), (0.215 * s, -0.01, 0.37), 0.05, 'Robe', f'arm_lower_{side}', v=6, r2=0.07)
        for k in (-1, 0, 1):
            between((0.215 * s, -0.012, 0.36), (0.215 * s + 0.015 * k, -0.02, 0.3), 0.008, 'Bone', f'arm_lower_{side}', v=4)
    # scythe: long pole, upright when the forearm is bent, blade curving forward
    tilt = 1.2
    hand = Vector((-0.215, -0.012, 0.33))
    D = Vector((0, -math.sin(tilt), math.cos(tilt)))
    F = Vector((0, -math.cos(tilt), -math.sin(tilt)))  # "forward" once the pole stands
    top = hand + D * 0.62
    between(hand - D * 0.3, top, 0.014, 'Pole', 'arm_lower_R', v=6)
    blade = [top + F * 0.0 + D * 0.0, top + F * 0.12 + D * 0.03, top + F * 0.28 + D * -0.02, top + F * 0.38 + D * -0.12,
             top + F * 0.26 + D * -0.04, top + F * 0.12 + D * -0.03, top - D * 0.05]
    slab(blade, 'Blade', 'arm_lower_R', thick=0.01)
    body, rig = C.build('Death', C.humanoid_bones(arm_x=0.15, elbow_x=0.2, hand=(0.215, 0.33), leg_x=0.08, hip_z=0.32, knee_z=0.15))

    def float_base(P, ph):
        P['root'].location.y = 0.08 + 0.03 * math.sin(ph * 2)
        pose(P, leg_upper_L_x=0.3 + 0.2 * math.sin(ph * 2), leg_upper_R_x=0.3 + 0.2 * math.sin(ph * 2 + 1.5))

    def idle(t, P):
        ph = t * math.tau
        float_base(P, ph)
        pose(P, chest_x=0.1, head_x=-0.1 + 0.05 * math.sin(ph * 2), head_y=0.3 * math.sin(ph),
             arm_upper_R=(-0.05, 0, 0.1), arm_lower_R_x=-tilt, arm_upper_L=(-0.7, 0.3, -0.1), arm_lower_L_x=-0.9 + 0.2 * math.sin(ph * 2))

    def walk(t, P):
        ph = t * math.tau
        float_base(P, ph)
        pose(P, hips_x=0.2, chest_x=0.2, head_x=-0.2, leg_upper_L_x=0.8, leg_upper_R_x=0.8,
             arm_upper_R=(-0.1, 0, 0.1), arm_lower_R_x=-tilt + 0.1, arm_upper_L=(-1.2, 0, -0.1), arm_lower_L_x=-0.3)

    def attack(t, P):
        # wide horizontal reap: scythe back over the right shoulder, sweep across
        ru, rz, re, tw, lean = keyed(t, [(0, -0.05, 0.1, -tilt, 0.0, 0.1), (0.35, -1.2, 1.2, -1.4, -0.7, -0.05),
                                         (0.55, -1.3, -0.6, -0.4, 0.8, 0.3), (1, -0.05, 0.1, -tilt, 0.0, 0.1)])
        float_base(P, t * math.tau)
        pose(P, arm_upper_R=(ru, 0, rz), arm_lower_R_x=re, chest_y=tw, hips_y=tw * 0.3, chest_x=lean, head_y=-tw * 0.4,
             arm_upper_L=(-0.8, 0, -0.3), arm_lower_L_x=-0.5)

    return body, rig, [('Idle', 48, idle), ('Walk', 24, walk), ('Attack', 16, attack)], 0.55


# ================================================================== GENERATORS
def gen_bones():
    mat('Bone', (0.9, 0.87, 0.78), rough=0.55); mat('Dirt', (0.16, 0.13, 0.15), rough=1.0)
    mat('Socket', (0.6, 0.3, 1.0), glow=(0.55, 0.3, 1.0), glow_strength=5)
    mound = prim('sphere', (0, 0, 0.0), (0.42, 0.38, 0.14), 'Dirt', 'root', seg=12, rings=6)
    each_vert(mound, lambda co: setattr(co, 'z', max(co.z, 0.0)))
    import random
    rnd = random.Random(7)
    for i in range(14):
        a, r = rnd.uniform(0, math.tau), rnd.uniform(0.05, 0.32)
        c = Vector((math.cos(a) * r, math.sin(a) * r, 0.1 + 0.08 * (1 - r / 0.32)))
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 0.3))).normalized() * rnd.uniform(0.08, 0.13)
        between(c - d, c + d, 0.017, 'Bone', 'root', v=6)
        for e in (c - d, c + d):
            prim('sphere', tuple(e), (0.025, 0.025, 0.025), 'Bone', 'root', seg=6, rings=4)
    prim('sphere', (0.02, -0.05, 0.28), (0.1, 0.095, 0.095), 'Bone', 'root', seg=10, rings=7)
    prim('cube', (0.02, -0.1, 0.2), (0.09, 0.06, 0.05), 'Bone', 'root')
    for s in S:
        prim('sphere', (0.02 + 0.035 * s, -0.135, 0.29), (0.024, 0.012, 0.026), 'Socket', 'root', seg=6, rings=4)
    for k in (-2, -1, 0, 1, 2):
        prim('cube', (0.02 + 0.017 * k, -0.13, 0.185), (0.01, 0.01, 0.02), 'Bone', 'root')
    body, _ = C.build('BonePile', None)
    return body, None, [], 0.2


def gen_hut():
    mat('Stone', (0.36, 0.33, 0.38), rough=0.9); mat('StoneDark', (0.22, 0.2, 0.24), rough=0.9)
    mat('Wood', (0.34, 0.2, 0.1)); mat('Dark', (0.01, 0.0, 0.02), rough=1.0)
    mat('Ember', (1.0, 0.35, 0.05), glow=(1.0, 0.3, 0.02), glow_strength=5)
    prim('cube', (0, 0, 0.22), (0.72, 0.62, 0.44), 'Stone', 'root')
    for x in (-0.36, 0.36):
        for y in (-0.31, 0.31):
            prim('cube', (x, y, 0.23), (0.1, 0.1, 0.48), 'StoneDark', 'root')
    for z in (0.12, 0.3):  # masonry bands
        prim('cube', (0, -0.312, z), (0.7, 0.01, 0.025), 'StoneDark', 'root')
    roof = prim('cone', (0, 0, 0.6), (0.62, 0.55, 0.32), 'Wood', 'root', r1=1, r2=0.0, v=4, rot=(0, 0, math.radians(45)))
    prim('cube', (0, 0, 0.45), (0.78, 0.68, 0.04), 'Wood', 'root')
    # arched doorway with embers glowing inside
    prim('cube', (0, -0.3, 0.14), (0.24, 0.05, 0.26), 'Dark', 'root')
    prim('cyl', (0, -0.3, 0.27), (0.12, 0.12, 0.05), 'Dark', 'root', rot=(math.radians(90), 0, 0), v=10)
    for x in (-0.06, 0.04):
        prim('ico', (x, -0.26, 0.05), (0.03, 0.03, 0.025), 'Ember', 'root', sub=1)
    prim('cube', (0.0, -0.33, 0.45), (0.1, 0.02, 0.1), 'Stone', 'root')
    prim('sphere', (0.0, -0.345, 0.45), (0.035, 0.012, 0.035), 'Ember', 'root', seg=6, rings=4)
    body, _ = C.build('Hut', None)
    return body, None, [], 0.3


BUILDERS = dict(ghost=ghost, grunt=grunt, demon=demon, lobber=lobber, sorcerer=sorcerer, death=death,
                gen_bones=gen_bones, gen_hut=gen_hut)


def make(name, out_dir, preview_dir=None):
    C.reset()
    body, rig, actions, target_z = BUILDERS[name]()
    for act_name, frames, fn in actions:
        C.make_action(rig, act_name, frames, fn)
    if preview_dir:
        shots = [(f'{name}-front', FRONT, 'Idle' if rig else None, 9), (f'{name}-high', HIGH, 'Idle' if rig else None, 9)]
        if rig:
            shots += [(f'{name}-walk', SIDE, 'Walk', 4)]
            n = next(f for a, f, _ in actions if a == 'Attack')
            shots += [(f'{name}-atk{i}', SIDE, 'Attack', 1 + round(n * k)) for i, k in enumerate((0.35, 0.5, 0.65))]
        C.render_previews(preview_dir, rig, shots, target_z)
    C.export(os.path.join(out_dir, f'{name}.glb'), body, rig)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    which, out = args[0], args[1]
    prev = args[2] if len(args) > 2 else None
    for n in (BUILDERS if which == 'all' else which.split(',')):
        make(n, out, prev)
