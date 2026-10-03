"""Finishing & building materials: tiles, doors, flooring, paint, bags, boards, bricks, tools."""
import math
import random
import bpy
from studio import (loft, lathe, box, cylinder, sphere, torus, tube, poly_tube, material, ceramic, matte_ceramic,
                    chrome, gold, black_metal, brushed, plastic, glass, frosted_glass, wood, marble, stone, srgb,
                    fabric_bag, image_material, top_face_uv, transform, boolean, mesh_object)


# ------------------------------------------------------------------ tiles

def tile_material(kind, color=None, seed=0.0):
    kinds = {
        'calacatta': lambda: marble('Tile', base='#F3F1EC', vein='#7D776F', vein2='#D8CDB8', scale=1.6, seed=seed),
        'carrara': lambda: marble('Tile', base='#EEEFEF', vein='#9A9EA3', vein2='#DADDE0', scale=2.2, vein_width=0.06, seed=seed, warp=10),
        'nero': lambda: marble('Tile', base='#1E1E20', vein='#D9D6D0', vein2='#2A2A2D', scale=1.6, seed=seed, vein_width=0.012),
        'onyx': lambda: marble('Tile', base='#E9D9BE', vein='#B88F5C', vein2='#F3E8D3', scale=1.4, vein_width=0.08, seed=seed),
        'emerald': lambda: marble('Tile', base='#1F4D3F', vein='#CFDCD2', vein2='#2A5E4E', scale=1.6, seed=seed, vein_width=0.015),
        'concrete': lambda: stone('Tile', light='#A9A8A3', dark='#85847F', scale=2.5, roughness=0.7),
        'graphite': lambda: stone('Tile', light='#595B5E', dark='#3F4144', scale=2.5, roughness=0.6),
        'travertine': lambda: stone('Tile', light='#E2D3BB', dark='#C5B293', scale=2.0, roughness=0.5, speckle=0.04, speckle_color='#B49F7E'),
        'terrazzo': lambda: stone('Tile', light='#EDEAE4', dark='#E0DCD4', scale=1.0, roughness=0.3, speckle=0.12, speckle_color='#9A7F6A', coat=0.4),
        'cement_beige': lambda: stone('Tile', light='#D8CFC2', dark='#C3B8A9', scale=2.0, roughness=0.75),
        'oak_look': lambda: wood('Tile', light='#C49A6C', dark='#8F6640', scale=4, roughness=0.55, coat=0.0, seed=seed),
        'walnut_look': lambda: wood('Tile', light='#7E5737', dark='#4E3220', scale=4, roughness=0.55, coat=0.0, seed=seed),
        'gray_wood_look': lambda: wood('Tile', light='#B4AEA6', dark='#857F78', scale=4, roughness=0.6, coat=0.0, seed=seed),
    }
    if kind in kinds:
        return kinds[kind]()
    if kind == 'glossy':
        return ceramic(color or '#F2F2EF', 'Tile')
    if kind == 'matte':
        return matte_ceramic(color or '#D9D6D0', 'Tile')
    return ceramic('#F2F2EF', 'Tile')


def tile_slab(name, w, h, t, mat, location, rotation=(0, 0, 0), bevel=0.0015):
    obj = box(name, (w, h, t), location, mat, bevel=bevel, segments=2, rotation=rotation)
    return obj


def tile_display(kind, size=(0.6, 0.6), thickness=0.009, color=None, count=3):
    """Product shot for floor/wall tiles: one tile flat, two leaning on a small stack."""
    w, h = size
    parts = []
    big = max(w, h)
    for i in range(count):
        m = tile_material(kind, color, seed=i * 3.1)
        if i == 0:
            parts.append(tile_slab('Flat', w, h, thickness, m, (0.0, -0.18 * big, thickness / 2 + 0.03 * big * 0), rotation=(0, 0, math.radians(-14))))
        else:
            ang = math.radians(78 - i * 2)
            off = (i - 1) * 0.55 * big - 0.25 * big
            parts.append(tile_slab('Lean%d' % i, w, h, thickness, m,
                                   (off, 0.35 * big + 0.04 * i, math.sin(ang) * h / 2 + 0.002),
                                   rotation=(ang, 0, math.radians(6 - 10 * i))))
    stack_m = tile_material(kind, color, seed=9.0)
    for j in range(5):
        parts.append(tile_slab('Stack%d' % j, w * 0.98, h * 0.98, thickness, stack_m,
                               (0.62 * big, -0.05 * big, thickness / 2 + j * thickness * 1.02),
                               rotation=(0, 0, math.radians(18 + j * 0.6))))
    return parts


