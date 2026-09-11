Review the implementation against the task, then land it. Do not stop after writing findings. Do not wait for a human.

1. Review against the task file:
   - Requirements are actually done
   - Tests cover the change (add them if they are missing)
   - No regressions, debug leftovers, or unrelated refactors
   - Style and naming match the surrounding code
2. Address every finding in this checkout. Stay in scope.
3. Commit and push (`git add`, `git commit`, `git push -u origin HEAD`).
4. Open a pull request (`gh pr create --fill`).
5. Merge and close that PR (`gh pr merge --delete-branch`, using the repo's usual merge).
6. Delete the local branch. If this task used a worktree, remove the worktree after merge.
7. Run `htasks move <id> <next_step>`.

If the work is still not ready after step 2, say what is missing and do not move the task.
