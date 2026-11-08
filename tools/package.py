#!/usr/bin/env python3
"""Build a Foundry install ZIP and release manifest without modifying source files."""
import argparse
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--repository', help='GitHub owner/repository; omitted for a local-only package')
parser.add_argument('--tag', help='Must match v + module version')
parser.add_argument('--output', type=Path, default=ROOT / 'dist')
args = parser.parse_args()
manifest = json.loads((ROOT / 'module.json').read_text())
tag = args.tag or 'v' + manifest['version']
if tag != 'v' + manifest['version']:
    parser.error('Tag must exactly match v + module.json version')
if args.repository:
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
        parser.error('Repository must be owner/repository')
    repo = 'https://github.com/' + args.repository
    manifest.update(url=repo, bugs=repo + '/issues',
                    manifest=repo + (f'/releases/download/{tag}/module.json' if '-' in manifest['version'] else '/releases/latest/download/module.json'),
                    download=f'{repo}/releases/download/{tag}/rotating-dungeon.zip')
for key in ['esmodules', 'styles']:
    for path in manifest[key]:
        if not (ROOT / path).is_file():
            raise SystemExit(f'Missing manifest asset: {path}')
args.output.mkdir(parents=True, exist_ok=True)
manifest_text = json.dumps(manifest, indent=2) + '\n'
(args.output / 'module.json').write_text(manifest_text)
files = [ROOT / name for name in ['README.md', 'LICENSE', 'CHANGELOG.md']]
for folder in ['scripts', 'styles', 'templates', 'docs', 'tests/fixtures']:
    files.extend(sorted((ROOT / folder).rglob('*')))
with zipfile.ZipFile(args.output / 'rotating-dungeon.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    def put(name, data):
        info = zipfile.ZipInfo(str(name), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
    put('module.json', manifest_text)
    for path in sorted(files):
        if path.is_file():
            put(path.relative_to(ROOT), path.read_bytes())
print(f'Built {args.output / "rotating-dungeon.zip"}')
print('Release URLs configured.' if args.repository else 'Local package: no GitHub URLs are configured.')
