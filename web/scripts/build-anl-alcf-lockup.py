"""Build the Argonne | Argonne Leadership Computing Facility SVG lockups.

Left: the official Argonne mark + divider, copied verbatim from
https://www.alcf.anl.gov/themes/alcf/img/ANL_ALCF-white.svg (its "ALCF"
glyphs are dropped). Right: "Argonne Leadership / Computing Facility"
outlined from Montserrat Bold with HarfBuzz kerning, sized to match
public/alcf-template/argonne-alcf-lockup.png. Writes
anl-alcf-lockup-{light,dark}.svg.

Usage:
    uv run --with fonttools --with uharfbuzz python \\
        scripts/build-anl-alcf-lockup.py ANL_ALCF-white.svg \\
        /Library/Fonts/LigaMontserrat-Bold.ttf public/anl-logos
"""
import re, sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

src, font_path, out_dir = sys.argv[1:4]
svg = open(src).read()
H = 29.73
DIVIDER_X = 116.83

# Keep elements whose geometry lies left of (or is) the divider: the ANL mark.
body = svg.split('</defs>', 1)[1].rsplit('</svg>', 1)[0]
elems = re.findall(r'<(?:path|polygon|rect)[^>]*/>', body)
def xs(e):
    m = re.search(r'(?:points|d)="([^"]+)"', e)
    if 'x="' in e and not m:
        return [float(re.search(r'x="([^"]+)"', e).group(1))]
    nums = re.findall(r'-?\d*\.?\d+', m.group(1))
    return [float(n) for n in nums[0::2]] if 'points' in e else [float(nums[0])]
keep = [e for e in elems if min(xs(e)) <= DIVIDER_X + 1]
drop = len(elems) - len(keep)

# Text: cap height and baselines matched to the 2005x256 PNG lockup.
data = open(font_path, 'rb').read()
face = hb.Face(data); hbfont = hb.Font(face)
tt = TTFont(font_path); gs = tt.getGlyphSet(); upem = tt['head'].unitsPerEm
cap = tt['OS/2'].sCapHeight
scale = (H * 0.255) / cap            # cap height ~25.5% of lockup height
x0 = DIVIDER_X + 6.2
# Montserrat runs ~5% wider than the official Gotham lockup; tighten tracking.
track = -0.03 * upem
paths, width = [], 0
for line, baseline in [('Argonne Leadership', H * 0.405), ('Computing Facility', H * 0.835)]:
    buf = hb.Buffer(); buf.add_str(line); buf.guess_segment_properties()
    hb.shape(hbfont, buf, {'liga': False, 'dlig': False, 'calt': False, 'kern': True})
    x = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = tt.getGlyphName(info.codepoint)
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x0 + (x + pos.x_offset) * scale, baseline)))
        d = pen.getCommands()
        if d: paths.append(d)
        x += pos.x_advance + track
    width = max(width, x0 + (x - track) * scale)
W = round(width + 0.5, 2)
text_d = ' '.join(paths)

for variant, fg in [('light', '#231f20'), ('dark', '#fff')]:
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Argonne National Laboratory | Argonne Leadership Computing Facility">',
           f'<defs><style>.cls-1{{fill:#e22b2a}}.cls-2{{fill:#85c441}}.cls-3{{fill:#1d388b}}.cls-4{{fill:{fg}}}.cls-5{{fill:#a12b2f}}.cls-6{{fill:#0093d0}}.cls-7{{fill:#008c4f}}.core{{fill:#fff}}</style></defs>']
    for e in keep:
        # The triangle's white core stays white on both backgrounds.
        if 'points="94.25 14.6 98.79 6.73 103.33 14.6' in e:
            e = e.replace('class="cls-4"', 'class="core"')
        out.append(e)
    out.append(f'<path class="cls-4" d="{text_d}"/>')
    out.append('</svg>')
    open(f'{out_dir}/anl-alcf-lockup-{variant}.svg', 'w').write(''.join(out))
print(f'kept {len(keep)} mark elements, dropped {drop} ALCF glyphs; viewBox {W}x{H}')
