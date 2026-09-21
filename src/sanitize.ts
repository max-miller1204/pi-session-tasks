// Terminal text contains control characters by definition.
// biome-ignore-all lint/suspicious/noControlCharactersInRegex: Match terminal control sequences.
export function sanitizeTerminalText(value: string): string {
	return value
		.replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "")
		.replace(/(?:\u001b\]|\u009d)[^\u0007\u009c\u001b]*(?:\u0007|\u009c|\u001b\\)?/g, "")
		.replace(/\u001b./g, "")
		.replace(/[\u2028\u2029]/g, " ")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) =>
			character === "\n" || character === "\r" || character === "\t" ? " " : "",
		)
		.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}
