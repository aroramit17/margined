#!/usr/bin/env python3
"""Run integration tests in a disposable PostgreSQL cluster, never a hosted DB."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
pg_bin = os.environ.get("PG_BIN")
if not pg_bin:
    initdb = shutil.which("initdb")
    pg_bin = str(Path(initdb).parent) if initdb else "/opt/homebrew/opt/postgresql@16/bin"
if not (Path(pg_bin) / "initdb").exists():
    sys.exit("PostgreSQL binaries required: set PG_BIN to the directory containing initdb and pg_ctl")
with tempfile.TemporaryDirectory(prefix="mgd-pg-", dir="/tmp") as directory:
    data = Path(directory) / "data"
    log = Path(directory) / "postgres.log"
    subprocess.run([f"{pg_bin}/initdb", "-D", str(data), "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([f"{pg_bin}/pg_ctl", "-D", str(data), "-l", str(log), "-o",
                    f"-F -c listen_addresses='' -k {directory} -p 54329", "-w", "start"], check=True, stdout=subprocess.DEVNULL)
    try:
        env = {**os.environ, "MARGINED_TEST_PG_SOCKET": directory}
        result = subprocess.run([sys.executable, "-m", "pytest", "backend/tests/integration", "-q", *sys.argv[1:]], cwd=ROOT, env=env)
    finally:
        subprocess.run([f"{pg_bin}/pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"], check=True, stdout=subprocess.DEVNULL)
    sys.exit(result.returncode)
