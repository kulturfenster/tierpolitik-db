#!/usr/bin/env python3
import subprocess
import sys

STEPS = [
    ["python", "scripts/seed_sources.py"],
    ["python", "scripts/connector_bund_curia_vista.py"],
    ["python", "scripts/classify_rules_v1.py"],
    ["python", "scripts/export_review_inbox.py"],
    ["python", "scripts/report_latest_run.py"],
]


def main():
    for cmd in STEPS:
        print("$", " ".join(cmd))
        r = subprocess.run(cmd)
        if r.returncode != 0:
            sys.exit(r.returncode)
    print("pipeline ok")


if __name__ == "__main__":
    main()
