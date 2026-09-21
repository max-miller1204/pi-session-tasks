import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packed package", () => {
	it("declares the minimum Node version required by Pi", () => {
		const metadata = JSON.parse(readFileSync("package.json", "utf8"));
		expect(metadata.engines.node).toBe(">=22.19");
	});

	it.each([
		["export default 42;\n", "Extension does not export a valid factory function"],
		["export default function () {}\n", "Packed extension must register todo"],
	])(
		"rejects an invalid packed extension even when the Pi CLI exits zero: %s",
		(source, error) => {
			const directory = mkdtempSync(join(tmpdir(), "pi-tasks-invalid-"));
			try {
				const fixture = join(directory, "fixture");
				mkdirSync(fixture);
				writeFileSync(
					join(fixture, "package.json"),
					JSON.stringify({
						name: "invalid-task-extension",
						version: "1.0.0",
						type: "module",
						pi: { extensions: ["./index.ts"] },
					}),
				);
				writeFileSync(join(fixture, "index.ts"), source);
				const packed = Object.values(
					JSON.parse(
						execFileSync("npm", ["pack", "--json", "--pack-destination", directory], {
							cwd: fixture,
							encoding: "utf8",
						}),
					) as Record<string, { filename: string }>,
				);
				expect(packed).toHaveLength(1);
				execFileSync("tar", ["-xzf", join(directory, packed[0].filename), "-C", directory]);
				const extracted = join(directory, "package");
				const cli = spawnSync(resolve("node_modules/.bin/pi"), ["-ne", "-e", extracted, "--list-models"], {
					cwd: directory,
					encoding: "utf8",
					env: { ...process.env, PI_CODING_AGENT_DIR: join(directory, "agent") },
				});
				expect(cli.status).toBe(0);
				const smoke = spawnSync(process.execPath, [resolve("scripts/package-smoke.ts"), extracted], {
					encoding: "utf8",
				});
				expect(smoke.status).not.toBe(0);
				expect(smoke.stderr).toContain(error);
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		30_000,
	);

	it("loads through Pi from an extracted npm tarball", () => {
		const output = execFileSync(process.execPath, ["scripts/package-smoke.ts"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
		expect(output).toContain("Packed Pi extension loaded successfully.");
	}, 30_000);
});
