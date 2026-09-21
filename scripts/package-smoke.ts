import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

const repositoryDirectory = resolve(process.argv[2] ?? process.cwd());
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

	const packageDirectory = resolve(join(temporaryDirectory, "package"));
	const loaded = await discoverAndLoadExtensions([packageDirectory], temporaryDirectory, temporaryDirectory);
	assert.deepEqual(loaded.errors, [], "Packed extension loader errors");
	assert.equal(loaded.extensions.length, 1, "Expected one packed extension");
	assert.ok(
		loaded.extensions[0].resolvedPath.startsWith(`${packageDirectory}/`),
		"Extension must come from the extracted package",
	);
	assert.ok(loaded.extensions[0].tools.has("todo"), "Packed extension must register todo");

	console.log("Packed Pi extension loaded successfully.");
} finally {
	rmSync(temporaryDirectory, { recursive: true, force: true });
}
