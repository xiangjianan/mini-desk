---
name: release-mini-desk
description: Publish a Mini Desk project release. Use when the user asks to bump the project version, ship current repository changes to GitHub, deploy the built app to Cloudflare Pages, and create a GitHub release with the generated dist package attached. Any pending uncommitted work is first committed with an intelligently generated message and pushed to main; only then is the separate version-bump commit created, after which the normal release flow continues.
---

# Release Mini Desk

Use this workflow for this repository.

There are **two distinct commits** in every release that has pending work:

1. A **code commit** — describes the actual changes, with a message generated from the diff.
2. A **release commit** — `release <version>`, containing only the version-bump files.

The code commit is pushed to `main` first; the release commit is created only after that push succeeds.

## Release Workflow

1. Confirm the repository is on `main`.
   - Run `git status --short --branch`.
   - If not on `main`, switch only when it will not overwrite work.
   - Inspect dirty files before staging. Do not discard unrelated user changes.

2. **Commit pending work as its own commit (before any version bump).**
   - Inspect everything currently uncommitted:
     ```bash
     git status --short
     git diff HEAD
     ```
   - If there are pending changes (source, styles, docs, tests, etc.), commit them as a single commit that is **separate from the version bump**:
     - Generate the commit message **from the actual diff**, never a generic label. Match this repo's history — a conventional prefix plus a concise **Chinese** summary:
       - `feat:` new feature · `fix:` bug fix · `perf:` performance · `refactor:` · `docs:` · `test:` · `chore:`
       - Pick the prefix from the dominant change. When several types are mixed, prefer the most significant (`feat:` / `fix:` over `chore:`).
       - Real examples from this repo: `fix: 移动端主题按钮去除点击 focus 蓝色背景`, `perf: 添加首屏 loading 骨架消除白屏`, `feat: 提醒事项列宽超过阈值自动分多列`.
       - **Do not** use the `release <version>` message here — that is reserved for step 6.
     - **Append the changelog entry (before committing):** determine this release's target version now — patch+1 unless the user specified a version; step 4 must reuse the same value. **Curation policy — only significant, user-facing updates belong in the changelog**: new features, and major changes/optimizations users will clearly notice. Do NOT record tiny changes (small style tweaks, minor fixes). If this release contains only trivial changes, do NOT add a new entry — instead bump the existing top entry's `version` (and `date`) to the target version so the changelog's newest version always matches the released app version (`src/__tests__/changelog.test.ts` enforces this). Otherwise insert a new entry at the **top** of `CHANGELOG` in `src/state/changelog.ts`:
       ```ts
       {
         version: "<target version>",
         date: "<today, YYYY-MM-DD>",
         notes: { zh: ["…"], en: ["…"] },
       },
       ```
       Write detailed, bulleted notes (both zh and en) derived from this release's actual diff — same source as the commit message, but expanded into one bullet per significant user-facing change. Stage `src/state/changelog.ts` together with the other code changes in this same commit. If (and only if) the working tree was completely clean and no code commit is made, skip this append as well.
     - Stage intended source and metadata changes only. Do not stage `dist/`, release zips, or other build artifacts.
     - Commit with the generated message.
   - If the working tree is clean (no pending changes), skip this step and go straight to step 4.

3. **Push the code commit to `main` before touching the version.**
   - Push `main` to `origin`:
     ```bash
     git push origin main
     ```
   - The actual code changes must land on the main branch first, as their own commit, ahead of the version bump. Record this commit hash for the final report.

4. Bump the version in all three places it is hardcoded.
   - Read the current version.
   - Use the target version already determined in step 2. If step 2 produced no target version (clean tree, version-only release), use patch+1 unless the user specified a version — and bump the changelog top entry's version to match.
   - Use `npm version <version> --no-git-tag-version` (updates `package.json` and `package-lock.json`).
   - Also update the same version string in:
     - `index.html` → `<meta name="app-version" content="<version>" />`
     - `src/state/version.ts` → `FALLBACK_APP_VERSION`
   - All three must match; `src/__tests__/version.test.ts` enforces consistency and will fail the release otherwise.

5. Verify before committing.
   - Run `npm test` (this includes `version.test.ts`, which fails if the version locations disagree).
   - Run `npm run build`.
   - If verification fails, fix the failure before publishing. The code commit from step 2 may already be on `main` — that is expected; fix forward with a new commit rather than rewriting history.

6. **Commit the version bump and push.**
   - Stage **only** the version files: `package.json`, `package-lock.json`, `index.html`, `src/state/version.ts`.
   - Use the release-style commit message `release <version>` (for example `release 1.0.52`).
   - Push `main` to `origin`:
     ```bash
     git push origin main
     ```
   - The GitHub release tag in step 9 points at this commit.

7. Build the release package.
   - Remove or overwrite only the zip for the new version.
   - Run `npm run build`.
   - Create `dist-<version>.zip` from the generated `dist/` directory, preserving `dist` as the top-level folder in the archive:

```bash
rm -f "dist-<version>.zip"
zip -r "dist-<version>.zip" dist
```

8. Deploy to Cloudflare Pages.
   - Prefer the project script:

```bash
npm run deploy:cloudflare
```

   - If needed, deploy directly with:

```bash
npx wrangler pages deploy dist --project-name=todolist
```

   - Capture the deployment URL from Wrangler output.
   - Verify the deployed page responds and, when possible, confirm the page exposes the new version.

9. Create the GitHub release.
   - Tag format: `v<version>`, for example `v1.0.52`.
   - Use the release commit that was pushed to `main` in step 6.
   - Attach `dist-<version>.zip`.
   - Prefer `gh` when available:

```bash
gh release create "v<version>" "dist-<version>.zip" --title "v<version>" --notes "Release v<version>"
```

10. Clean up the local release package.
   - After the GitHub release is created successfully, delete the local `dist-<version>.zip`.
   - Do not delete `dist/`; it is the current build output and may be useful for local inspection.

```bash
rm -f "dist-<version>.zip"
```

11. Final response.
   - Report the version, **the code commit hash (step 2, if any) and the release commit hash (step 6)**, pushed branch, Cloudflare Pages URL, GitHub release URL, release asset name, and verification commands.
   - Confirm that the local `dist-<version>.zip` was removed.
   - Mention any other untracked artifacts left locally.

## Guardrails

- The pending-work commit (step 2) must describe the real changes; never label non-version work as `release <version>`.
- Never use destructive git commands such as `git reset --hard` or `git checkout --` unless the user explicitly asks. If verification fails after the code commit is pushed, fix forward with a new commit.
- Do not create a release if the push or deployment failed.
- Do not create a duplicate tag. If `v<version>` already exists, stop and explain the conflict.
- Keep release artifacts (`dist/`, zips) out of git unless the repository convention says otherwise.
