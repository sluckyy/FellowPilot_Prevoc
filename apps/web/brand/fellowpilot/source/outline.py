"""Replace <text> in the FellowPilot SVGs with outlined paths in Nunito Sans, so logos render identically everywhere."""
import re, sys, io
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTDIR = sys.argv[1]; SRC = sys.argv[2]; OUT = sys.argv[3]
NS = 'http://www.w3.org/2000/svg'; ET.register_namespace('', NS)
_cache = {}
def font(weight, italic):
    k = (weight, italic)
    if k not in _cache:
        f = TTFont(f"{FONTDIR}/NunitoSans{'-Italic' if italic else ''}[YTLC,opsz,wdth,wght].ttf")
        _cache[k] = instantiateVariableFont(f, {'wght': weight, 'wdth': 100, 'opsz': 12, 'YTLC': 500})
    return _cache[k]

def kern_pairs(f):
    """Pair kerning from GPOS PairPos format 1 and 2 (enough for a short wordmark)."""
    pairs = {}
    if 'GPOS' not in f: return pairs
    for lookup in f['GPOS'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            if st.LookupType == 9: st = st.ExtSubTable
            if getattr(st, 'LookupType', None) != 2: continue
            cov = st.Coverage.glyphs
            if st.Format == 1:
                for i, g1 in enumerate(cov):
                    for pvr in st.PairSet[i].PairValueRecord:
                        v = pvr.Value1; pairs.setdefault((g1, pvr.SecondGlyph), getattr(v, 'XAdvance', 0) or 0)
            elif st.Format == 2:
                c1 = st.ClassDef1.classDefs; c2 = st.ClassDef2.classDefs
                for g1 in cov:
                    rec = st.Class1Record[c1.get(g1, 0)]
                    for g2, k2 in c2.items():
                        v = rec.Class2Record[k2].Value1
                        x = getattr(v, 'XAdvance', 0) or 0
                        if x: pairs.setdefault((g1, g2), x)
    return pairs
_kern = {}

def run_paths(text, f, size, ls, x0, y):
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f['hmtx']; upm = f['head'].unitsPerEm
    kp = _kern.setdefault(id(f), kern_pairs(f))
    s = size / upm; x = x0; d = []; prev = None
    for ch in text:
        g = cmap.get(ord(ch), '.notdef')
        if prev: x += kp.get((prev, g), 0) * s
        pen = SVGPathPen(gs); gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, y)))
        d.append(pen.getCommands()); x += hmtx[g][0] * s + ls; prev = g
    return ' '.join(p for p in d if p), x - x0

def width(text, f, size, ls): return run_paths(text, f, size, ls, 0, 0)[1]

CLASSES = {'name': (800, False, -3), 'motto': (700, False, 3.4), 'tag': (500, True, 0)}
tree = ET.parse(SRC); root = tree.getroot()
for st in root.findall(f'{{{NS}}}style'): root.remove(st)
for parent in list(root.iter()):
    for i, t in enumerate(list(parent)):
        if t.tag != f'{{{NS}}}text': continue
        w, it, ls = CLASSES[t.get('class')]; f = font(w, it)
        size = float(t.get('font-size')); x = float(t.get('x')); y = float(t.get('y'))
        runs = [(t.text, t.get('fill'))] if t.text and t.text.strip() else []
        runs += [(sp.text, sp.get('fill') or t.get('fill')) for sp in t.findall(f'{{{NS}}}tspan')]
        total = sum(width(r[0], f, size, ls) for r in runs)
        cx = x - total / 2 if t.get('text-anchor') == 'middle' else x
        g = ET.Element(f'{{{NS}}}g')
        for txt, fill in runs:
            d, adv = run_paths(txt, f, size, ls, cx, y); cx += adv
            ET.SubElement(g, f'{{{NS}}}path', {'d': d, 'fill': fill})
        idx = list(parent).index(t); parent.remove(t); parent.insert(idx, g)
root.set('aria-label', 'FellowPilot')
tree.write(OUT, xml_declaration=False, encoding='unicode')
