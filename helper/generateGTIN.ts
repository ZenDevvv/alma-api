/**
 * GS1 GTIN (Global Trade Item Number) Helper Functions
 * Supports GTIN-8, GTIN-12, GTIN-13, and GTIN-14 formats
 */

export enum GTINFormat {
	GTIN8 = 8,
	GTIN12 = 12,
	GTIN13 = 13,
	GTIN14 = 14,
}

export interface GTINGeneratorOptions {
	format: GTINFormat;
	companyPrefix: string; // Your GS1 Company Prefix
	itemReference?: string; // Optional item reference number
}

export interface GTINValidationResult {
	isValid: boolean;
	errors: string[];
	format?: GTINFormat;
}

/**
 * Calculate GS1 check digit using the standard algorithm
 * @param gtin - GTIN without check digit
 * @returns check digit (0-9)
 */
export function calculateCheckDigit(gtin: string): number {
	const digits = gtin.split("").map(Number);
	let sum = 0;

	// Process from right to left
	for (let i = digits.length - 1; i >= 0; i--) {
		const position = digits.length - i;
		const multiplier = position % 2 === 0 ? 1 : 3;
		sum += digits[i] * multiplier;
	}

	const remainder = sum % 10;
	return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Generate a GTIN based on company prefix and item reference
 * @param options - Generator configuration
 * @returns Complete GTIN with check digit
 */
export function generateGTIN(options: GTINGeneratorOptions): string {
	const { format, companyPrefix, itemReference } = options;

	// Validate company prefix
	if (!companyPrefix || !/^\d+$/.test(companyPrefix)) {
		throw new Error("Company prefix must contain only digits");
	}

	// Calculate required item reference length
	const totalDigits = format - 1; // Exclude check digit
	const itemRefLength = totalDigits - companyPrefix.length;

	if (itemRefLength < 1) {
		throw new Error(`Company prefix is too long for ${GTINFormat[format]} format`);
	}

	// Generate or validate item reference
	let itemRef = itemReference || "";
	if (!itemRef) {
		// Generate random item reference
		itemRef = Math.floor(Math.random() * Math.pow(10, itemRefLength))
			.toString()
			.padStart(itemRefLength, "0");
	} else {
		// Validate and pad provided item reference
		if (!/^\d+$/.test(itemRef)) {
			throw new Error("Item reference must contain only digits");
		}
		itemRef = itemRef.padStart(itemRefLength, "0");
		if (itemRef.length > itemRefLength) {
			throw new Error(`Item reference exceeds maximum length of ${itemRefLength} digits`);
		}
	}

	// Construct GTIN without check digit
	const gtinWithoutCheck = companyPrefix + itemRef;

	// Calculate and append check digit
	const checkDigit = calculateCheckDigit(gtinWithoutCheck);
	return gtinWithoutCheck + checkDigit;
}

/**
 * Generate GTIN-13 (most common format, used for retail products)
 * @param companyPrefix - Your GS1 company prefix
 * @param itemReference - Optional product reference
 * @returns GTIN-13 string
 */
export function generateGTIN13(companyPrefix: string, itemReference?: string): string {
	const trimmedItemRef = itemReference ? itemReference.slice(-8) : undefined;
	return generateGTIN({
		format: GTINFormat.GTIN13,
		companyPrefix,
		itemReference: trimmedItemRef,
	});
}

/**
 * Generate GTIN-14 (used for trade units/cases)
 * @param companyPrefix - Your GS1 company prefix
 * @param itemReference - Optional product reference
 * @param indicator - Packaging level indicator (0-8)
 * @returns GTIN-14 string
 */
export function generateGTIN14(
	companyPrefix: string,
	itemReference?: string,
	indicator: number = 0,
): string {
	if (indicator < 0 || indicator > 8) {
		throw new Error("Indicator digit must be between 0 and 8");
	}

	const baseGTIN = generateGTIN({
		format: GTINFormat.GTIN13,
		companyPrefix,
		itemReference,
	});

	// Remove check digit from GTIN-13
	const gtinWithoutCheck = baseGTIN.slice(0, -1);

	// Add indicator digit at the beginning
	const gtin14WithoutCheck = indicator + gtinWithoutCheck;

	// Recalculate check digit for GTIN-14
	const checkDigit = calculateCheckDigit(gtin14WithoutCheck);
	return gtin14WithoutCheck + checkDigit;
}

/**
 * Validate a GTIN string
 * @param gtin - GTIN to validate
 * @returns Validation result with errors if any
 */
export function validateGTIN(gtin: string): GTINValidationResult {
	const errors: string[] = [];

	// Check if GTIN exists
	if (!gtin) {
		errors.push("GTIN is required");
		return { isValid: false, errors };
	}

	// Check format (digits only)
	if (!/^\d+$/.test(gtin)) {
		errors.push("GTIN must contain only digits");
		return { isValid: false, errors };
	}

	// Check length
	const validLengths = [8, 12, 13, 14];
	if (!validLengths.includes(gtin.length)) {
		errors.push(`GTIN must be 8, 12, 13, or 14 digits long (found ${gtin.length})`);
		return { isValid: false, errors };
	}

	// Validate check digit
	const providedCheckDigit = parseInt(gtin[gtin.length - 1]);
	const calculatedCheckDigit = calculateCheckDigit(gtin.slice(0, -1));

	if (providedCheckDigit !== calculatedCheckDigit) {
		errors.push(
			`Invalid check digit (expected ${calculatedCheckDigit}, got ${providedCheckDigit})`,
		);
		return { isValid: false, errors, format: gtin.length as GTINFormat };
	}

	return {
		isValid: true,
		errors: [],
		format: gtin.length as GTINFormat,
	};
}

/**
 * Format GTIN with proper spacing for readability
 * @param gtin - GTIN string
 * @returns Formatted GTIN
 */
export function formatGTIN(gtin: string): string {
	const validation = validateGTIN(gtin);
	if (!validation.isValid) {
		throw new Error(`Invalid GTIN: ${validation.errors.join(", ")}`);
	}

	// Format based on length
	switch (gtin.length) {
		case 8:
			return gtin.replace(/(\d{4})(\d{3})(\d{1})/, "$1 $2 $3");
		case 12:
			return gtin.replace(/(\d{1})(\d{5})(\d{5})(\d{1})/, "$1 $2 $3 $4");
		case 13:
			return gtin.replace(/(\d{1})(\d{6})(\d{5})(\d{1})/, "$1 $2 $3 $4");
		case 14:
			return gtin.replace(/(\d{1})(\d{1})(\d{6})(\d{5})(\d{1})/, "$1 $2 $3 $4 $5");
		default:
			return gtin;
	}
}

/**
 * Convert SKU to numeric string for GTIN generation
 * Extracts digits from SKU or generates hash if no digits present
 * @param sku - Product SKU
 * @returns Numeric string suitable for item reference
 */
export function skuToItemReference(sku: string): string {
	// Extract only digits from SKU
	const digits = sku.replace(/\D/g, "");

	if (digits.length > 0) {
		return digits;
	}

	// If no digits in SKU, create a simple hash
	let hash = 0;
	for (let i = 0; i < sku.length; i++) {
		const char = sku.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString();
}
