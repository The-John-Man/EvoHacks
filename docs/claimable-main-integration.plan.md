# Claimable main integration plan (north-america-implementation)

Align PR #1 with the vanilla JS Claimable app on `main` without changing screening logic.

1. **Merge** — Keep `north-america-implementation` current with `origin/main` (`git merge origin/main`; resolve only doc/guide conflicts if any).
2. **Docs** — Refresh `docs/cursor-handoff.md`, `docs/north-america-screening.md`, `docs/north-america.md`, and `docs/country-programs.md` so they describe the live U.S. architecture (`Claimable.screen`, `ClaimableData`, script order, status keys, `node --test tests/rules.test.js`) and separate “shipped” from planned CA/MX work.
3. **Verify locally** — `python3 -m http.server 5317`, open the intro (U.S. start + country guides), run the 12 rule tests.
4. **Push** — Commit on `north-america-implementation` and `git push -u origin north-america-implementation` so PR #1’s tip updates; do not open a new PR or merge to `main`.

No changes under `/opt` or other out-of-repo plan artifacts; this file lives in the repository only.