# Local build storage

Use `$HOME/scratch/slam_web` for large build outputs, compiler caches, profiling
traces, downloads and disposable worktrees. Prefer project-specific `build`,
`tmp` and `profiles` directories. Set tool-specific output/cache variables per
command or environment. Reuse owned caches; do not move a cache while a process
uses it or delete another task's data. Keep durable review evidence in this repo.
Derive machine-local paths from `$HOME`; do not hard-code a username or machine
path into portable sources.

# Commits in this checkout

Use `James Goppert <james.goppert@gmail.com>` as the Git author and committer.
Create every commit with `git commit -s` so it includes the matching DCO
`Signed-off-by` trailer. Do not add AI co-author or AI attribution trailers.
Use neutral branch names and commit messages without assistant or tool branding.
