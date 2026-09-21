import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("packed package", () => {
	it("loads through Pi from an extracted npm tarball", () => {
		const output = execFileSync(process.execPath, ["scripts/package-smoke.ts"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
		expect(output).toContain("Packed Pi extension loaded successfully.");
	}, 30_000);
});
