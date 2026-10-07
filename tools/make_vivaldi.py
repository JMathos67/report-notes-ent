#!/usr/bin/env python3
"""Builds extension-vivaldi/ from extension/: same code, but the manifest declares the "debugger" permission
(compatibility mode with real key presses, on by default) and the name says "(Vivaldi)".
Not for the Chrome Web Store build: the debugger permission shows a warning and cannot be optional."""
import json, pathlib, shutil, sys
root = pathlib.Path(__file__).resolve().parent.parent
src, dst = root / 'extension', root / 'extension-vivaldi'
if dst.exists(): shutil.rmtree(dst)
shutil.copytree(src, dst, ignore=shutil.ignore_patterns('STORE.md', '.DS_Store'))
mf = dst / 'manifest.json'
m = json.loads(mf.read_text(encoding='utf-8'))
m['name'] += ' (Vivaldi)'
m['action']['default_title'] += ' (Vivaldi)'
if 'debugger' not in m['permissions']: m['permissions'].append('debugger')
mf.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('OK ->', dst)
