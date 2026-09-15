import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('local_setup', Path(__file__).parents[1] / 'local_setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class LocalSetupTest(unittest.TestCase):
    def test_env_update_preserves_other_provider_and_private_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            path.write_text('# existing\nSTRIPE_SECRET_KEY=test-placeholder\nSUPABASE_URL=old\n')
            setup.save_env(path, {'SUPABASE_URL': 'new', 'SUPABASE_ANON_KEY': 'public-placeholder'})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.read_text().count('SUPABASE_URL='), 1)
            self.assertIn('STRIPE_SECRET_KEY=test-placeholder', path.read_text())
            self.assertFalse(path.with_name('.env.setup-tmp').exists())

    def test_fresh_database_bundle_tracks_each_migration_in_one_transaction(self):
        sql = setup.migration_bundle()
        self.assertTrue(sql.startswith('BEGIN;'))
        self.assertTrue(sql.endswith('COMMIT;'))
        self.assertIn('schema_migrations ENABLE ROW LEVEL SECURITY', sql)
        for file in (setup.ROOT / 'supabase/migrations').glob('*.sql'):
            self.assertIn(file.read_text(), sql)
            self.assertIn("VALUES ('" + file.stem.split('_', 1)[0] + "',", sql)


if __name__ == '__main__':
    unittest.main()
