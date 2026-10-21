#!/usr/bin/env python3
"""T-TEACH-002: hand-craft the 0006 drizzle snapshot + journal entry.

drizzle-kit generate is UNUSABLE on this repo (PRE-EXISTING 0000/0005
snapshot-id collision — both carry id 8c24e095-b5f0-4ce4-a490-e612a4ed9b10 —
plus the dangling 0001.prevId fb2e9ae1; documented in the T-TEACH-001
receipt). The 0006 snapshot is therefore crafted by copying 0005 and
injecting the two v2-native tables of ADR-CLASS-0001, with a FRESH id and
prevId = 0005's id so the journal walk 0005 -> 0006 stays well-ordered.
"""
import json, uuid, copy, os

BASE = os.path.join(os.path.dirname(__file__), "..", "packages", "db", "drizzle")
META = os.path.join(BASE, "meta")

src = json.load(open(os.path.join(META, "0005_snapshot.json")))
snap = copy.deepcopy(src)
snap["id"] = str(uuid.uuid4())
snap["prevId"] = src["id"]

TS = "timestamp with time zone"

snap["tables"]["public.class_features"] = {
    "name": "class_features",
    "schema": "",
    "columns": {
        "class_id": {"name": "class_id", "type": "uuid", "primaryKey": True, "notNull": True},
        "smart_mark": {"name": "smart_mark", "type": "boolean", "primaryKey": False, "notNull": True, "default": True},
        "tutor": {"name": "tutor", "type": "boolean", "primaryKey": False, "notNull": True, "default": True},
        "cla": {"name": "cla", "type": "boolean", "primaryKey": False, "notNull": True, "default": True},
        "updated_at": {"name": "updated_at", "type": TS, "primaryKey": False, "notNull": True},
        "updated_by": {"name": "updated_by", "type": "uuid", "primaryKey": False, "notNull": False},
    },
    "indexes": {},
    "foreignKeys": {
        "fk_class_features_class": {
            "name": "fk_class_features_class",
            "tableFrom": "class_features",
            "tableTo": "classes",
            "columnsFrom": ["class_id"],
            "columnsTo": ["id"],
            "onDelete": "cascade",
            "onUpdate": "no action",
        },
    },
    "compositePrimaryKeys": {},
    "uniqueConstraints": {},
    "policies": {},
    "checkConstraints": {},
    "isRLSEnabled": False,
}

snap["tables"]["public.course_registry"] = {
    "name": "course_registry",
    "schema": "",
    "columns": {
        "course_slug": {"name": "course_slug", "type": "varchar(100)", "primaryKey": True, "notNull": True},
        "curriculum_code": {"name": "curriculum_code", "type": "varchar(50)", "primaryKey": False, "notNull": False},
        "level": {"name": "level", "type": "varchar(40)", "primaryKey": False, "notNull": True},
        "subject": {"name": "subject", "type": "varchar(100)", "primaryKey": False, "notNull": True},
        "code": {"name": "code", "type": "varchar(20)", "primaryKey": False, "notNull": True},
        "board": {"name": "board", "type": "varchar(50)", "primaryKey": False, "notNull": False},
        "label": {"name": "label", "type": "varchar(160)", "primaryKey": False, "notNull": False},
        "status": {"name": "status", "type": "varchar(16)", "primaryKey": False, "notNull": True},
        "source": {"name": "source", "type": "varchar(200)", "primaryKey": False, "notNull": True},
        "synced_at": {"name": "synced_at", "type": TS, "primaryKey": False, "notNull": True},
    },
    "indexes": {
        "ix_course_registry_cc": {
            "name": "ix_course_registry_cc",
            "columns": [{"expression": "curriculum_code", "isExpression": False, "asc": True, "nulls": "last"}],
            "isUnique": False,
            "concurrently": False,
            "method": "btree",
            "with": {},
            "where": '"curriculum_code" IS NOT NULL',
        },
    },
    "foreignKeys": {},
    "compositePrimaryKeys": {},
    "uniqueConstraints": {},
    "policies": {},
    "checkConstraints": {},
    "isRLSEnabled": False,
}

out = os.path.join(META, "0006_snapshot.json")
json.dump(snap, open(out, "w"), indent=1)

journal_path = os.path.join(META, "_journal.json")
journal = json.load(open(journal_path))
if not any(e.get("tag") == "0006_class_feature_toggles" for e in journal["entries"]):
    journal["entries"].append({
        "idx": 6,
        "version": "7",
        "when": int(__import__("time").time() * 1000),
        "tag": "0006_class_feature_toggles",
        "breakpoints": True,
    })
json.dump(journal, open(journal_path, "w"), indent=1)

print("wrote", out, "| id:", snap["id"][:8], "| prevId:", snap["prevId"][:8])
print("journal entries:", [e.get("tag") for e in journal["entries"]])
