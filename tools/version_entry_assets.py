"""Content-version the HTML entry assets when staging GitHub Pages.

Only the three entry URLs change. JavaScript, CSS, layout, storage and game
logic remain byte-for-byte untouched. Run against a staged site, not a live
browser's site data. A fresh bootstrap URL prevents the cached pre-demo app
from silently leaving the new full-round button without a click handler.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ENTRY_ASSETS = ('styles.css', 'src/calibration.css', 'src/app.js')


def version_entry_assets(site: Path) -> dict[str, str]:
    root = site.resolve(strict=True)
    index = root / 'index.html'
    original = index.read_text(encoding='utf-8')
    updated = original
    versions = {}
    for relative in ENTRY_ASSETS:
        asset = (root / relative).resolve(strict=True)
        if not asset.is_relative_to(root) or not asset.is_file():
            raise ValueError(f'Entry asset is outside the staged site: {relative}')
        digest = hashlib.sha256(asset.read_bytes()).hexdigest()
        pattern = r'((?:src|href)="\./' + re.escape(relative) + r')(?:\?[^"\s]*)?"'
        updated, count = re.subn(pattern, lambda m: m[1] + '?v=' + digest + '"', updated)
        if count != 1:
            raise ValueError(f'Expected one HTML entry reference for {relative}; found {count}')
        versions[relative] = digest
    # Do not write a partially transformed page when a required asset is absent.
    if updated != original:
        index.write_text(updated, encoding='utf-8')
    return versions


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('site', type=Path, help='Root of the staged Pages site')
    print(json.dumps(version_entry_assets(parser.parse_args().site), indent=2))
