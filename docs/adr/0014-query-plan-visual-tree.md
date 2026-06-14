# ADR-0014 — Query Plan: visual tree over raw table output

**Status:** Accepted — **built** (2026-06-14)
**Date:** 2026-06-04

> **Built:** `driver.explainQuery(sql, analyze)` on all three engines →
> `session.explainQuery` (not history-captured; ANALYZE of a write blocked on
> read-only connections) → IPC/preload `sessions.explainQuery`. Per-engine
> parsing: pg `EXPLAIN (FORMAT JSON[, ANALYZE])` → recursive `PlanNode` tree;
> mysql tabular `EXPLAIN` → flat nodes, `EXPLAIN ANALYZE` text → indented `->`
> tree parse; sqlite `EXPLAIN QUERY PLAN` → parent/child id tree. Rendered by
> `QueryPlanPanel.tsx` (tree with full-scan/index badges, est/actual rows, cost,
> timings) with a **Raw toggle** fallback. Explain/Analyze buttons in the
> QueryView toolbar; Analyze shows a confirm (it executes). Unknown node types
> degrade gracefully (no badge).

## Context

The Query Plan feature (see CONTEXT.md § Query Plan) runs `EXPLAIN` /
`EXPLAIN ANALYZE` for a SQL statement and surfaces the result in the editor.
The central question is how to render it.

Two realistic options:

**A. Raw table** — pass the engine's EXPLAIN output straight to the existing
result grid (the same component that renders SELECT results). Zero parsing;
works immediately for all engines; complete information is always present.

**B. Visual tree** — parse each engine's output format into a unified node
structure and render it as an annotated tree with per-node badges (full-scan
warning, index used, cost, row count).

## Decision

**Visual tree (option B).**

The feature's core value proposition is answering "will this full-scan?" at a
glance — not dumping raw output the user must manually scan. Raw table output
achieves correctness but fails the UX goal: MySQL's `EXPLAIN` returns ~11
columns and the signal (`type=ALL`) is buried; Postgres JSON plan is
unreadable as a flat table. Without parsing and highlighting, the feature is
technically complete but practically useless for the non-expert use case.

## Trade-offs accepted

- **Per-engine parsing complexity.** Three distinct parsers must be maintained.
  Mitigation: engines are stable in their EXPLAIN formats; breaking changes are
  rare and announced.
- **Risk of misparse.** If a parser mis-reads an edge-case plan, the user sees
  wrong annotations. Mitigation: always show a "raw" toggle as a fallback so
  the full engine output is never hidden.
- **Ongoing maintenance.** New engine versions may add plan node types.
  Mitigation: unknown node types degrade gracefully (no badge, no crash).

## Rejected alternative

Raw table passthrough is adequate for power users who already know how to read
EXPLAIN output but adds no value over running the query manually in the editor.
The target user is someone who needs the tool to flag the problem, not someone
who already knows what to look for.
