import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		allowOnly: false,
		passWithNoTests: false,
		expect: {
			requireAssertions: true,
		},
	},
});
