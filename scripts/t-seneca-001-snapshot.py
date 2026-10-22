#!/usr/bin/env python3
"""T-SENECA-001 — append the three v2-native tables to the drizzle meta
snapshot (the additive-migration bookkeeping 0005-0009 performed; the
rebaseline verify gate compares runtime schema.ts against this snapshot).

Hand-generated to mirror the exact drizzle-kit introspection shapes used by
the checked-in baseline (public.assignments / public.class_members as the
format references). Run: python3 scripts/t-seneca-001-snapshot.py
"""
import json

SNAP = "packages/db/drizzle/meta/0000_snapshot.json"


def col(name, type_, not_null=False, pk=False, default=None):
    c = {"name": name, "type": type_, "primaryKey": pk, "notNull": not_null}
    if default is not None:
        c["default"] = default
    return name, c


def idx(name, columns):
    return name, {
        "name": name,
        "columns": [
            {
                "expression": c,
                "isExpression": False,
                "asc": True,
                "nulls": "last",
                "opclass": op,
            }
            for (c, op) in columns
        ],
        "isUnique": False,
        "concurrently": False,
        "method": "btree",
        "with": {},
    }


def fk(name, table_from, table_to, col_from, col_to, on_delete="no action"):
    return name, {
        "name": name,
        "tableFrom": table_from,
        "tableTo": table_to,
        "columnsFrom": col_from,
        "columnsTo": col_to,
        "onDelete": on_delete,
        "onUpdate": "no action",
    }


def uq(name, columns):
    return name, {"name": name, "nullsNotDistinct": False, "columns": columns}


def ck(name, value):
    return name, {"name": name, "value": value}


def table(name, columns, indexes, fks, uqs, checks):
    return f"public.{name}", {
        "name": name,
        "schema": "",
        "columns": dict(columns),
        "indexes": dict(indexes),
        "foreignKeys": dict(fks),
        "compositePrimaryKeys": {},
        "uniqueConstraints": dict(uqs),
        "policies": {},
        "checkConstraints": dict(checks),
        "isRLSEnabled": False,
    }


TS = "timestamp with time zone"
ARRAY_ARR = "(ARRAY['{}'::character varying])::text[]"

seneca_resources = table(
    "seneca_resources",
    [
        col("id", "varchar(64)", not_null=True, pk=True),
        col("course_slug", "varchar(64)", not_null=True),
        col("kind", "varchar(16)", not_null=True),
        col("title", "varchar(300)"),
        col("topic_path", "text"),
        col("marks_total", "integer"),
        col("question_type", "varchar(60)"),
        col("content_json", "jsonb", not_null=True),
        col("created_at", TS, not_null=True, default="now()"),
    ],
    [
        idx(
            "ix_seneca_resources_course_kind",
            [("course_slug", "text_ops"), ("kind", "text_ops")],
        ),
        idx(
            "ix_seneca_resources_topic",
            [("course_slug", "text_ops"), ("topic_path", "text_ops")],
        ),
    ],
    [],
    [],
    [
        ck(
            "seneca_resources_kind_check",
            '(kind)::text = ANY ((ARRAY[\'courseSection\'::character varying, \'examQuestion\'::character varying, \'quiz\'::character varying])::text[])',
        ),
        ck(
            "seneca_resources_marks_check",
            "(marks_total IS NULL OR (marks_total >= 0))",
        ),
    ],
)

assignment_resources = table(
    "assignment_resources",
    [
        col("id", "uuid", not_null=True, pk=True),
        col("assignment_id", "uuid", not_null=True),
        col("resource_id", "varchar(64)", not_null=True),
        col("position", "integer", not_null=True),
        col("created_at", TS, not_null=True, default="now()"),
    ],
    [
        idx(
            "ix_assignment_resources_assignment",
            [("assignment_id", "uuid_ops"), ("position", "int4_ops")],
        ),
        idx("ix_assignment_resources_resource", [("resource_id", "text_ops")]),
    ],
    [
        fk(
            "fk_assignment_resources_assignment",
            "assignment_resources",
            "assignments",
            ["assignment_id"],
            ["id"],
            on_delete="cascade",
        ),
        fk(
            "fk_assignment_resources_resource",
            "assignment_resources",
            "seneca_resources",
            ["resource_id"],
            ["id"],
        ),
    ],
    [uq("ux_assignment_resources_pair", ["assignment_id", "resource_id"])],
    [ck("assignment_resources_position_check", "(position >= 1)")],
)

assignment_resource_states = table(
    "assignment_resource_states",
    [
        col("id", "uuid", not_null=True, pk=True),
        col("assignment_id", "uuid", not_null=True),
        col("learner_id", "uuid", not_null=True),
        col("resource_id", "varchar(64)", not_null=True),
        col("status", "varchar(16)", not_null=True, default="'todo'"),
        col("marks_awarded", "integer"),
        col("score", "double precision"),
        col("completed_at", TS),
        col("updated_at", TS, not_null=True, default="now()"),
    ],
    [
        idx(
            "ix_assignment_resource_states_learner",
            [("learner_id", "uuid_ops")],
        ),
        idx(
            "ix_assignment_resource_states_assignment",
            [("assignment_id", "uuid_ops")],
        ),
    ],
    [
        fk(
            "fk_assignment_resource_states_assignment",
            "assignment_resource_states",
            "assignments",
            ["assignment_id"],
            ["id"],
            on_delete="cascade",
        ),
        fk(
            "fk_assignment_resource_states_learner",
            "assignment_resource_states",
            "users",
            ["learner_id"],
            ["id"],
            on_delete="cascade",
        ),
    ],
    [
        uq(
            "ux_assignment_resource_states_triple",
            ["assignment_id", "learner_id", "resource_id"],
        )
    ],
    [
        ck(
            "assignment_resource_states_status_check",
            "(status)::text = ANY ((ARRAY['todo'::character varying, 'complete'::character varying])::text[])",
        ),
        ck(
            "assignment_resource_states_marks_check",
            "(marks_awarded IS NULL OR (marks_awarded >= 0))",
        ),
        ck(
            "assignment_resource_states_score_check",
            '(("score" IS NULL) OR (("score" >= 0) AND ("score" <= 1)))',
        ),
    ],
)

d = json.load(open(SNAP))
assert len(d["tables"]) == 75, f"expected 75 tables, found {len(d['tables'])}"
for t in (seneca_resources, assignment_resources, assignment_resource_states):
    assert t[0] not in d["tables"], f"already present: {t[0]}"
    d["tables"][t[0]] = t[1]
d["id"] = d.get("id")
d["_meta"] = {
    "columns": {},
    "schemas": {},
    "tables": {
        k: {"orm": {"schema": ""}, "name": v["name"], "schema": ""}
        for k in []
    },
}
# keep _meta untouched — only the tables map grows (the 0005-0009 posture)
d["_meta"] = json.load(open(SNAP)).get("_meta", d["_meta"])
json.dump(d, open(SNAP, "w"), indent=2)
open(SNAP, "a").write("\n")
print("snapshot now has", len(d["tables"]), "tables")
