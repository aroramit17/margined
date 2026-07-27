import os
import sys

# Settings load at import time — provide test values before app imports.
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