def tile_panel(kind='glossy', color='#F4F4F2', tile=(0.075, 0.15), cols=8, rows=6, grout='#DCDAD6', pattern='brick',
               hexagon=False, bevel=0.003, depth=0.008):
    """Wall tile sample board (subway, mosaic, hexagon) with grout lines, leaning slightly back."""
    tw, th = tile
    gap = 0.002
    if hexagon:
        width = cols * tw * 0.87
        height = rows * th * 0.75
    else:
        width, height = cols * (tw + gap), rows * (th + gap)
    gm = material('Grout', srgb(grout), 0.85)
    parts = [box('Board', (width + 0.01, 0.01, height + 0.01), (0, 0.005, height / 2), gm)]
    mats = []
    if isinstance(color, (list, tuple)):
        for k, c in enumerate(color):
            mats.append(ceramic(c, 'TileC%d' % k) if kind == 'glossy' else matte_ceramic(c, 'TileC%d' % k))
    else:
        mats.append(tile_material(kind, color))
    rnd = random.Random(7)
    if hexagon:
        r = tw / 2
        for row in range(rows):
            for col in range(cols):
                x = -width / 2 + r + col * tw * 0.87 + (0 if row % 2 == 0 else tw * 0.435)
                z = r + row * th * 0.75
                if x > width / 2 - r * 0.5:
                    continue
                o = cylinder('Hex', r * 0.985, depth, (x, -depth / 2, z), rnd.choice(mats), vertices=6,
                             rotation=(math.pi / 2, 0, math.pi / 6), bevel=bevel * 0.6)
                o.rotation_euler = (math.pi / 2, math.pi / 6, 0)
                parts.append(o)
    else:
        for row in range(rows):
            offset = (tw + gap) / 2 if (pattern == 'brick' and row % 2) else 0
            for col in range(-1, cols + 1):
                x = -width / 2 + (tw + gap) / 2 + col * (tw + gap) + offset
                left, right = x - tw / 2, x + tw / 2
                if right < -width / 2 + 0.001 or left > width / 2 - 0.001:
                    continue
                cl, cr = max(left, -width / 2), min(right, width / 2)
                if cr - cl < 0.01:
                    continue
                z = (th + gap) / 2 + row * (th + gap)
                parts.append(box('T', (cr - cl, depth, th), ((cl + cr) / 2, -depth / 2, z), rnd.choice(mats), bevel=bevel, segments=3))
    return transform(parts, rotation=(-8, 0, 0)), parts


# ------------------------------------------------------------------ doors

def door_leaf_material(finish):
    finishes = {
        'white': lambda: plastic('#F2F1ED', 0.35, 'Leaf', coat=0.2),
        'ivory': lambda: plastic('#ECE4D4', 0.35, 'Leaf', coat=0.2),
        'gray': lambda: plastic('#8D8F91', 0.45, 'Leaf'),
        'graphite': lambda: plastic('#3B3D40', 0.4, 'Leaf'),
        'oak': lambda: wood('Leaf', light='#C8A274', dark='#A27A4D', scale=2.2, along='Z', roughness=0.5, coat=0.15, straight=True),
        'bleached_oak': lambda: wood('Leaf', light='#E0CDAF', dark='#C7AE8C', scale=2.2, along='Z', roughness=0.5, coat=0.1, straight=True),
        'walnut': lambda: wood('Leaf', light='#7A5233', dark='#55371F', scale=2.2, along='Z', roughness=0.45, coat=0.2, straight=True),
        'wenge': lambda: wood('Leaf', light='#4A3829', dark='#2A1E15', scale=2.6, along='Z', roughness=0.5, coat=0.1, straight=True),
    }
    return finishes.get(finish, finishes['white'])()


def door_interior(finish='white', style='panel', glass_kind=None, handle='chrome', width=0.8, height=2.0):
    """Interior door in its frame with architraves (camera sees the front)."""
    m = door_leaf_material(finish)
    hm = {'chrome': chrome('Handle'), 'black': black_metal('Handle'), 'gold': gold('Handle')}[handle]
    w, h, t = width, height, 0.04
    parts = []
    # frame + architrave
    for x in (-w / 2 - 0.035, w / 2 + 0.035):
        parts.append(box('Jamb', (0.07, 0.11, h + 0.07), (x, 0.02, (h + 0.07) / 2), m, bevel=0.003))
    parts.append(box('Head', (w + 0.14, 0.112, 0.074), (0, 0.02, h + 0.037), m, bevel=0.003))
    leaf = box('Leaf', (w, t, h), (0, 0, h / 2), m, bevel=0.002)
    parts.append(leaf)
    if style == 'panel':
        for zc, ph in ((h * 0.72, h * 0.42), (h * 0.27, h * 0.40)):
            parts.append(box('PanelGroove', (w - 0.2, 0.006, ph), (0, -t / 2 - 0.001, zc), material('Shadow', srgb('#000000'), 0.9) if False else m, bevel=0.012, segments=4))
            parts.append(box('PanelRaise', (w - 0.26, 0.012, ph - 0.06), (0, -t / 2 - 0.004, zc), m, bevel=0.018, segments=5))
    elif style == 'grooves':
        dark = material('Groove', srgb('#2A2A2A'), 0.8)
        for k in range(1, 4):
            parts.append(box('Groove', (w - 0.004, 0.003, 0.006), (0, -t / 2 - 0.0005, h * k / 4), dark))
    elif style == 'vertical_glass':
        gm = frosted_glass('DoorGlass') if glass_kind != 'clear' else glass('DoorGlass')
        parts.append(box('Glass', (0.12, t + 0.004, h - 0.4), (w / 2 - 0.2, 0, h / 2), gm))
        parts.append(box('GlassTrim', (0.13, t + 0.006, 0.01), (w / 2 - 0.2, 0, 0.2), hm))
        parts.append(box('GlassTrim2', (0.13, t + 0.006, 0.01), (w / 2 - 0.2, 0, h - 0.2), hm))
    elif style == 'glass_panels':
        gm = frosted_glass('DoorGlass')
        for zc in (h * 0.78, h * 0.5):
            parts.append(box('Glass', (w - 0.24, t + 0.004, h * 0.22), (0, 0, zc), gm))
            parts.append(box('Bead', (w - 0.22, t + 0.006, 0.02), (0, 0, zc + h * 0.11), m, bevel=0.004))
            parts.append(box('Bead', (w - 0.22, t + 0.006, 0.02), (0, 0, zc - h * 0.11), m, bevel=0.004))
        parts.append(box('PanelRaise', (w - 0.26, 0.012, h * 0.3), (0, -t / 2 - 0.004, h * 0.2), m, bevel=0.018, segments=5))
    # handle on rose
    hx = w / 2 - 0.07
    parts.append(cylinder('Rose', 0.026, 0.01, (hx, -t / 2 - 0.005, 1.0), hm, rotation=(math.pi / 2, 0, 0), bevel=0.002))
    parts.append(tube('Lever', [(hx, -t / 2 - 0.01, 1.0), (hx, -t / 2 - 0.055, 1.0), (hx - 0.03, -t / 2 - 0.065, 1.0),
                                (hx - 0.13, -t / 2 - 0.065, 1.0)], 0.0085, hm))
    parts.append(cylinder('Escut', 0.016, 0.008, (hx, -t / 2 - 0.004, 0.88), hm, rotation=(math.pi / 2, 0, 0)))
    for z in (0.2, h - 0.2):
        parts.append(cylinder('Hinge', 0.007, 0.1, (-w / 2 - 0.001, -t / 2, z), hm))
    return parts


