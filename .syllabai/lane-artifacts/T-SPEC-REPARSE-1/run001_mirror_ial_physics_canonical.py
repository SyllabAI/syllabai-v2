#!/usr/bin/env python3
"""T-SPEC-REPARSE-1 run-001 — mirror the ial-physics v1 repair (row 45) onto the
canonical spec_points.json layer (the layer build_official_spines.py consumes
for Edexcel quals; two-layer convention of record per t_spec_apply_repairs.py).
Ran against resources main @ e9e86e22. Idempotent."""
import json

REPAIR = {
    'IAL_PHYSICS:45': {
        'text': 'know and understand that at the interface between medium 1 and medium 2 n\u2081sin \u03b8\u2081= n\u2082sin \u03b8\u2082 where refractive index is n=c\u2044v',
        'sub_items': [],
    },
}
path = 'Official-Specifications/parsed/ial-physics/spec_points.json'
doc = json.load(open(path))
rows = doc['spec_points'] if isinstance(doc, dict) else doc
for r in rows:
    if r['id'] in REPAIR:
        r.update({k: v for k, v in REPAIR[r['id']].items()})
        fl = r.setdefault('flags', [])
        if 'reparse-1.0' not in fl:
            fl.append('reparse-1.0')
        r['flags'] = sorted(set(fl))
open(path, 'w').write(json.dumps(doc, indent=1, ensure_ascii=False))
print('mirrored')
