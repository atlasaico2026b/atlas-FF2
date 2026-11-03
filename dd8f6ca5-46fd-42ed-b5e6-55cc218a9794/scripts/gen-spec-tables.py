#!/usr/bin/env python3
"""
Generate src/lib/spec/tables.generated.ts from the employer's engine specification.

The document is the authority. This script does not interpret, summarise or
"improve" anything: it walks the DOCX body in document order, pairs each table
with the heading that introduces it, and emits the rows verbatim so the running
engine and the specification cannot drift apart.

    python3 scripts/gen-spec-tables.py [path/to/spec.docx]

Default input: docs/ENGINE-SPEC-v1.2.docx (or the workspace upload).
"""

import html
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_TS = os.path.join(ROOT, 'src', 'lib', 'spec', 'tables.generated.ts')

DEFAULT_INPUTS = [
    os.path.join(ROOT, 'docs', 'ENGINE-SPEC-v1.2.docx'),
    '/app/workspace/files/Tank_Foam_Fire_Protection_Calculation_Engine_Specification_v1.2.docx',
]

TAG = re.compile(r'<(/?)(w:[\w]+)((?:"[^"]*"|[^>"])*?)(/?)>', re.S)


def tokens(xml):
    """Yield (name, kind, start, end) for every element tag, in order."""
    for m in TAG.finditer(xml):
        closing, name, _, selfclose = m.groups()
        if closing:
            kind = 'close'
        elif selfclose:
            kind = 'self'
        else:
            kind = 'open'
        yield name, kind, m.start(), m.end()


def block_spans(xml, body_start):
    """Top-level <w:p> and <w:tbl> spans (document order)."""
    spans = []
    depth = 0
    cur = None
    for name, kind, s, e in tokens(xml):
        if s < body_start:
            continue
        if depth == 0 and kind in ('open', 'self') and name in ('w:p', 'w:tbl'):
            cur = {'kind': name, 'start': s, 'end': None}
        if kind == 'open':
            depth += 1
        elif kind == 'close':
            depth -= 1
            if depth == 0 and cur is not None and cur['kind'] == name:
                cur['end'] = e
                spans.append(cur)
                cur = None
        elif kind == 'self' and depth == 0 and cur is not None:
            cur['end'] = e
            spans.append(cur)
            cur = None
    return spans