def door_entrance(color='#3A2F2A', pattern='squares', handle='black', finish='metal', width=0.96, height=2.05):
    """Steel entrance door with milled decorative panel, two locks and peephole."""
    if finish == 'oak':
        panel_m = wood('Panel', light='#9C7046', dark='#74502F', scale=2.2, along='Z', roughness=0.45, coat=0.25, straight=True)
    elif finish == 'white':
        panel_m = plastic('#EEECE7', 0.35, 'Panel', coat=0.2)
    elif finish == 'concrete':
        panel_m = stone('Panel', light='#8E8D8A', dark='#6E6D6A', scale=3, roughness=0.75)
    else:
        panel_m = material('Panel', srgb(color), 0.45, metallic=0.4, coat=0.3, coat_roughness=0.25)
    frame_m = material('Frame', srgb('#2A2A2C'), 0.5, metallic=0.5, coat=0.2)
    hm = {'chrome': chrome('Handle'), 'black': black_metal('Handle'), 'gold': gold('Handle')}[handle]
    w, h, t = width, height, 0.07
    parts = [box('Frame', (w + 0.1, t + 0.02, h + 0.05), (0, 0.01, (h + 0.05) / 2), frame_m, bevel=0.004)]
    parts.append(box('Leaf', (w - 0.01, 0.012, h - 0.04), (0, -t / 2 - 0.004, h / 2), panel_m, bevel=0.004))
    deco = material('Deco', srgb(color), 0.3, metallic=0.6) if finish == 'metal' else panel_m
    if pattern == 'squares':
        for zc in (h * 0.72, h * 0.32):
            parts.append(box('Mill', (w - 0.24, 0.006, h * 0.32), (0, -t / 2 - 0.012, zc), deco, bevel=0.02, segments=4))
    elif pattern == 'lines':
        dark = material('Groove', srgb('#1A1A1A'), 0.7)
        for k in range(9):
            parts.append(box('Line', (0.012, 0.004, h - 0.3), (-w / 2 + 0.16 + k * (w - 0.32) / 8, -t / 2 - 0.011, h / 2), dark))
    elif pattern == 'diamond':
        for k in range(5):
            o = box('Dia', (0.18, 0.006, 0.18), (0, -t / 2 - 0.012, 0.35 + k * 0.33), deco, bevel=0.01, rotation=(0, math.radians(45), 0))
            parts.append(o)
    # handle bar or lever
    hx = w / 2 - 0.09
    parts.append(box('Plate', (0.05, 0.012, 0.28), (hx, -t / 2 - 0.016, 1.0), hm, bevel=0.004))
    parts.append(tube('Lever', [(hx, -t / 2 - 0.02, 1.04), (hx, -t / 2 - 0.06, 1.04), (hx - 0.13, -t / 2 - 0.065, 1.04)], 0.009, hm))
    parts.append(cylinder('Cyl', 0.014, 0.012, (hx, -t / 2 - 0.022, 0.93), chrome('Lock'), rotation=(math.pi / 2, 0, 0)))
    parts.append(cylinder('Lock2', 0.02, 0.012, (hx, -t / 2 - 0.016, 1.34), hm, rotation=(math.pi / 2, 0, 0)))
    parts.append(cylinder('Peep', 0.011, 0.012, (0, -t / 2 - 0.014, 1.55), chrome('Peep'), rotation=(math.pi / 2, 0, 0)))
    return parts


# ---------------------------------------------------------------- flooring

def plank(name, L, W, T, mat, location, rotation=(0, 0, 0), bevel=0.0012):
    return box(name, (L, W, T), location, mat, bevel=bevel, segments=2, rotation=rotation)


def flooring(kind='oak', light=None, dark=None, plank_size=(1.2, 0.19, 0.012), herringbone=False, vinyl=False):
    """Floor planks partially laid in a pattern plus a loose stack — classic flooring product shot."""
    L, W, T = plank_size
    tones = {
        'oak': ('#C9A06E', '#97703F'), 'natural_oak': ('#D6B88D', '#AD8B5E'), 'smoked_oak': ('#8C6A4C', '#5E4330'),
        'walnut': ('#7C5536', '#4A2F1D'), 'ash_gray': ('#B9B2A8', '#8C857B'), 'white_oak': ('#E3D5BF', '#C0AC8D'),
        'cherry': ('#A0583A', '#6B3523'), 'stone_gray': None,
    }
    parts = []
    rnd = random.Random(3)

    def plank_mat(i):
        if kind == 'stone_gray':
            return stone('Pl%d' % i, light='#A7A39C', dark='#8E8A84', scale=2, roughness=0.55)
        lt, dk = tones.get(kind, tones['oak'])
        return wood('Pl%d' % i, light=light or lt, dark=dark or dk, scale=4.0, roughness=0.5 if not vinyl else 0.4,
                    coat=0.3 if not vinyl else 0.15, seed=i * 1.37)

    mats = [plank_mat(i) for i in range(4)]
    if herringbone:
        # classic herringbone: staircase strands of horizontal + vertical planks,
        # strands repeat every (L, -L); the whole field is turned 45 degrees.
        Lh, Wh = 0.6, 0.1
        cos45 = math.cos(math.radians(45))
        for strand in range(-4, 5):
            ox, oy = strand * Lh, -strand * Lh
            for k in range(-10, 10):
                for (cx, cy, rot) in ((k * Wh + Lh / 2 + ox, k * Wh + Wh / 2 + oy, 0.0),
                                      (k * Wh + Wh / 2 + ox, (k + 1) * Wh + Lh / 2 + oy, 90.0)):
                    rx, ry = (cx - cy) * cos45, (cx + cy) * cos45
                    if abs(rx) > 0.62 or abs(ry) > 0.45:
                        continue
                    parts.append(plank('H', Lh - 0.002, Wh - 0.002, T, rnd.choice(mats), (rx, ry, T / 2),
                                       rotation=(0, 0, math.radians(45 + rot))))
    else:
        rows = 6
        for r in range(rows):
            offset = rnd.uniform(-0.6, 0.0)
            x = offset - 0.6
            while x < 0.9:
                seg = L if x + L <= 1.5 else 1.5 - x
                parts.append(plank('P', seg - 0.002, W - 0.002, T, rnd.choice(mats), (x + seg / 2, -0.55 + r * W, T / 2)))
                x += seg
    # loose stack of planks on top-right
    for j in range(6):
        parts.append(plank('S', L * 0.85, W, T, mats[j % 4], (0.25, 0.42 + j * 0.004, T * (j + 0.5) + 0.0005),
                           rotation=(0, 0, math.radians(-8 + j * 1.5))))
    return parts


