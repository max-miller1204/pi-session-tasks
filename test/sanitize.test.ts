import { describe, expect, it } from "vitest";
import { sanitizeTerminalText } from "../src/sanitize.ts";

describe("sanitizeTerminalText", () => {
	it("removes terminal sequences, layout controls, and bidi controls", () => {
		expect(sanitizeTerminalText("safe\u001b[31m red\u001b[0m\nnext\tcell\u202eright-to-left\u202c")).toBe(
			"safe red next cellright-to-left",
		);
	});

	it("removes complete OSC payloads and unterminated OSC tails", () => {
		expect(sanitizeTerminalText("before\u001b]0;title\u0007after")).toBe("beforeafter");
		expect(sanitizeTerminalText("before\u001b]0;unterminated")).toBe("before");
	});
});
