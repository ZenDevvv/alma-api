/**
 * Convert SKU (e.g. "SYR-005") into a numeric code using ASCII
 * - Letters -> ASCII codes
 * - Numbers stay as-is
 * - Dashes are skipped
 */
export function convertSkuToAsciiDigits(sku: string): string {
	return sku
		.split("") // split into characters
		.map((char) => {
			if (/[A-Za-z]/.test(char)) {
				return char.charCodeAt(0).toString(); // convert letter to ASCII
			} else if (/[0-9]/.test(char)) {
				return char; // keep digits
			} else {
				return ""; // skip dash or special chars
			}
		})
		.join("");
}
