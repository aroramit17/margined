"""Temporary loopback-only form for saving existing Supabase and Stripe test keys.

Run: python scripts/local_setup.py --project-ref PROJECT_REF --public-key PUBLIC_KEY
Open the printed URL, paste the existing backend key, then stop with Ctrl-C.
Credentials never appear in URLs, logs, responses, or tracked files.
"""
import argparse
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import secrets
from threading import Lock
from urllib.parse import parse_qs

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCK = Lock()


def migration_bundle():
    parts = ["BEGIN;", "CREATE SCHEMA IF NOT EXISTS supabase_migrations;",
             "CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);",
             "ALTER TABLE supabase_migrations.schema_migrations ENABLE ROW LEVEL SECURITY;",
             "REVOKE ALL ON SCHEMA supabase_migrations FROM anon, authenticated;",
             "REVOKE ALL ON supabase_migrations.schema_migrations FROM anon, authenticated;"]
    for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        version, name = path.stem.split("_", 1)
        parts.append(path.read_text())
        parts.append(f"INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('{version}', '{name}');")
    parts.append("COMMIT;")
    return "\n\n".join(parts)


def save_env(path, updates):
    with ENV_LOCK:
        _save_env(path, updates)


def _save_env(path, updates):
    lines = path.read_text().splitlines() if path.exists() else []
    keys = set(updates)
    lines = [line for line in lines if line.split("=", 1)[0].strip() not in keys]
    lines.extend(f"{key}={value}" for key, value in updates.items())
    temporary = path.with_name(path.name + ".setup-tmp")
    temporary.touch(mode=0o600, exist_ok=False)
    try:
        temporary.write_text("\n".join(lines) + "\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--public-key", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z]{20}", args.project_ref):
        parser.error("Invalid project reference")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+", args.public_key):
        parser.error("Invalid public key")
    token = secrets.token_urlsafe(32)
    origin = "http://127.0.0.1:8765"
    route = "/" + token
    page = f'''<!doctype html><html><meta charset="utf-8"><title>Capybara local setup</title>
<style>body{{font:16px system-ui;max-width:800px;margin:40px auto}} input,textarea{{width:100%;box-sizing:border-box;padding:10px;margin:12px 0}} button{{padding:10px}}</style>
<h1>Capybara local setup</h1><p>Project: {html.escape(args.project_ref)}</p>
<p>Paste the existing legacy Supabase service_role key (required by the retained database client). It is saved only in backend/.env on this computer.</p>
<form method="post" action="{route}"><input type="hidden" name="provider" value="supabase"><label for="secret">Supabase backend secret</label><input id="secret" name="secret" type="password" autocomplete="off" required><button>Save backend connection</button></form>
<h2>Stripe test mode</h2><form method="post" action="{route}"><input type="hidden" name="provider" value="stripe"><label for="stripe-secret">Existing Stripe test secret</label><input id="stripe-secret" name="secret" type="password" autocomplete="off" required><button>Save Stripe test connection</button></form><h2>Fresh database migration</h2><p>For a new empty project only. Review and run this transaction in the Supabase SQL Editor. This form does not execute SQL.</p>
<label for="migration">Migration SQL</label><textarea id="migration" rows="16" readonly>{html.escape(migration_bundle())}</textarea></html>'''

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, body):
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body.encode())))
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body.encode())

        def authorized(self):
            return self.headers.get("Host") == "127.0.0.1:8765" and secrets.compare_digest(self.path, route)

        def do_GET(self):
            self.reply(200, page) if self.authorized() else self.reply(404, "Not found")

        def do_POST(self):
            if not self.authorized() or self.headers.get("Origin") != origin:
                return self.reply(403, "Forbidden")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reply(400, "Invalid request")
            if not 0 < length < 8192:
                return self.reply(400, "Invalid request")
            try:
                values = parse_qs(self.rfile.read(length).decode())
            except UnicodeError:
                return self.reply(400, "Invalid request")
            if values.get("provider") not in (["stripe"], ["supabase"]):
                return self.reply(400, "Unknown provider")
            secret = values.get("secret", [""])[0].strip()
            if values.get("provider") == ["stripe"]:
                if not re.fullmatch(r"sk_test_[A-Za-z0-9]+", secret):
                    return self.reply(400, "Only an existing Stripe test secret is accepted.")
                try:
                    save_env(ROOT / "backend/.env", {"STRIPE_SECRET_KEY": secret})
                except OSError:
                    return self.reply(500, "Could not save local configuration.")
                return self.reply(200, "<h1>Stripe test connection saved locally</h1><p>Restart the backend to load it.</p>")
            if not re.fullmatch(r"eyJ[A-Za-z0-9_.-]+", secret):
                return self.reply(400, "Expected an existing legacy Supabase service-role key.")
            try:
                save_env(ROOT / "backend/.env", {
                    "SUPABASE_URL": f"https://{args.project_ref}.supabase.co",
                    "SUPABASE_ANON_KEY": args.public_key,
                    "SUPABASE_SERVICE_ROLE_KEY": secret,
                    "FRONTEND_URL": "http://127.0.0.1:5173",
                    "CORS_ORIGINS": "http://127.0.0.1:5173",
                })
            except OSError:
                return self.reply(500, "Could not save local configuration. No credentials returned.")
            self.reply(200, "<h1>Backend connection saved locally</h1><p>Restart the backend to load it. You may close this tab and stop the setup server.</p>")

    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print(f"Local setup: {origin}{route}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