def para_text(seg):
    out = []
    for m in re.finditer(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>|<w:tab[^>]*/>|<w:br[^>]*/>', seg, re.S):
        if m.group(1) is not None:
            out.append(html.unescape(m.group(1)))
        elif m.group(0).startswith('<w:tab'):
            out.append(' ')
        else:
            out.append(' ')
    return re.sub(r'\s+', ' ', ''.join(out)).strip()


def table_rows(seg):
    """Rows of cell strings. Nested tables are flattened into their parent cell."""
    rows = []
    depth = 0
    row = None
    for name, kind, s, e in tokens(seg):
        if name == 'w:tr':
            if kind == 'open':
                row = []
            elif kind == 'close' and row is not None:
                rows.append(row)
                row = None
            continue
        if name == 'w:tc' and row is not None:
            if kind == 'open':
                depth += 1
                row.append([s, e, None])
            elif kind == 'close' and row and row[-1][2] is None:
                depth -= 1
                cell = row[-1]
                cell[2] = para_text(seg[cell[0]:e])
    return [[c[2] if c[2] is not None else '' for c in r] for r in rows]


# "3.1 TITLE", "4.1 TITLE", "3.0A TITLE" and "4. TITLE" all count as headings.
HEADING = re.compile(r'^(\d+(?:\.\d+)*[A-Z]?)\.?\s+(\S.*)$')


def slug(s):
    s = re.sub(r'[^0-9A-Za-z]+', '-', s).strip('-').upper()
    return s[:48]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if src is None:
        for cand in DEFAULT_INPUTS:
            if os.path.exists(cand):
                src = cand
                break
    if src is None or not os.path.exists(src):
        sys.exit('spec docx not found; pass its path as argv[1]')

    xml = zipfile.ZipFile(src).read('word/document.xml').decode('utf-8')
    body_start = xml.index('<w:body>') + len('<w:body>')

    blocks = block_spans(xml, body_start)

    tables = []
    last_heading = ''
    prose = []
    seen_ids = {}
    for b in blocks:
        seg = xml[b['start']:b['end']]
        if b['kind'] == 'w:p':
            t = para_text(seg)
            if not t:
                continue
            m = HEADING.match(t)
            if m:
                last_heading = t
            prose.append(t)
        else:
            m = HEADING.match(last_heading)
            sec = m.group(1) if m else ''
            title = (m.group(2) if m else last_heading) or 'UNTITLED'
            base = ('T' + sec) if sec else 'T-' + slug(title)
            n = seen_ids.get(base, 0) + 1
            seen_ids[base] = n
            tid = base if n == 1 else '%s-%s' % (base, chr(ord('a') + n - 2))
            tables.append({
                'id': tid,
                'section': sec,
                'title': title,
                'heading': last_heading,
                'rows': table_rows(seg),
            })

    # Collapse exact-duplicate tables (the source repeats a couple of blocks).
    seen = set()
    uniq = []
    for t in tables:
        key = (t['id'], json.dumps(t['rows'], ensure_ascii=False))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(t)
    tables = uniq

    # §17 is prose, not a table. Capture its numbered rules verbatim so the
    # non-negotiable engine rules are shipped from the document like everything else.
    rules = []
    grab = False
    for p in prose:
        if p.startswith('17. NON-NEGOTIABLE'):
            grab = True
            continue
        if grab:
            if p.startswith('REFERENCE LOCK'):
                break
            for m in re.finditer(r'(\d{1,2})\.\s+(.*?)(?=\s+\d{1,2}\.\s|$)', p):
                rules.append({'n': int(m.group(1)), 'text': m.group(2).strip()})
            if p.startswith('REFERENCE LOCK'):
                break
    rules = [r for r in rules if r['text']]

    lines = []
    w = lines.append
    w('// GENERATED FILE — DO NOT EDIT BY HAND.')
    w('//')
    w('// Produced by scripts/gen-spec-tables.py from:')
    w('//   %s' % os.path.basename(src))
    w('//')
    w('// Every row below is a verbatim transcription of a table in the employer\'s')
    w('// engine specification. The specification is the authority for every number')
    w('// the engine uses, so this file is regenerated rather than hand-edited.')
    w('')
    w('export interface SpecTable {')
    w('  /** Table identifier, e.g. "T3.1" (spec section 3.1). */')
    w('  id: string')
    w('  /** Spec section number this table sits under. */')
    w('  section: string')
    w('  /** Section title. */')
    w('  title: string')
    w('  /** The full heading line that introduced the table. */')
    w('  heading: string')
    w('  /** Raw rows; row 0 is the header row where the source has one. */')
    w('  rows: string[][]')
    w('}')
    w('')
    w('export const SPEC_SOURCE_DOCUMENT = %s' % json.dumps(os.path.basename(src)))
    w('')
    w('export const SPEC_TABLES: SpecTable[] = [')
    for t in tables:
        w('  {')
        w('    id: %s,' % json.dumps(t['id']))
        w('    section: %s,' % json.dumps(t['section']))
        w('    title: %s,' % json.dumps(t['title'], ensure_ascii=False))
        w('    heading: %s,' % json.dumps(t['heading'], ensure_ascii=False))
        w('    rows: [')
        for r in t['rows']:
            w('      [%s],' % ', '.join(json.dumps(c, ensure_ascii=False) for c in r))
        w('    ],')
        w('  },')
    w(']')
    w('')
    w('export const SPEC_TABLE_BY_ID: Record<string, SpecTable> = Object.freeze(')
    w('  Object.fromEntries(SPEC_TABLES.map((t) => [t.id, t])),')
    w(')')
    w('')
    w('export interface SpecRule {')
    w('  n: number')
    w('  text: string')
    w('}')
    w('')
    w('/** §17 NON-NEGOTIABLE ENGINE RULES, transcribed verbatim. */')
    w('export const SPEC_RULES: SpecRule[] = [')
    for r in rules:
        w('  { n: %d, text: %s },' % (r['n'], json.dumps(r['text'], ensure_ascii=False)))
    w(']')
    w('')
    os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
    with open(OUT_TS, 'w') as fh:
        fh.write('\n'.join(lines))

    print('tables: %d' % len(tables))
    for t in tables:
        print('  %-8s %-4s rows=%-3d %s' % (t['id'], t['section'], len(t['rows']), t['title'][:60]))
    print('wrote %s (%d bytes)' % (os.path.relpath(OUT_TS, ROOT), os.path.getsize(OUT_TS)))


if __name__ == '__main__':
    main()