def skirting(color='white', profile_h=0.08, count=4):
    m = plastic('#F2F1ED', 0.35, 'Skirt') if color == 'white' else wood('Skirt', light='#B88D5E', dark='#86603A', scale=4)
    parts = []
    for i in range(count):
        o = loft('Skirt%d' % i, [
            dict(z=0, rx=0.009, ry=profile_h / 2, n=6), dict(z=1.2, rx=0.009, ry=profile_h / 2, n=6)
        ], m, segments=24, subsurf=0)
        o.rotation_euler = (0, math.pi / 2, math.radians(10 * i))
        o.location = (-0.6, i * 0.03 - 0.05, 0.009 + profile_h / 2 * 0 + 0.01 + i * 0.0)
        o.rotation_euler = (math.radians(90), math.radians(90), math.radians(4 * i))
        o.location = (-0.6, 0.12 * i, profile_h / 2 + 0.0)
        parts.append(o)
    return parts


def underlay_roll(color='#9AA7B5'):
    m = plastic(color, 0.6, 'Foam')
    roll = cylinder('Roll', 0.18, 1.0, (0, 0, 0.18), m, rotation=(0, math.pi / 2, 0))
    core = cylinder('Core', 0.035, 1.004, (0, 0, 0.18), material('Core', srgb('#B48C5A'), 0.7), rotation=(0, math.pi / 2, 0))
    film = cylinder('Film', 0.183, 0.9, (0, 0, 0.18), material('Film', (0.9, 0.92, 0.95), 0.1, transmission=0.85), rotation=(0, math.pi / 2, 0))
    sheet = box('Sheet', (1.0, 0.7, 0.003), (0, -0.5, 0.0015), m)
    return [roll, core, film, sheet]


# ------------------------------------------------------------------ paint

def paint_pail(paint='#E8E2D6', label='#FFFFFF', accent='#E46A1C', size=10, lid=None, open_lid=False):
    """Plastic paint pail (2.5/5/10/15 L) with colored band label and handle."""
    scale = {2.5: 0.62, 3: 0.65, 5: 0.78, 9: 0.94, 10: 0.97, 14: 1.06, 15: 1.08, 20: 1.15}.get(size, 1.0)
    r, hgt = 0.135 * scale, 0.25 * scale
    body_m = plastic('#F6F6F4', 0.32, 'Pail')
    prof = [(r * 0.88, 0.0), (r * 0.9, 0.004), (r * 0.93, 0.02), (r, hgt * 0.92), (r * 1.02, hgt * 0.93),
            (r * 1.02, hgt * 0.97), (r * 1.0, hgt * 0.975), (r * 0.98, hgt * 0.975), (r * 0.98, hgt * 0.96)]
    parts = [lathe('Pail', prof, body_m, segments=72, subsurf=1)]
    parts.append(cylinder('Bottom', r * 0.9, 0.004, (0, 0, 0.002), body_m))
    # label band (slightly larger than wall)
    lm = plastic(label, 0.3, 'Label', coat=0.4)
    band = lathe('Band', [(r * 0.94 + 0.0015, hgt * 0.08), (r * 0.995 + 0.0015, hgt * 0.84)], lm, segments=72, subsurf=0)
    parts.append(band)
    am = plastic(accent, 0.3, 'Accent', coat=0.4)
    parts.append(lathe('Stripe', [(r * 0.955 + 0.0022, hgt * 0.22), (r * 0.975 + 0.0022, hgt * 0.5)], am, segments=72, subsurf=0))
    pm = plastic(paint, 0.25, 'PaintSwatch', coat=0.5)
    sw = lathe('Swatch', [(r * 0.98 + 0.0028, hgt * 0.55), (r * 0.99 + 0.0028, hgt * 0.75)], pm, segments=72, subsurf=0)
    parts.append(sw)
    lid_m = plastic(lid or accent, 0.3, 'Lid')
    if open_lid:
        paint_m = material('Paint', srgb(paint), 0.15, coat=0.6)
        parts.append(cylinder('PaintSurf', r * 0.97, 0.004, (0, 0, hgt * 0.9), paint_m))
        l = lathe('Lid', [(0.001, 0.0), (r * 1.04, 0.0), (r * 1.05, 0.012), (r * 0.97, 0.014), (0.001, 0.014)], lid_m, subsurf=0)
        l.location = (r * 2.2, -r * 0.4, 0.0)
        parts.append(l)
    else:
        parts.append(lathe('Lid', [(r * 1.035, hgt * 0.955), (r * 1.045, hgt * 0.97), (r * 1.04, hgt + 0.012),
                                   (r * 0.99, hgt + 0.016), (r * 0.9, hgt + 0.012), (0.001, hgt + 0.012)], lid_m, subsurf=1))
    hm = brushed('#B9BBBE', 0.35, 'Wire')
    hz = hgt * 0.86
    parts.append(tube('Handle', [(-r * 1.02, 0, hz), (-r * 1.0, -r * 0.3, hz + r * 0.5), (0, -r * 0.65, hz + r * 0.65),
                                 (r * 1.0, -r * 0.3, hz + r * 0.5), (r * 1.02, 0, hz)], 0.0022, hm))
    parts.append(cylinder('Grip', 0.012, 0.09, (0, -r * 0.64, hz + r * 0.66), plastic('#2B2B2B', 0.5, 'Grip'), rotation=(0, math.pi / 2, 0)))
    for x in (-1, 1):
        parts.append(cylinder('Ear', 0.012, 0.012, (x * r * 1.0, 0, hz), body_m, rotation=(0, math.pi / 2, 0)))
    return parts


