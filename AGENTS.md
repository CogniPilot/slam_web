# Local build storage

Put temporary builds, build checkouts, dependency caches and regenerable
downloads under a task-specific directory in `/tmp`, for example
`/tmp/slam_web-<task>`. `/tmp` may be wiped periodically: recreate and verify
inputs at the start of each run, and remove the task's `/tmp` files once its
results are sealed. Keep unique data, uncommitted or unpushed work, cited
evidence, results and one-attempt records in persistent storage, never only in
`/tmp`. Check free disk space before heavy jobs.

Many scripts still default to `$HOME/scratch/slam_web`. When running one,
point its output and cache options at the task's `/tmp` directory. Or, once
nothing unique is left in it (move worktrees with unpushed commits to
persistent storage first), replace `$HOME/scratch/slam_web` with a link to it.
Set tool-specific output/cache variables per command or environment. Reuse owned caches; do not move a cache while a
process uses it or delete another task's data. Keep durable review evidence in
this repo. Do not hard-code a username or machine path into portable sources.

# Commits in this checkout

Commit under your own Git identity.
Create every commit with `git commit -s` so it includes the matching DCO
`Signed-off-by` trailer. Do not add AI co-author or AI attribution trailers.
Use neutral branch names and commit messages without assistant or tool branding.
