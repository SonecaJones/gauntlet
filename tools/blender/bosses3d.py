"""Low-poly Gauntlet bosses, built by code like the heroes and monsters.

  python bosses3d.py <dragon|lich|golem|all> <out_dir> [preview_dir]

Dragon: Idle / Walk / Breath / Tail / Roar.
Lich (necromancer): Idle / Walk / Cast / Orbs / Summon / Roar.
Golem: Idle / Walk / Windup / Charge / Stun / Slam / Throw / Roar.
They are modelled about one unit tall and scaled up in the game. Like the
monsters they face -Y with +X on their left. Bone axes (every bone here has
its local X along world +X except the wings): +X pitches a bone, so limbs
pointing down swing back, a spine pointing up leans forward, a neck or head
pointing forward dips and a tail pointing back rises. Wings: +X raises them,
+Z sweeps the left wing back and the right wing forward.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from common import Vector, prim, between, slab, tube, curve_tube, each_vert, mat, ease, keyed  # noqa: E402
from enemies3d import S, sd, pose  # noqa: E402


def rocky(o, seed, amount=0.18):
    """Chip a rounded primitive into a rough stone (deterministic)."""
    rnd = random.Random(seed)
    cache = {}
    def f(co):
        key = (round(co.x, 4), round(co.y, 4), round(co.z, 4))
        if key not in cache:
            cache[key] = 1 + rnd.uniform(-amount, amount)
        k = cache[key]
        co.x *= k; co.y *= k; co.z *= k
    # verts are world-space after finish(): scale around the part's centre
    c = sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
    def g(co):
        d = co - c
        f(d)
        co.x, co.y, co.z = c.x + d.x, c.y + d.y, c.z + d.z
    each_vert(o, g)
    return o


# ====================================================================== DRAGON
def dragon():
    mat('Scales', (0.62, 0.09, 0.06), rough=0.6); mat('ScalesDark', (0.28, 0.03, 0.03), rough=0.7)
    mat('Belly', (0.92, 0.66, 0.3), rough=0.6); mat('Horn', (0.93, 0.86, 0.7), rough=0.45)
    mat('Wing', (0.42, 0.05, 0.05), rough=0.8, double=True); mat('Claw', (0.1, 0.07, 0.06), rough=0.5)
    mat('Eye', (1, 0.9, 0.2), glow=(1, 0.85, 0.1), glow_strength=6)
    mat('Mouth', (1, 0.45, 0.05), glow=(1, 0.4, 0.0), glow_strength=5)

    def trunk(co):  # front half follows the chest, back half the hips
        return 'chest' if co.y < -0.02 else 'hips'
    prim('sphere', (0, 0.05, 0.45), (0.26, 0.42, 0.24), 'Scales', trunk, seg=14, rings=9)
    prim('sphere', (0, -0.02, 0.36), (0.2, 0.34, 0.15), 'Belly', trunk, seg=12, rings=7)
    for k in range(7):  # spine plates
        y = -0.28 + 0.1 * k
        z = 0.45 + 0.24 * math.sqrt(max(0.0, 1 - ((y - 0.05) / 0.42) ** 2))
        prim('cone', (0, y, z + 0.02), (0.02, 0.05, 0.07 - 0.004 * abs(k - 3)), 'Horn', 'chest' if y < -0.02 else 'hips', v=4)

    # neck and head
    def neck_bone(co):
        return 'chest' if co.z < 0.58 else 'neck'
    curve_tube([(0, -0.22, 0.5), (0, -0.4, 0.64), (0, -0.5, 0.84)], [1, 0.8, 0.62], 0.1, 'Scales', neck_bone)
    curve_tube([(0, -0.28, 0.46), (0, -0.44, 0.62), (0, -0.53, 0.78)], [1, 0.8, 0.6], 0.075, 'Belly', neck_bone)
    for k in range(3):
        prim('cone', (0, -0.33 - 0.07 * k, 0.69 + 0.08 * k), (0.018, 0.04, 0.05), 'Horn', 'neck', rot=(math.radians(-25), 0, 0), v=4)
    prim('sphere', (0, -0.57, 0.87), (0.11, 0.12, 0.095), 'Scales', 'head', seg=10, rings=7)
    prim('cone', (0, -0.7, 0.855), (0.085, 0.06, 0.24), 'Scales', 'head', rot=(math.radians(90), 0, 0), r1=1, r2=0.5, v=6)
    prim('cube', (0, -0.63, 0.93), (0.15, 0.1, 0.03), 'ScalesDark', 'head', rot=(math.radians(-12), 0, 0))  # brow
    for s in S:
        prim('sphere', (0.065 * s, -0.63, 0.905), (0.026, 0.02, 0.018), 'Eye', 'head', seg=6, rings=4)
        prim('sphere', (0.028 * s, -0.81, 0.88), (0.012, 0.01, 0.01), 'Claw', 'head', seg=5, rings=3)  # nostril
        curve_tube([(0.06 * s, -0.56, 0.93), (0.11 * s, -0.46, 1.0), (0.12 * s, -0.33, 1.0)], [1.0, 0.65, 0.05], 0.03, 'Horn', 'head')
        curve_tube([(0.09 * s, -0.54, 0.86), (0.15 * s, -0.47, 0.88), (0.19 * s, -0.42, 0.86)], [1.0, 0.5, 0.05], 0.018, 'Horn', 'head')
        for k in range(4):  # upper teeth
            prim('cone', (0.055 * s, -0.66 - 0.045 * k, 0.815), (0.011, 0.011, 0.03), 'Horn', 'head', rot=(math.radians(180), 0, 0), v=4)
    # lower jaw with a glowing throat
    prim('cone', (0, -0.68, 0.785), (0.075, 0.035, 0.22), 'Scales', 'jaw', rot=(math.radians(90), 0, 0), r1=1, r2=0.55, v=6)
    prim('sphere', (0, -0.66, 0.81), (0.055, 0.13, 0.015), 'Mouth', 'jaw', seg=8, rings=4)
    for s in S:
        for k in range(3):
            prim('cone', (0.045 * s, -0.68 - 0.045 * k, 0.815), (0.01, 0.01, 0.025), 'Horn', 'jaw', v=4)

    # tail, ending in a spade
    def tail_bone(co):
        return 'hips' if co.y < 0.42 else 'tail1' if co.y < 0.66 else 'tail2' if co.y < 0.9 else 'tail3' if co.y < 1.14 else 'tail4'
    curve_tube([(0, 0.34, 0.44), (0, 0.65, 0.32), (0, 0.9, 0.22), (0, 1.15, 0.15), (0, 1.38, 0.12)], [1.0, 0.75, 0.5, 0.3, 0.12],
               0.13, 'Scales', tail_bone, res=6)
    for k in range(5):
        y = 0.5 + 0.2 * k
        z = 0.39 - 0.26 * (k / 4) ** 0.8 + 0.1 - 0.02 * k
        prim('cone', (0, y, z), (0.015, 0.04, 0.05 - 0.006 * k), 'Horn', tail_bone(Vector((0, y, z))),
             rot=(math.radians(25), 0, 0), v=4)
    slab([(0, 1.33, 0.13), (0.09, 1.42, 0.13), (0, 1.58, 0.12), (-0.09, 1.42, 0.13)], 'Horn', 'tail4', thick=0.02, axis=Vector((0, 0, 1)))

    # legs: thick, clawed
    for s in S:
        side = sd(s)
        for front, y, top in ((True, -0.2, 0.42), (False, 0.3, 0.42)):
            up, lo = ('fleg_upper_', 'fleg_lower_') if front else ('bleg_upper_', 'bleg_lower_')
            x = 0.2 * s
            if not front:
                prim('sphere', (0.19 * s, 0.28, 0.38), (0.1, 0.15, 0.14), 'Scales', up + side, seg=10, rings=6)
            else:
                prim('sphere', (0.19 * s, -0.2, 0.42), (0.09, 0.1, 0.1), 'Scales', up + side, seg=10, rings=6)
            knee = Vector((0.22 * s, y + (-0.04 if front else -0.08), 0.2))
            between((x, y, top), knee, 0.07, 'Scales', up + side, r2=0.055)
            foot = Vector((0.22 * s, y, 0.04))
            between(knee, foot, 0.05, 'ScalesDark', lo + side, r2=0.045)
            prim('sphere', (foot.x, foot.y - 0.03, 0.035), (0.065, 0.09, 0.035), 'ScalesDark', lo + side, seg=8, rings=5)
            for k in (-1, 0, 1):
                prim('cone', (foot.x + 0.035 * k, foot.y - 0.12, 0.03), (0.014, 0.014, 0.05), 'Claw', lo + side,
                     rot=(math.radians(100), 0, 0), v=4)

    # wings: arm spar, forearm spar and fingers, with a membrane in two halves
    for s in S:
        side = sd(s)
        sh, el, tip = Vector((0.14 * s, -0.08, 0.62)), Vector((0.5 * s, 0.0, 0.84)), Vector((0.95 * s, 0.22, 0.74))
        f1, f2, back = Vector((0.82 * s, 0.46, 0.48)), Vector((0.58 * s, 0.46, 0.46)), Vector((0.18 * s, 0.3, 0.56))
        between(sh, el, 0.028, 'ScalesDark', f'wing_{side}', v=6, r2=0.022)
        between(el, tip, 0.02, 'ScalesDark', f'wing2_{side}', v=6, r2=0.006)
        between(el, f1, 0.012, 'ScalesDark', f'wing2_{side}', v=5, r2=0.004)
        between(el, f2, 0.012, 'ScalesDark', f'wing_{side}', v=5, r2=0.004)
        prim('cone', tuple(el + Vector((0, -0.02, 0.03))), (0.015, 0.015, 0.06), 'Claw', f'wing_{side}', v=4)
        slab([sh, el, f2, back], 'Wing', f'wing_{side}', thick=0.01, axis=Vector((0, 0, 1)))
        slab([el, tip, f1, f2], 'Wing', f'wing2_{side}', thick=0.01, axis=Vector((0, 0, 1)))

    bones = [('root', (0, 0, 0), (0, 0, 0.1), None),
             ('hips', (0, 0.32, 0.42), (0, -0.02, 0.48), 'root'),
             ('chest', (0, -0.02, 0.48), (0, -0.3, 0.58), 'hips'),
             ('neck', (0, -0.3, 0.58), (0, -0.5, 0.84), 'chest'),
             ('head', (0, -0.5, 0.84), (0, -0.8, 0.8), 'neck'),
             ('jaw', (0, -0.56, 0.8), (0, -0.8, 0.74), 'head'),
             ('tail1', (0, 0.42, 0.4), (0, 0.66, 0.31), 'hips'),
             ('tail2', (0, 0.66, 0.31), (0, 0.9, 0.22), 'tail1'),
             ('tail3', (0, 0.9, 0.22), (0, 1.14, 0.15), 'tail2'),
             ('tail4', (0, 1.14, 0.15), (0, 1.45, 0.12), 'tail3')]
    for s in S:
        side = sd(s)
        bones += [(f'fleg_upper_{side}', (0.2 * s, -0.2, 0.42), (0.22 * s, -0.24, 0.2), 'chest'),
                  (f'fleg_lower_{side}', (0.22 * s, -0.24, 0.2), (0.22 * s, -0.2, 0.03), f'fleg_upper_{side}'),
                  (f'bleg_upper_{side}', (0.2 * s, 0.3, 0.42), (0.22 * s, 0.22, 0.2), 'hips'),
                  (f'bleg_lower_{side}', (0.22 * s, 0.22, 0.2), (0.22 * s, 0.3, 0.03), f'bleg_upper_{side}'),
                  (f'wing_{side}', (0.14 * s, -0.08, 0.62), (0.5 * s, 0.0, 0.84), 'chest'),
                  (f'wing2_{side}', (0.5 * s, 0.0, 0.84), (0.95 * s, 0.22, 0.74), f'wing_{side}')]
    body, rig = C.build('Dragon', bones)

    def wings(P, lift, sweep, tip):
        pose(P, wing_L_x=lift, wing_R_x=lift, wing_L_z=sweep, wing_R_z=-sweep, wing2_L_x=tip, wing2_R_x=tip,
             wing2_L_z=sweep * 0.8, wing2_R_z=-sweep * 0.8)

    def tail_sway(P, ph, amp=0.22, lift=0.0):
        for i in range(1, 5):
            pose(P, **{f'tail{i}_z': amp * math.sin(ph - i * 0.7), f'tail{i}_x': lift / i})

    def idle(t, P):
        ph = t * math.tau
        b = math.sin(ph * 2)
        pose(P, neck_x=0.05 + 0.04 * b, head_x=-0.05 - 0.05 * b, head_z=0.18 * math.sin(ph), jaw_x=0.05 + 0.05 * max(0.0, b))
        P['chest'].scale = (1 + 0.025 * b, 1, 1 + 0.025 * b)
        tail_sway(P, ph, 0.2)
        wings(P, -0.35 + 0.05 * b, 0.55, -0.5)

    def walk(t, P):
        ph = t * math.tau
        s = math.sin(ph)
        # diagonal pairs: front left with back right
        for leg, p in (('fleg', 0.0), ('bleg', math.pi)):
            for side, q in (('L', 0.0), ('R', math.pi)):
                a = ph + p + q
                pose(P, **{f'{leg}_upper_{side}_x': 0.45 * math.sin(a),
                           f'{leg}_lower_{side}_x': (0.1 + 0.5 * max(0.0, math.sin(a + 1.9))) * (-1 if leg == 'bleg' else 1)})
        pose(P, hips_z=0.06 * s, chest_z=-0.08 * s, neck_x=0.12 + 0.05 * math.sin(ph * 2), head_x=-0.1, head_z=0.1 * s)
        P['root'].location.y = 0.015 * abs(math.cos(ph))
        tail_sway(P, ph, 0.3)
        wings(P, -0.3 + 0.08 * math.sin(ph * 2), 0.5, -0.45)

    def breath(t, P):
        # neck stretched forward, jaw wide, throat shaking
        ph = t * math.tau
        j = 0.03 * math.sin(ph * 4)
        pose(P, hips_x=0.06, neck_x=0.3 + j, head_x=-0.25 + j, jaw_x=0.75 + 2 * j,
             fleg_upper_L_x=-0.2, fleg_upper_R_x=-0.2, fleg_lower_L_x=0.15, fleg_lower_R_x=0.15)
        tail_sway(P, ph, 0.12, 0.15)
        wings(P, 0.25 + 0.1 * math.sin(ph * 2), 0.15, -0.1)

    def tail(t, P):
        # crouch, then spin around once so the tail sweeps the whole circle
        spin = keyed(t, [(0, 0.0), (0.25, -0.35), (0.75, math.tau), (1, math.tau)])[0]
        crouch = keyed(t, [(0, 0.0), (0.25, 1.0), (0.8, 1.0), (1, 0.0)])[0]
        P['root'].rotation_euler.y = spin
        pose(P, neck_x=0.25 * crouch, head_x=-0.1, fleg_upper_L_x=-0.2 * crouch, fleg_upper_R_x=-0.2 * crouch)
        for i in range(1, 5):
            pose(P, **{f'tail{i}_x': 0.18 * crouch - 0.05 * i * crouch, f'tail{i}_z': -0.25 * crouch * (1 if 0.25 < t < 0.8 else 0.3)})
        wings(P, -0.1 + 0.4 * crouch, 0.35, -0.2)

    def roar(t, P):
        # rear up on the hind legs, wings wide, head thrown back
        up = keyed(t, [(0, 0.0), (0.3, 1.0), (0.8, 1.0), (1, 0.0)])[0]
        j = 0.04 * math.sin(t * math.tau * 6) * up
        pose(P, hips_x=-0.5 * up, bleg_upper_L_x=0.5 * up, bleg_upper_R_x=0.5 * up,
             fleg_upper_L_x=-0.7 * up, fleg_upper_R_x=-0.7 * up, fleg_lower_L_x=0.9 * up, fleg_lower_R_x=0.9 * up,
             neck_x=-0.2 * up, head_x=-0.45 * up + j, jaw_x=0.8 * up + j * 3)
        tail_sway(P, t * math.tau, 0.15, -0.2 * up)
        wings(P, -0.35 + 1.0 * up, 0.55 - 0.6 * up, -0.5 + 0.7 * up)

    return body, rig, [('Idle', 48, idle), ('Walk', 28, walk), ('Breath', 24, breath), ('Tail', 17, tail), ('Roar', 30, roar)], 0.5


# ======================================================================== LICH
def lich():
    mat('Robe', (0.12, 0.06, 0.16), rough=0.9, double=True); mat('RobeDark', (0.05, 0.02, 0.07), rough=1.0)
    mat('Trim', (0.25, 0.85, 0.35), glow=(0.3, 1.0, 0.45), glow_strength=2)
    mat('Bone', (0.88, 0.86, 0.76), rough=0.5); mat('Gold', (0.95, 0.7, 0.2), metal=1.0, rough=0.3)
    mat('Eye', (0.5, 1, 0.55), glow=(0.35, 1.0, 0.45), glow_strength=8)
    mat('Flame', (0.5, 1, 0.55), glow=(0.3, 1.0, 0.4), glow_strength=6); mat('Wood', (0.18, 0.12, 0.1))
    # long tattered robe
    rings = [(0.04, 0.22, 0.2, 0.03, 0.07), (0.18, 0.2, 0.18, 0.02, 0.0), (0.36, 0.16, 0.14, 0.0, 0.0), (0.56, 0.17, 0.14, 0.0, 0.0),
             (0.64, 0.15, 0.13, 0.0, 0.0)]
    def robe_bone(co):
        if co.z > 0.5:
            return 'chest'
        if co.z > 0.3:
            return 'hips'
        return 'leg_upper_L' if co.x > 0 else 'leg_upper_R'
    tube(rings, 'Robe', robe_bone, v=14)
    tube([(0.03, 0.225, 0.205, 0.03, 0.07), (0.07, 0.215, 0.195, 0.028, 0.0)], 'Trim', robe_bone, v=14, cap_top=False)
    prim('cyl', (0, 0, 0.38), (0.165, 0.145, 0.025), 'Gold', 'hips', v=12)  # belt
    prim('ico', (0, -0.15, 0.38), (0.03, 0.015, 0.035), 'Trim', 'hips', sub=1)
    for k in (-1, 1):  # hanging sash
        between((0.04 * k, -0.15, 0.36), (0.05 * k, -0.19, 0.12), 0.018, 'Trim', 'hips', v=4, r2=0.01)
    prim('cone', (0, 0, 0.64), (1, 0.85, 0.12), 'RobeDark', 'chest', r1=0.19, r2=0.12, v=10)  # mantle
    # pauldrons with skulls
    for s in S:
        prim('sphere', (0.17 * s, 0.0, 0.64), (0.085, 0.08, 0.06), 'RobeDark', 'chest', seg=10, rings=6)
        for k in range(3):
            prim('cone', (0.17 * s + 0.03 * (k - 1), 0.0, 0.7), (0.012, 0.012, 0.05), 'Bone', 'chest', v=4)
        prim('sphere', (0.2 * s, -0.06, 0.62), (0.035, 0.03, 0.035), 'Bone', 'chest', seg=6, rings=5)
        prim('sphere', (0.21 * s, -0.09, 0.625), (0.008, 0.005, 0.008), 'Eye', 'chest', seg=4, rings=3)
    # high collar behind the head
    slab([(-0.14, 0.04, 0.66), (-0.18, 0.08, 0.9), (0.0, 0.1, 0.84), (0.18, 0.08, 0.9), (0.14, 0.04, 0.66)], 'RobeDark', 'chest',
         thick=0.02, axis=Vector((0, 1, 0)))
    # skull face with a crown
    prim('sphere', (0, -0.02, 0.8), (0.085, 0.09, 0.095), 'Bone', 'head', seg=10, rings=8)
    prim('cube', (0, -0.07, 0.73), (0.07, 0.06, 0.04), 'Bone', 'head')
    for s in S:
        prim('sphere', (0.032 * s, -0.095, 0.805), (0.022, 0.012, 0.022), 'RobeDark', 'head', seg=6, rings=4)
        prim('sphere', (0.032 * s, -0.103, 0.805), (0.012, 0.006, 0.012), 'Eye', 'head', seg=6, rings=4)
    for k in range(-2, 3):
        prim('cube', (0.012 * k, -0.1, 0.72), (0.007, 0.006, 0.014), 'RobeDark' if k == 0 else 'Bone', 'head')
    prim('cyl', (0, -0.015, 0.875), (0.09, 0.095, 0.025), 'Gold', 'head', v=10)
    for k in range(6):
        a = k / 6 * math.tau
        prim('cone', (math.sin(a) * 0.088, -0.015 - math.cos(a) * 0.092, 0.92), (0.018, 0.018, 0.06 if k == 0 else 0.04), 'Gold', 'head', v=4)
    prim('ico', (0, -0.11, 0.9), (0.014, 0.008, 0.014), 'Trim', 'head', sub=1)
    # bony arms in wide sleeves
    for s in S:
        side = sd(s)
        between((0.17 * s, 0, 0.62), (0.21 * s, 0, 0.5), 0.05, 'Robe', f'arm_upper_{side}', v=6)
        between((0.21 * s, 0, 0.5), (0.225 * s, -0.01, 0.39), 0.05, 'Robe', f'arm_lower_{side}', v=6, r2=0.08)
        between((0.225 * s, -0.01, 0.395), (0.226 * s, -0.01, 0.385), 0.082, 'Trim', f'arm_lower_{side}', v=6)
        for k in (-1, 0, 1):
            between((0.225 * s, -0.012, 0.37), (0.225 * s + 0.016 * k, -0.02, 0.3), 0.008, 'Bone', f'arm_lower_{side}', v=4)
    prim('ico', (0.225, -0.03, 0.31), (0.035, 0.035, 0.035), 'Flame', 'arm_lower_L', sub=1)  # spell in the left hand
    # staff topped with a horned skull and a green flame
    tilt = 1.1
    hand = Vector((-0.225, -0.012, 0.335))
    D = Vector((0, -math.sin(tilt), math.cos(tilt)))
    top = hand + D * 0.62
    curve_tube([tuple(hand - D * 0.38), tuple(hand + D * 0.15 + Vector((0.012, 0, 0))), tuple(hand + D * 0.42 - Vector((0.012, 0, 0))), tuple(top)],
               [1, 1, 1, 1.2], 0.016, 'Wood', 'arm_lower_R')
    prim('sphere', tuple(top + D * 0.04), (0.045, 0.045, 0.045), 'Bone', 'arm_lower_R', seg=8, rings=6)
    for s in S:
        curve_tube([tuple(top + D * 0.05 + Vector((0.03 * s, 0, 0))), tuple(top + D * 0.1 + Vector((0.08 * s, 0, 0))),
                    tuple(top + D * 0.16 + Vector((0.07 * s, 0, 0)))], [1, 0.6, 0.05], 0.014, 'Bone', 'arm_lower_R')
    prim('ico', tuple(top + D * 0.13), (0.05, 0.05, 0.06), 'Flame', 'arm_lower_R', sub=1)
    body, rig = C.build('Lich', C.humanoid_bones(arm_x=0.17, elbow_x=0.21, hand=(0.225, 0.335), leg_x=0.08, hip_z=0.32, knee_z=0.15,
                                                 chest_z=0.46, neck_z=0.68, head_top=0.98, shoulder_z=0.62, elbow_z=0.5))

    def float_base(P, ph, amp=0.03):
        P['root'].location.y = 0.1 + amp * math.sin(ph * 2)
        pose(P, leg_upper_L_x=0.2 + 0.15 * math.sin(ph * 2), leg_upper_R_x=0.2 + 0.15 * math.sin(ph * 2 + 1.5))

    def idle(t, P):
        ph = t * math.tau
        float_base(P, ph)
        pose(P, chest_x=0.05 + 0.03 * math.sin(ph * 2), head_x=-0.05, head_y=0.25 * math.sin(ph),
             arm_upper_R=(-0.1, 0, 0.1), arm_lower_R_x=-tilt + 0.1,
             arm_upper_L=(-0.4, 0.4, -0.1), arm_lower_L_x=-1.1 - 0.2 * math.sin(ph * 3))

    def walk(t, P):
        ph = t * math.tau
        float_base(P, ph, 0.02)
        pose(P, hips_x=0.15, chest_x=0.15, head_x=-0.15, leg_upper_L_x=0.6, leg_upper_R_x=0.6,
             arm_upper_R=(-0.15, 0, 0.1), arm_lower_R_x=-tilt + 0.1, arm_upper_L=(-0.6, 0, -0.2), arm_lower_L_x=-0.9)

    def cast(t, P):
        # gather both arms high, then fling them wide: the ring of bolts
        ru, rz, lu, lz, el, lean = keyed(t, [(0, -0.1, 0.1, -0.4, -0.1, -1.1, 0.05), (0.4, -2.6, 0.2, -2.6, -0.2, -0.3, -0.25),
                                             (0.5, -1.2, 1.3, -1.2, -1.3, -0.1, 0.2), (0.8, -1.1, 1.2, -1.1, -1.2, -0.1, 0.15),
                                             (1, -0.1, 0.1, -0.4, -0.1, -1.1, 0.05)])
        float_base(P, t * math.tau)
        pose(P, arm_upper_R=(ru, 0, rz), arm_lower_R_x=-tilt * 0.5 + el * 0.5, arm_upper_L=(lu, 0, lz), arm_lower_L_x=el,
             chest_x=lean, head_x=-lean)

    def orbs(t, P):
        # left palm thrust toward the target
        lu, le, lean = keyed(t, [(0, -0.4, -1.1, 0.05), (0.35, 0.3, -1.9, -0.15), (0.55, -1.6, -0.05, 0.3), (0.8, -1.5, -0.1, 0.25), (1, -0.4, -1.1, 0.05)])
        float_base(P, t * math.tau)
        pose(P, arm_upper_L=(lu, 0.1, -0.1), arm_lower_L_x=le, chest_x=lean, chest_y=-0.3 * lean, head_x=-lean * 0.5,
             arm_upper_R=(-0.2, 0, 0.1), arm_lower_R_x=-tilt)

    def summon(t, P):
        # staff and hand raised to the ceiling, head thrown back
        up = keyed(t, [(0, 0.0), (0.45, 1.0), (0.8, 1.0), (1, 0.0)])[0]
        float_base(P, t * math.tau, 0.03 + 0.05 * up)
        pose(P, arm_upper_R=(-0.1 - 2.4 * up, 0, 0.1 + 0.3 * up), arm_lower_R_x=-tilt + 0.9 * up,
             arm_upper_L=(-0.4 - 2.3 * up, 0, -0.1 - 0.3 * up), arm_lower_L_x=-1.1 + 1.0 * up,
             chest_x=0.05 - 0.3 * up, head_x=-0.05 - 0.4 * up)

    def roar(t, P):
        up = keyed(t, [(0, 0.0), (0.3, 1.0), (0.8, 1.0), (1, 0.0)])[0]
        j = 0.05 * math.sin(t * math.tau * 5) * up
        float_base(P, t * math.tau)
        pose(P, arm_upper_R=(-0.1 - 0.6 * up, 0, 0.1 + 1.2 * up), arm_lower_R_x=-tilt + 0.5 * up,
             arm_upper_L=(-0.4 - 0.3 * up, 0, -0.1 - 1.3 * up), arm_lower_L_x=-1.1 + 0.8 * up + j,
             chest_x=0.05 - 0.25 * up, head_x=-0.05 - 0.35 * up + j)

    return body, rig, [('Idle', 48, idle), ('Walk', 24, walk), ('Cast', 19, cast), ('Orbs', 14, orbs), ('Summon', 19, summon),
                       ('Roar', 30, roar)], 0.55


# ======================================================================= GOLEM
def golem():
    mat('Stone', (0.46, 0.43, 0.4), rough=0.95); mat('StoneDark', (0.3, 0.28, 0.27), rough=0.95)
    mat('Moss', (0.25, 0.42, 0.14), rough=1.0); mat('Crystal', (0.55, 0.85, 1.0), glow=(0.35, 0.75, 1.0), glow_strength=2)
    mat('Core', (1.0, 0.55, 0.1), glow=(1.0, 0.45, 0.05), glow_strength=6)
    mat('Eye', (1.0, 0.7, 0.2), glow=(1.0, 0.6, 0.1), glow_strength=8)
    seed = iter(range(1000))
    def rock(loc, scale, material, bone, amount=0.16, sub=1):
        return rocky(prim('ico', loc, scale, material, bone, sub=sub), next(seed), amount)
    # short, heavy legs
    for s in S:
        side = sd(s)
        x = 0.13 * s
        rock((x, -0.03, 0.05), (0.11, 0.14, 0.06), 'StoneDark', f'leg_lower_{side}')
        rock((x, 0.0, 0.13), (0.085, 0.085, 0.08), 'Stone', f'leg_lower_{side}')
        rock((x, 0.0, 0.25), (0.1, 0.1, 0.09), 'Stone', f'leg_upper_{side}')
    rock((0, 0.0, 0.34), (0.22, 0.16, 0.1), 'StoneDark', 'hips')
    # barrel chest leaning forward, huge shoulders
    rock((0, 0.02, 0.56), (0.27, 0.2, 0.2), 'Stone', 'chest', 0.12, sub=2)
    rock((0, 0.07, 0.7), (0.22, 0.16, 0.12), 'Stone', 'chest')
    rock((0, -0.12, 0.47), (0.15, 0.08, 0.1), 'StoneDark', 'chest')
    prim('ico', (0, -0.19, 0.6), (0.05, 0.03, 0.06), 'Core', 'chest', sub=1)
    for a, b in (((0.0, -0.18, 0.6), (0.09, -0.16, 0.7)), ((0.0, -0.18, 0.6), (-0.1, -0.17, 0.52)), ((0.0, -0.18, 0.6), (0.06, -0.16, 0.46))):
        between(a, b, 0.008, 'Core', 'chest', v=4)  # glowing cracks
    for s in S:
        rock((0.3 * s, 0.02, 0.72), (0.14, 0.13, 0.12), 'Stone', 'chest')
        rock((0.26 * s, 0.05, 0.8), (0.11, 0.1, 0.05), 'Moss', 'chest', 0.1)
        for k in range(2):
            prim('cone', (0.27 * s + 0.05 * k * s, 0.08 - 0.05 * k, 0.83), (0.02, 0.02, 0.07 - 0.02 * k), 'Crystal', 'chest', v=5,
                 rot=(math.radians(15), math.radians(-20 * s), 0))
    rock((0.02, 0.12, 0.78), (0.12, 0.08, 0.06), 'Moss', 'chest', 0.1)
    # small head sunk between the shoulders
    rock((0, -0.1, 0.8), (0.09, 0.085, 0.085), 'Stone', 'head')
    prim('cube', (0, -0.18, 0.84), (0.16, 0.05, 0.035), 'StoneDark', 'head', rot=(math.radians(-15), 0, 0))
    for s in S:
        prim('sphere', (0.035 * s, -0.18, 0.81), (0.02, 0.01, 0.014), 'Eye', 'head', seg=6, rings=4)
    prim('cube', (0, -0.17, 0.76), (0.08, 0.03, 0.02), 'Core', 'head')  # glowing mouth slit
    # long arms ending in boulder fists
    for s in S:
        side = sd(s)
        rock((0.36 * s, 0.0, 0.6), (0.09, 0.09, 0.12), 'Stone', f'arm_upper_{side}')
        rock((0.4 * s, -0.02, 0.4), (0.08, 0.08, 0.11), 'Stone', f'arm_lower_{side}')
        rock((0.42 * s, -0.03, 0.24), (0.12, 0.12, 0.11), 'StoneDark', f'arm_lower_{side}', 0.12)
        prim('cone', (0.4 * s, 0.05, 0.44), (0.018, 0.018, 0.05), 'Crystal', f'arm_lower_{side}', rot=(math.radians(-60), 0, 0), v=5)
    # a boulder torn from the floor, only shown while throwing
    rock((-0.42, -0.1, 0.24), (0.13, 0.12, 0.12), 'StoneDark', 'boulder', 0.2)
    bones = C.humanoid_bones(arm_x=0.32, elbow_x=0.39, hand=(0.42, 0.26), leg_x=0.13, hip_z=0.32, knee_z=0.17,
                             chest_z=0.42, neck_z=0.74, head_top=0.92, shoulder_z=0.72, elbow_z=0.5)
    bones = [b for b in bones if b[0] != 'cape'] + [('boulder', (-0.42, -0.1, 0.24), (-0.42, -0.1, 0.36), 'arm_lower_R')]
    body, rig = C.build('Golem', bones)

    def arms(P, lu, le, ru, re, lz=-0.15, rz=0.15):
        pose(P, arm_upper_L=(lu, 0, lz), arm_lower_L_x=le, arm_upper_R=(ru, 0, rz), arm_lower_R_x=re)

    def hide_boulder(P):
        P['boulder'].scale = (0, 0, 0)

    def idle(t, P):
        ph = t * math.tau
        b = math.sin(ph * 2)
        pose(P, chest_x=0.18 + 0.03 * b, head_x=-0.15, head_y=0.15 * math.sin(ph))
        arms(P, 0.05 + 0.03 * b, -0.25, 0.05 + 0.03 * b, -0.25)
        P['root'].location.y = -0.01 * (1 - b)
        hide_boulder(P)

    def walk(t, P):
        ph = t * math.tau
        s = math.sin(ph)
        pose(P, leg_upper_L_x=-0.4 * s, leg_upper_R_x=0.4 * s,
             leg_lower_L_x=0.1 + 0.5 * max(0.0, math.sin(ph + 1.9)), leg_lower_R_x=0.1 + 0.5 * max(0.0, math.sin(ph + 1.9 + math.pi)),
             hips_z=0.12 * s, chest_z=-0.15 * s, chest_y=0.08 * s, chest_x=0.22, head_x=-0.18)
        arms(P, 0.35 * s, -0.35, -0.35 * s, -0.35)
        P['root'].location.y = 0.03 * abs(math.cos(ph)) - 0.02  # heavy stomp
        hide_boulder(P)

    def windup(t, P):
        # crouch, shoulder forward, fists back: about to charge
        k = keyed(t, [(0, 0.0), (0.6, 1.0), (1, 1.0)])[0]
        j = 0.03 * math.sin(t * math.tau * 4) * k
        pose(P, chest_x=0.2 + 0.4 * k, head_x=-0.15 - 0.35 * k, chest_y=0.2 * k + j,
             leg_upper_L_x=-0.5 * k, leg_lower_L_x=0.6 * k, leg_upper_R_x=0.35 * k, leg_lower_R_x=0.3 * k)
        arms(P, 0.05 + 0.9 * k, -0.25 - 0.4 * k, 0.05 + 0.9 * k, -0.25 - 0.4 * k)
        P['root'].location.y = -0.05 * k
        hide_boulder(P)

    def charge(t, P):
        ph = t * math.tau
        s = math.sin(ph)
        pose(P, leg_upper_L_x=-0.7 * s - 0.2, leg_upper_R_x=0.7 * s - 0.2,
             leg_lower_L_x=0.2 + 0.7 * max(0.0, math.sin(ph + 1.9)), leg_lower_R_x=0.2 + 0.7 * max(0.0, math.sin(ph + 1.9 + math.pi)),
             chest_x=0.65, head_x=-0.5, chest_z=-0.1 * s)
        arms(P, 1.0 + 0.2 * s, -0.5, 1.0 - 0.2 * s, -0.5)
        P['root'].location.y = 0.04 * abs(math.cos(ph)) - 0.04
        hide_boulder(P)

    def stun(t, P):
        # slumped and dazed, swaying in a slow circle
        ph = t * math.tau
        pose(P, chest_x=0.45 + 0.08 * math.sin(ph), chest_y=0.2 * math.cos(ph), head_x=0.35 + 0.1 * math.sin(ph * 2), head_z=0.3 * math.cos(ph),
             leg_upper_L_x=-0.3, leg_lower_L_x=0.5, leg_upper_R_x=-0.3, leg_lower_R_x=0.5)
        arms(P, -0.2, -0.05, -0.2, -0.05, -0.05, 0.05)
        P['root'].location.y = -0.07
        hide_boulder(P)

    def slam(t, P):
        # both fists overhead, then down on the floor
        up, el, lean = keyed(t, [(0, 0.05, -0.25, 0.18), (0.4, -2.9, -0.4, -0.2), (0.55, -1.1, -0.1, 0.75), (0.8, -1.0, -0.1, 0.7), (1, 0.05, -0.25, 0.18)],
                             lambda t0, k: k ** 0.4 if t0 == 0.4 else ease(k))
        pose(P, chest_x=lean, head_x=-lean * 0.6, leg_upper_L_x=-0.4 * max(0.0, lean - 0.2), leg_lower_L_x=0.6 * max(0.0, lean - 0.2),
             leg_upper_R_x=-0.4 * max(0.0, lean - 0.2), leg_lower_R_x=0.6 * max(0.0, lean - 0.2))
        arms(P, up, el, up, el, -0.35, 0.35)
        P['root'].location.y = -0.08 * max(0.0, lean - 0.2)
        hide_boulder(P)

    def throw(t, P):
        # reach down, tear out a boulder, heave it overhead and throw
        ru, re, lean = keyed(t, [(0, 0.05, -0.25, 0.18), (0.25, -0.5, -0.1, 0.75), (0.55, -2.8, -0.6, -0.2), (0.7, -1.0, -0.1, 0.45), (1, 0.05, -0.25, 0.18)])
        pose(P, chest_x=lean, head_x=-0.4 * lean, chest_y=-0.25 * max(0.0, 0.3 - lean), leg_upper_L_x=-0.3 * max(0.0, lean), leg_lower_L_x=0.4 * max(0.0, lean))
        arms(P, 0.05 - 0.5 * max(0.0, lean - 0.18), -0.3, ru, re)
        P['boulder'].scale = (1, 1, 1) if 0.2 <= t < 0.66 else (0, 0, 0)

    def roar(t, P):
        up = keyed(t, [(0, 0.0), (0.3, 1.0), (0.8, 1.0), (1, 0.0)])[0]
        j = 0.05 * math.sin(t * math.tau * 6) * up
        pose(P, chest_x=0.18 - 0.4 * up, head_x=-0.15 - 0.3 * up + j)
        arms(P, 0.05 - 0.6 * up, -0.25 - 0.9 * up + j, 0.05 - 0.6 * up, -0.25 - 0.9 * up - j, -0.15 - 1.1 * up, 0.15 + 1.1 * up)
        hide_boulder(P)

    return body, rig, [('Idle', 48, idle), ('Walk', 32, walk), ('Windup', 17, windup), ('Charge', 12, charge), ('Stun', 36, stun),
                       ('Slam', 22, slam), ('Throw', 20, throw), ('Roar', 30, roar)], 0.5


BUILDERS = dict(dragon=dragon, lich=lich, golem=golem)


def make(name, out_dir, preview_dir=None):
    C.reset()
    body, rig, actions, target_z = BUILDERS[name]()
    for act_name, frames, fn in actions:
        C.make_action(rig, act_name, frames, fn)
    if preview_dir:
        far = 1.6 if name == 'dragon' else 1.25
        front, side, high = [tuple(c * far for c in p) for p in ((0.9, -2.4, 1.3), (2.4, -0.6, 0.9), (0.5, -2.2, 2.3))]
        shots = [(f'{name}-front', front, 'Idle', 9), (f'{name}-high', high, 'Idle', 9), (f'{name}-walk', side, 'Walk', 4)]
        for a, n, _ in actions[2:]:
            shots += [(f'{name}-{a.lower()}{i}', side if i else front, a, 1 + round(n * k)) for i, k in enumerate((0.45, 0.6))]
        C.render_previews(preview_dir, rig, shots, target_z)
    C.export(os.path.join(out_dir, f'{name}.glb'), body, rig)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    which, out = args[0], args[1]
    prev = args[2] if len(args) > 2 else None
    for n in (BUILDERS if which == 'all' else which.split(',')):
        make(n, out, prev)
