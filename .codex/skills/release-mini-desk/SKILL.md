---
name: release-mini-desk
description: Publish a Mini Desk project release. Use when the user asks to bump the project version, commit and push current repository changes to GitHub, deploy the built app to Cloudflare Pages, and create a GitHub release with the generated dist package attached.
---

# Release Mini Desk

Use this workflow for this repository.

## Release Workflow

1. Confirm the repository is on `main`.
   - Run `git status --short --branch`.
   - If not on `main`, switch only when it will not overwrite work.
   - Inspect dirty files before staging. Do not discard unrelated user changes.

2. Bump the version in `package.json`.
   - Read the current version.
   - If the user did not specify a version, increment the patch version.
   - Use `npm version <version> --no-git-tag-version` or a scoped package edit.
   - If `package-lock.json` exists, keep it in sync.

3. Verify before committing.
   - Run focused tests relevant to the current changes when known.
   - Run `npm run build`.
   - If verification fails, fix the failure before publishing.

4. Commit and push to GitHub.
   - Stage intended source and metadata changes only.
   - Do not commit release zip files unless the repository already tracks them.
   - Use a release-style commit message, for example `release 1.0.52`.
   - Push `main` to `origin`.

5. Build the release package.
   - Remove or overwrite only the zip for the new version.
   - Run `npm run build`.
   - Create `dist-<version>.zip` from the generated `dist/` directory, preserving `dist` as the top-level folder in the archive:

```bash
rm -f "dist-<version>.zip"
zip -r "dist-<version>.zip" dist
```

6. Deploy to Cloudflare Pages.
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

7. Create the GitHub release.
   - Tag format: `v<version>`, for example `v1.0.52`.
   - Use the commit that was pushed to `main`.
   - Attach `dist-<version>.zip`.
   - Prefer `gh` when available:

```bash
gh release create "v<version>" "dist-<version>.zip" --title "v<version>" --notes "Release v<version>"
```

8. Final response.
   - Report the version, commit hash, pushed branch, Cloudflare Pages URL, GitHub release URL, release asset name, and verification commands.
   - Mention any untracked artifacts left locally.

## Guardrails

- Never use destructive git commands such as `git reset --hard` or `git checkout --` unless the user explicitly asks.
- Do not create a release if the push or deployment failed.
- Do not create a duplicate tag. If `v<version>` already exists, stop and explain the conflict.
- Keep release artifacts out of git unless the repository convention says otherwise.