def paint_can(paint='#2F6F8F', label='#1D2733', size=2.5, open_lid=False):
    """Metal tin (0.9–3 L) for enamel / varnish."""
    s = {0.9: 0.65, 1: 0.68, 2.5: 0.85, 3: 0.9}.get(size, 0.85)
    r, hgt = 0.09 * s, 0.17 * s
    tin = brushed('#C9CBCE', 0.25, 'Tin')
    parts = [lathe('Can', [(r, 0.0), (r * 1.02, 0.004), (r * 1.02, 0.01), (r, 0.014), (r, hgt - 0.012),
                           (r * 1.02, hgt - 0.008), (r * 1.02, hgt), (r * 0.9, hgt), (r * 0.9, hgt - 0.004), (0.001, hgt - 0.004)], tin, subsurf=0)]
    parts[0].data.polygons.foreach_set('use_smooth', [True] * len(parts[0].data.polygons))
    lm = plastic(label, 0.35, 'Label', coat=0.5)
    parts.append(lathe('Band', [(r + 0.0012, 0.02), (r + 0.0012, hgt - 0.018)], lm, segments=72, subsurf=0))
    pm = plastic(paint, 0.2, 'Swatch', coat=0.6)
    parts.append(lathe('Sw', [(r + 0.0018, hgt * 0.45), (r + 0.0018, hgt * 0.72)], pm, segments=72, subsurf=0))
    parts.append(tube('Bail', [(-r, 0, hgt * 0.8), (0, -r * 0.7, hgt * 1.25), (r, 0, hgt * 0.8)], 0.0015, tin))
    return parts


def canister(color='#FFFFFF', cap='#E46A1C', label='#2E7D5B', liters=10):
    """Jerrycan for primers / concentrates."""
    s = (liters / 10) ** (1 / 3)
    w, d, h = 0.26 * s, 0.16 * s, 0.32 * s
    body = plastic(color, 0.3, 'Can')
    parts = [loft('Jerry', [
        dict(z=0.0, rx=w / 2 * 0.96, ry=d / 2 * 0.96, n=4.5), dict(z=0.01, rx=w / 2, ry=d / 2, n=4.5),
        dict(z=h * 0.86, rx=w / 2, ry=d / 2, n=4.5), dict(z=h, rx=w / 2 * 0.9, ry=d / 2 * 0.86, n=4.0),
        dict(z=h + 0.004, rx=w / 2 * 0.86, ry=d / 2 * 0.8, n=3.5)], body, segments=64)]
    parts.append(box('Handle', (w * 0.5, 0.035, 0.05), (-w * 0.12, 0, h + 0.03), body, bevel=0.012))
    parts.append(cylinder('Neck', 0.026, 0.03, (w * 0.3, 0, h + 0.015), body))
    parts.append(cylinder('Cap', 0.03, 0.03, (w * 0.3, 0, h + 0.04), plastic(cap, 0.35, 'Cap'), bevel=0.003))
    lm = plastic(label, 0.35, 'Label', coat=0.3)
    parts.append(box('Label', (w * 0.82, 0.002, h * 0.55), (0, -d / 2 - 0.001, h * 0.45), lm, bevel=0.0005))
    parts.append(box('LabelBand', (w * 0.82, 0.0025, h * 0.08), (0, -d / 2 - 0.0015, h * 0.6), plastic('#FFFFFF', 0.3, 'LB')))
    return parts


def wallpaper_rolls(texture_path, base='#EDE7DC', count=3):
    """Wallpaper rolls with a partially unrolled sheet showing the pattern."""
    m = image_material('Paper', texture_path, roughness=0.55, scale=(1, 1), bump=0.02)
    parts = []
    for i in range(count):
        roll = cylinder('Roll%d' % i, 0.055, 0.53, (0.0, 0.0, 0.0), m)
        roll.rotation_euler = (0, math.pi / 2, math.radians(-25 + 18 * i))
        roll.location = (-0.15 + i * 0.03, 0.1 + i * 0.13, 0.055 + (0.105 if i == 2 else 0))
        if i == 2:
            roll.location = (-0.12, 0.17, 0.165)
        parts.append(roll)
    # unrolled sheet lying flat in front
    sheet = box('Sheet', (0.53, 0.9, 0.0015), (0.32, -0.25, 0.001), m)
    top_face_uv(sheet)
    parts.append(sheet)
    from studio import uv_unwrap
    for r in parts[:-1]:
        uv_unwrap(r, 'cube', 0.5)
    return parts


# ------------------------------------------------------------- bags & sacks

