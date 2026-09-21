import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(join(tmpdir(), "pi-session-tasks-"));

try {
	const packOutput = execFileSync("npm", ["pack", "--json", "--pack-destination", temporaryDirectory], {
		cwd: repositoryDirectory,
		encoding: "utf8",
	});
	const packedFiles = Object.values(JSON.parse(packOutput) as Record<string, { filename: string }>);
	if (packedFiles.length !== 1) {
		throw new Error(`Expected one packed tarball, received ${packedFiles.length}.`);
	}
	const tarballPath = resolve(temporaryDirectory, packedFiles[0].filename);
	execFileSync("tar", ["-xzf", tarballPath, "-C", temporaryDirectory]);

	const piExecutable = resolve(repositoryDirectory, "node_modules/.bin/pi");
	const packageDirectory = resolve(join(temporaryDirectory, "package"));
	execFileSync(piExecutable, ["-e", packageDirectory, "--list-models"], {
		cwd: repositoryDirectory,
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});

	console.log("Packed Pi extension loaded successfully.");
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}
