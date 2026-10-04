"""Build-only URL correction; no browser data deletion or runtime rewrite."""
import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('entry_assets',ROOT/'tools/version_entry_assets.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class EntryAssetsTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.site=Path(self.tmp.name);(self.site/'src').mkdir()
        self.html='<link href="./styles.css?reliability=1"><link href="./src/calibration.css?smart=1"><script src="./src/app.js?reliability=1"></script><button id="demo-round">Watch a full round</button>'
        (self.site/'index.html').write_text(self.html)
        for path in module.ENTRY_ASSETS:(self.site/path).write_text('original '+path)
    def test_only_entry_urls_change_and_payload_bytes_are_untouched(self):
        before={p:(self.site/p).read_bytes() for p in module.ENTRY_ASSETS}
        versions=module.version_entry_assets(self.site)
        html=(self.site/'index.html').read_text()
        for path,data in before.items():
            self.assertEqual(versions[path],hashlib.sha256(data).hexdigest())
            self.assertIn('./'+path+'?v='+versions[path],html)
            self.assertEqual((self.site/path).read_bytes(),data)
        expected=self.html
        for path,old in [('styles.css','reliability=1'),('src/calibration.css','smart=1'),('src/app.js','reliability=1')]:
            expected=expected.replace(path+'?'+old,path+'?v='+versions[path])
        self.assertEqual(html,expected)
    def test_repeat_build_is_idempotent(self):
        first=module.version_entry_assets(self.site);html=(self.site/'index.html').read_bytes()
        self.assertEqual(module.version_entry_assets(self.site),first)
        self.assertEqual((self.site/'index.html').read_bytes(),html)
    def test_bootstrap_or_css_change_cannot_reuse_its_old_url(self):
        first=module.version_entry_assets(self.site)
        for name in ['src/app.js','styles.css']:(self.site/name).write_text('new '+name)
        second=module.version_entry_assets(self.site)
        self.assertNotEqual(first['src/app.js'],second['src/app.js'])
        self.assertNotEqual(first['styles.css'],second['styles.css'])
        self.assertEqual(first['src/calibration.css'],second['src/calibration.css'])
    def test_missing_asset_does_not_partially_write_index(self):
        (self.site/'src/app.js').unlink()
        with self.assertRaises(FileNotFoundError):module.version_entry_assets(self.site)
        self.assertEqual((self.site/'index.html').read_text(),self.html)
    def test_missing_or_duplicate_entry_is_a_build_failure(self):
        for html in [self.html.replace('./src/app.js','./different.js'),self.html+'<script src="./src/app.js"></script>']:
            (self.site/'index.html').write_text(html)
            with self.assertRaises(ValueError):module.version_entry_assets(self.site)
            self.assertEqual((self.site/'index.html').read_text(),html)

if __name__=='__main__':unittest.main()
