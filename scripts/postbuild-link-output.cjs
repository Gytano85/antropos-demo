// Hostinger's "Node.js Web App" panel (Next.js preset) checks for a `.next`
// output directory at the configured "Root directory" (which is the repo
// root, "/", in our case) right after the build command finishes. Because
// this is a monorepo, the actual Next.js build output lives at
// `apps/web/.next`, not at the repo root — so that check fails with
// "ERROR: No output directory found after build" even though the build
// itself succeeded.
//
// This script runs as the root "postbuild" lifecycle hook (right after
// `npm run build`) and makes `.next` exist at the repo root too, by
// symlinking it to `apps/web/.next` (falling back to a full copy if the
// host doesn't allow symlinks).
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const target = path.join("apps", "web", ".next"); // relative, for the symlink
const absoluteSource = path.join(repoRoot, target);
const linkPath = path.join(repoRoot, ".next");

if (!fs.existsSync(absoluteSource)) {
	console.warn(
		`[postbuild] ${absoluteSource} not found, skipping .next link/copy.`,
	);
	process.exit(0);
}

try {
	if (fs.existsSync(linkPath) || fs.lstatSync(linkPath, { throwIfNoEntry: false })) {
		fs.rmSync(linkPath, { recursive: true, force: true });
	}
} catch {
	// ignore, path simply didn't exist
}

try {
	fs.symlinkSync(target, linkPath, "dir");
	console.log(`[postbuild] Symlinked .next -> ${target}`);
} catch (err) {
	console.warn(
		`[postbuild] Symlink failed (${err.message}), falling back to copying the directory...`,
	);
	fs.cpSync(absoluteSource, linkPath, { recursive: true });
	console.log(`[postbuild] Copied ${target} -> .next`);
}
