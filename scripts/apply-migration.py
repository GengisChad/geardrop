# -*- coding: utf-8 -*-
"""Applies one migration to the GearDrop project through the Management API, the way db push would.

The Supabase CLI cannot open a Postgres connection from this machine (the direct host is
IPv6-only and the pooler refuses), so migrations go through POST /database/query and the version
is recorded in supabase_migrations.schema_migrations afterwards, exactly as the CLI does.

Usage: python apply_migration.py <migration-file> [--check]
  --check only reports whether the version is already recorded.
"""
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROJECT = "cvwigsymjlpulwgjkzix"
API = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"


def token() -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit("SUPABASE_ACCESS_TOKEN not in .env.local")


def run(sql: str):
    request = urllib.request.Request(
        API,
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body.strip() else []


def main() -> None:
    path = ROOT / "supabase/migrations" / sys.argv[1] if not pathlib.Path(sys.argv[1]).is_absolute() else pathlib.Path(sys.argv[1])
    version, name = path.name.split("_", 1)
    name = name.removesuffix(".sql")

    already = run(
        "select 1 from supabase_migrations.schema_migrations where version = '%s'" % version
    )
    if already:
        print(f"GIA' APPLICATA  {version} {name}")
        return
    if "--check" in sys.argv:
        print(f"da applicare     {version} {name}")
        return

    sql = path.read_text(encoding="utf-8")
    run(sql)
    # The CLI records the version only once the statements went through.
    run(
        "insert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s') "
        "on conflict (version) do nothing" % (version, name.replace("'", "''"))
    )
    print(f"APPLICATA        {version} {name}")


if __name__ == "__main__":
    main()