def bag(color='#9C9C98', band='#E46A1C', band2=None, length=0.62, width=0.42, thick=0.13, paper=True, stack=1):
    """Cement / dry-mix bag standing upright, front face to camera, with printed colour bands."""
    m = fabric_bag('Bag', color, 0.8 if paper else 0.55, 160 if paper else 90)
    bm = plastic(band, 0.5, 'BagBand')
    parts = []
    H = length
    for k in range(stack):
        x0 = k * (width * 1.05)
        rings = []
        steps = 16
        for i in range(steps + 1):
            u = i / steps
            edge = min(u, 1 - u) / 0.1
            f = min(1.0, edge) ** 0.45
            rings.append(dict(z=u * H, rx=width / 2 * (0.95 + 0.05 * f), ry=max(0.006, thick / 2 * f * (1 - 0.15 * u)),
                              cx=x0, n=2.4 if 0.08 < u < 0.92 else 3.0))
        o = loft('Bag%d' % k, rings, m, segments=56)
        parts.append(o)
        # printed bands wrap around the bag body (slightly proud of the surface)
        def band_ring(z0, z1, mat, name):
            rs = []
            for z in (z0, z1):
                u = z / H
                edge = min(u, 1 - u) / 0.1
                f = min(1.0, edge) ** 0.45
                rs.append(dict(z=z, rx=width / 2 * (0.95 + 0.05 * f) + 0.0025, ry=max(0.006, thick / 2 * f * (1 - 0.15 * u)) + 0.0025, cx=x0, n=2.4))
            return loft(name, rs, mat, segments=56, cap_start=False, cap_end=False, subsurf=1)
        parts.append(band_ring(H * 0.58, H * 0.74, bm, 'Band%d' % k))
        if band2:
            parts.append(band_ring(H * 0.5, H * 0.54, plastic(band2, 0.5, 'Band2'), 'BandB%d' % k))
        parts.append(band_ring(H * 0.16, H * 0.2, bm, 'BandC%d' % k))
    return parts


def drywall_stack(color='#E2E2DE', edge='#BDBDB8', count=6, moisture=False, fire=False):
    face = '#B9D2B4' if moisture else ('#E8B4A8' if fire else color)
    fm = fabric_bag('Paper', face, 0.85, 220)
    em = material('Gypsum', srgb('#F1EFEA'), 0.9)
    parts = []
    for i in range(count):
        o = box('Sheet%d' % i, (2.5, 1.2, 0.0125), (0, 0, 0.0125 / 2 + i * 0.0128), fm, bevel=0.003)
        o.rotation_euler = (0, 0, math.radians(1.5 * (i % 3) - 1.5))
        parts.append(o)
    lean = box('Lean', (2.5, 1.2, 0.0125), (0.1, 0.55, 0.6), fm, bevel=0.003)
    lean.rotation_euler = (math.radians(72), 0, 0)
    parts.append(lean)
    parts.append(box('Band', (0.04, 1.22, 0.0125 * count + 0.002), (-0.8, 0, 0.0125 * count / 2), plastic('#2B2B2B', 0.5, 'Strap')))
    parts.append(box('Band2', (0.04, 1.22, 0.0125 * count + 0.002), (0.8, 0, 0.0125 * count / 2), plastic('#2B2B2B', 0.5, 'Strap2')))
    return parts


def bricks(kind='red', layout='stack'):
    colors = {'red': ('#A4472D', '#8A3A24'), 'yellow': ('#D8B275', '#C49A5C'), 'brown': ('#6E3F2A', '#55301F'),
              'white': ('#E7E3DC', '#D6D1C8'), 'gray': ('#9C9A96', '#86847F')}
    lt, dk = colors.get(kind, colors['red'])
    rnd = random.Random(11)
    parts = []
    L, W, H = 0.25, 0.12, 0.065 if kind != 'facing' else 0.065
    mats = [stone('Brick%d' % i, light=lt, dark=dk, scale=6, roughness=0.85, bump=0.4) for i in range(3)]
    for layer in range(5):
        for row in range(3 if layer % 2 == 0 else 2):
            for col in range(2 if layer % 2 == 0 else 3):
                if layer % 2 == 0:
                    x, y = (col - 0.5) * (L + 0.005), (row - 1) * (W + 0.005)
                    rot = 0
                else:
                    x, y = (col - 1) * (W + 0.005), (row - 0.5) * (L + 0.005)
                    rot = math.pi / 2
                parts.append(box('B', (L, W, H), (x, y, H / 2 + layer * (H + 0.002)), rnd.choice(mats), bevel=0.004,
                                 rotation=(0, 0, rot + rnd.uniform(-0.02, 0.02))))
    parts.append(box('Loose', (L, W, H), (0.45, -0.25, H / 2), mats[0], bevel=0.004, rotation=(0, 0, 0.4)))
    parts.append(box('Loose2', (L, W, H), (0.38, -0.12, H * 1.5 + 0.002), mats[1], bevel=0.004, rotation=(0, 0, 0.1)))
    return parts


def aerated_blocks(color='#E9E7E2', thickness=0.3):
    m = stone('AAC', light='#EDEBE6', dark='#D9D6D0', scale=10, roughness=0.95, speckle=0.05, speckle_color='#C8C4BC', bump=0.6)
    parts = []
    L, H = 0.6, 0.25
    for layer in range(3):
        for k in range(2):
            parts.append(box('Blk', (L, thickness, H), ((k - 0.5) * (L + 0.006), 0, H / 2 + layer * (H + 0.004)), m, bevel=0.003))
    parts.append(box('Front', (L, thickness, H), (0.75, -0.35, H / 2), m, bevel=0.003, rotation=(0, 0, 0.25)))
    return parts


