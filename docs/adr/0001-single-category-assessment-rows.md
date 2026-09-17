# Single-category Assessment rows, not a wide multi-category record

The requirements document defines an Assessment with one "Skill/category" field (§19), but the Monthly Assessment example (§21) shows five category scores — Grammar, Reading, Listening, Speaking, Writing — reported together under one title and date. We considered giving Assessment a column per possible category (a wide record), but rejected it: Levels use different, variable-length category sets (§18/§43 — one Level uses only "General English Performance," another uses six categories), which a fixed-width row can't represent without a growing set of nullable columns every time a new category or Subject is added.

Instead, an Assessment is always single-category. A "Monthly Assessment" event is several Assessment rows that share the same `(title, type, date, group)`, one per configured category for that Level, with the "Overall" figure computed as their normalized average at read time — never stored. This keeps the schema identical across every Level regardless of how many categories it uses, at the cost of grouping related rows by matching fields rather than a single foreign key to a parent "assessment event" record.

Status: accepted
