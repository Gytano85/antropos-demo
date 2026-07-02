// Plain `next start` always listens on port 3000 unless told otherwise.
// PaaS-style hosts (Hostinger's Node.js Web App panel included) assign a
// port at runtime via the PORT env var and reverse-proxy to it — if the app
// doesn't bind to that exact port, the proxy gets connection refused and
// the visitor sees a 503. This wrapper just forwards PORT (defaulting to
// 3000 for local use) to `next start -p <port>`.
const { spawn } = require("node:child_process");

const port = process.env.PORT || "3000";

const child = spawn("next", ["start", "-p", port], {
	stdio: "inherit",
	shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});