def insulation_roll(color='#E8C44A', count=2):
    m = stone('Wool', light=color, dark='#C9A43A' if color != '#9FA3A6' else '#7F8386', scale=12, roughness=1.0, bump=0.8)
    film = material('Film', (0.85, 0.9, 0.95), 0.05, transmission=0.9)
    parts = []
    for i in range(count):
        r, L = 0.22, 1.2
        roll = cylinder('Roll%d' % i, r, L, (0, i * 0.47, r), m, rotation=(0, math.pi / 2, 0))
        wrap = cylinder('Wrap%d' % i, r + 0.003, L * 0.92, (0, i * 0.47, r), film, rotation=(0, math.pi / 2, 0))
        stripe = cylinder('Strip%d' % i, r + 0.004, 0.18, (0.2, i * 0.47, r), plastic('#2F5AA8', 0.4, 'Print'), rotation=(0, math.pi / 2, 0))
        parts += [roll, wrap, stripe]
    return parts


def boards(color='#3A7BC8', thickness=0.05, count=5, size=(1.2, 0.6), grooves=True):
    """XPS / EPS insulation boards."""
    m = plastic(color, 0.6, 'XPS')
    parts = []
    for i in range(count):
        parts.append(box('Board%d' % i, (size[0], size[1], thickness), (0, 0, thickness / 2 + i * thickness * 1.01), m, bevel=0.002,
                         rotation=(0, 0, math.radians((i % 2) * 2 - 1))))
    lean = box('Lean', (size[0], size[1], thickness), (0.05, 0.42, 0.33), m, bevel=0.002)
    lean.rotation_euler = (math.radians(70), 0, 0)
    parts.append(lean)
    return parts


def profiles(kind='CD', count=6, length=1.4):
    m = brushed('#C9CCCF', 0.3, 'Galv')
    parts = []
    for i in range(count):
        w, h = (0.06, 0.027) if kind == 'CD' else (0.05, 0.04)
        base = box('P%d' % i, (length, w, 0.0006), (0, i * 0.075 - 0.2, 0.0003), m)
        l1 = box('L%d' % i, (length, 0.0006, h), (0, i * 0.075 - 0.2 - w / 2, h / 2), m)
        l2 = box('R%d' % i, (length, 0.0006, h), (0, i * 0.075 - 0.2 + w / 2, h / 2), m)
        f1 = box('F1%d' % i, (length, 0.008, 0.0006), (0, i * 0.075 - 0.2 - w / 2 + 0.004, h), m)
        f2 = box('F2%d' % i, (length, 0.008, 0.0006), (0, i * 0.075 - 0.2 + w / 2 - 0.004, h), m)
        parts += [base, l1, l2, f1, f2]
    return parts


# ------------------------------------------------------ adhesives & sealants

def cartridge(body='#F2F2F2', band='#2A6EBB', count=1, nozzle='#F5F5F5'):
    parts = []
    for i in range(count):
        x = i * 0.07
        bm = plastic(body, 0.35, 'Cart%d' % i, coat=0.3)
        o = cylinder('Tube%d' % i, 0.024, 0.21, (0, 0, 0), bm)
        lb = cylinder('Band%d' % i, 0.0245, 0.12, (0, 0, 0.01), plastic(band, 0.35, 'Band%d' % i, coat=0.3))
        noz = lathe('Noz%d' % i, [(0.012, 0.105), (0.01, 0.13), (0.004, 0.2), (0.0035, 0.205)], plastic(nozzle, 0.4, 'Noz'), subsurf=0)
        cap = cylinder('Cap%d' % i, 0.022, 0.006, (0, 0, -0.108), plastic('#DDDDDD', 0.5, 'Plunger'))
        grp = [o, lb, noz, cap]
        for g in grp:
            g.location.z += 0.0
        t = transform(grp, location=(x - 0.1 * (count - 1) / 2, 0, 0.025), rotation=(90, 0, 15 + i * 6))
        parts += grp
    return parts


def aerosol(body='#F0B323', cap='#2A2A2A', foam=True):
    bm = plastic(body, 0.25, 'Can', coat=0.5)
    parts = [lathe('Can', [(0.0325, 0.0), (0.033, 0.005), (0.033, 0.21), (0.03, 0.225), (0.015, 0.24), (0.012, 0.245)], bm, subsurf=1)]
    parts.append(cylinder('Bottom', 0.03, 0.003, (0, 0, 0.0015), brushed()))
    parts.append(cylinder('Valve', 0.012, 0.008, (0, 0, 0.247), brushed()))
    if foam:
        parts.append(cylinder('Act', 0.013, 0.02, (0, 0, 0.26), plastic(cap, 0.4, 'Act')))
        parts.append(tube('Straw', [(0, 0, 0.268), (0, -0.04, 0.27), (0, -0.1, 0.27)], 0.004, plastic(cap, 0.4, 'Straw')))
    else:
        parts.append(cylinder('Cap', 0.031, 0.06, (0, 0, 0.27), plastic(cap, 0.3, 'Cap')))
    parts.append(lathe('Label', [(0.0333, 0.03), (0.0333, 0.17)], plastic('#FFFFFF', 0.3, 'Lbl', coat=0.4), subsurf=0))
    return parts


def glue_bucket(body='#FFFFFF', lid='#2A6EBB', size=5):
    return paint_pail(paint='#F5F0E6', label=body, accent=lid, size=size)


# --------------------------------------------------------------- hand tools

