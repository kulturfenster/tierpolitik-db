#!/usr/bin/env python3
import subprocess
import sys

STEPS = [
    ["python", "scripts/seed_sources.py"],
    ["python", "scripts/connector_bund_curia_vista.py"],
    ["python", "scripts/connector_be_grosser_rat_ogd.py"],
    ["python", "scripts/connector_zh_gemeinderat.py"],
    ["python", "scripts/connector_bs_grosser_rat.py"],
    ["python", "scripts/connector_bl_landrat_talus_full.py"],
    ["python", "scripts/connector_ag_grosser_rat.py"],
    ["python", "scripts/classify_rules_v2_strict.py"],
    ["python", "scripts/export_review_inbox.py"],
    ["python", "scripts/export_home_data.py"],
    ["python", "scripts/export_debug_stats.py"],
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
