---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Commit as you go, not once at the end: after each green slice or completed ticket, commit it to the current branch before starting the next (see the commit cadence in `CLAUDE.md`).

Once done, call the Skill tool with "two-axis-code-review" to review the work, then commit any review fixes as their own commit.