def spirit_level(length=0.8, color='#F2C21B'):
    am = brushed('#C9CCCF', 0.3, 'Alu')
    pm = plastic(color, 0.35, 'Paint', coat=0.3)
    parts = [box('Body', (length, 0.025, 0.065), (0, 0, 0.0325), pm, bevel=0.002)]
    parts.append(box('Edge', (length, 0.027, 0.006), (0, 0, 0.003), am))
    parts.append(box('Edge2', (length, 0.027, 0.006), (0, 0, 0.062), am))
    vial = material('Vial', (0.6, 0.95, 0.3), 0.05, transmission=0.6)
    for x in (-length * 0.35, 0, length * 0.35):
        parts.append(cylinder('Vial', 0.008, 0.05, (x, -0.013, 0.033), vial, rotation=(0, math.pi / 2 if x == 0 else 0, 0)))
        parts.append(box('Window', (0.065, 0.004, 0.04), (x, -0.012, 0.033), material('Win', (1, 1, 1), 0.0, transmission=1.0)))
    parts.append(box('Cap', (0.02, 0.027, 0.065), (length / 2, 0, 0.0325), plastic('#222222', 0.5, 'Endcap'), bevel=0.004))
    parts.append(box('Cap2', (0.02, 0.027, 0.065), (-length / 2, 0, 0.0325), plastic('#222222', 0.5, 'Endcap2'), bevel=0.004))
    return transform(parts, rotation=(0, 0, 18)) and parts


def trowel(notched=True):
    steel = brushed('#B9BCC0', 0.25, 'Steel')
    blade = box('Blade', (0.28, 0.12, 0.0012), (0, 0, 0.0006), steel, bevel=0.0004)
    parts = [blade]
    if notched:
        cutters = []
        for i in range(24):
            c = box('Cut', (0.006, 0.012, 0.01), (-0.135 + i * 0.0117, -0.06, 0.0), None, rotation=(0, 0, math.radians(45)))
            cutters.append(c)
        for c in cutters:
            boolean(blade, c)
    parts.append(box('Mount', (0.2, 0.012, 0.03), (0, 0, 0.016), steel, bevel=0.002))
    hm = plastic('#E46A1C', 0.45, 'Handle')
    parts.append(loft('Handle', [dict(z=-0.06, rx=0.012, ry=0.016), dict(z=-0.04, rx=0.016, ry=0.02), dict(z=0.05, rx=0.016, ry=0.019),
                                 dict(z=0.065, rx=0.012, ry=0.014)], hm, segments=32))
    parts[-1].rotation_euler = (0, math.pi / 2, 0)
    parts[-1].location = (0, 0, 0.055)
    parts.append(cylinder('Post', 0.006, 0.03, (-0.045, 0, 0.04), steel))
    parts.append(cylinder('Post2', 0.006, 0.03, (0.045, 0, 0.04), steel))
    return parts


def hammer():
    steel = brushed('#9EA2A6', 0.3, 'Head')
    hm = plastic('#E46A1C', 0.5, 'Grip')
    fm = plastic('#202020', 0.6, 'Fiber')
    parts = [box('Neck', (0.03, 0.03, 0.03), (0, 0, 0.31), steel, bevel=0.004)]
    parts.append(cylinder('Face', 0.016, 0.06, (0.045, 0, 0.31), steel, rotation=(0, math.pi / 2, 0), bevel=0.002))
    parts.append(tube('Claw', [(-0.015, 0, 0.31), (-0.06, 0, 0.30), (-0.1, 0, 0.27)], 0.011, steel))
    parts.append(loft('Shaft', [dict(z=0.0, rx=0.017, ry=0.013), dict(z=0.14, rx=0.016, ry=0.012), dict(z=0.29, rx=0.012, ry=0.01)], fm, segments=32))
    parts.append(loft('Grip', [dict(z=0.0, rx=0.019, ry=0.015), dict(z=0.01, rx=0.02, ry=0.016), dict(z=0.13, rx=0.018, ry=0.014), dict(z=0.14, rx=0.017, ry=0.013)], hm, segments=32))
    return transform(parts, location=(0, 0, 0.02), rotation=(0, 90, 20)) and parts


def tape_measure(color='#F2C21B'):
    bm = plastic(color, 0.35, 'Case', coat=0.3)
    parts = [loft('Case', [dict(z=0.0, rx=0.038, ry=0.038, n=3.2), dict(z=0.004, rx=0.04, ry=0.04, n=3.2), dict(z=0.04, rx=0.04, ry=0.04, n=3.2),
                           dict(z=0.044, rx=0.038, ry=0.038, n=3.2)], bm, segments=48)]
    parts.append(cylinder('Rub', 0.03, 0.046, (0, 0, 0.022), plastic('#202020', 0.6, 'Rubber')))
    blade = material('Blade', srgb('#F4D23C'), 0.3, metallic=0.3)
    parts.append(box('Tape', (0.18, 0.025, 0.001), (0.13, -0.025, 0.006), blade))
    parts.append(box('Hook', (0.004, 0.027, 0.012), (0.22, -0.025, 0.008), brushed()))
    parts.append(box('Lock', (0.012, 0.02, 0.012), (0.03, 0.0, 0.046), plastic('#202020', 0.5, 'Lock')))
    return parts


def paint_roller(nap='#F1EEE8', handle='#E46A1C'):
    rm = fabric_bag('Nap', nap, 1.0, 400)
    parts = [cylinder('Roller', 0.025, 0.18, (0, 0, 0.025), rm, rotation=(0, math.pi / 2, 0))]
    wire = brushed('#B0B3B7', 0.3, 'Frame')
    parts.append(poly_tube('Frame', [(0.095, 0, 0.025), (0.11, 0, 0.025), (0.11, 0.0, 0.08), (0.0, 0.08, 0.1), (-0.02, 0.15, 0.1)], 0.0035, wire))
    parts.append(loft('Handle', [dict(z=0, rx=0.013, ry=0.013), dict(z=0.13, rx=0.016, ry=0.016), dict(z=0.14, rx=0.012, ry=0.012)],
                      plastic(handle, 0.45, 'Hdl'), segments=32))
    parts[-1].rotation_euler = (math.radians(-90), 0, 0)
    parts[-1].location = (-0.02, 0.15, 0.1)
    return parts
