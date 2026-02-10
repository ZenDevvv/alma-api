import { Prisma, PrismaClient } from "@prisma/client";

interface SequenceConfig {
	prefix: string;
	digits?: number;
	separator?: string;
}

type ModelName =
	| "deliveryOrder"
	| "deliveryRequest"
	| "purchaseOrder"
	| "invoice"
	| "transaction"
	| "lot";

export function generateUniqueCode(lastCode: string | null | undefined, prefix: string): string {
	const currentYear = new Date().getFullYear();

	if (!lastCode) {
		return `${prefix}-${currentYear}-0001`;
	}

	const parts = lastCode.split("-");
	const lastSequence = parseInt(parts[parts.length - 1]) || 0;
	const nextSequence = lastSequence + 1;

	return `${prefix}-${currentYear}-${nextSequence.toString().padStart(4, "0")}`;
}

export function formatSequentialNumber(
	sequence: number,
	year: number,
	config: SequenceConfig,
): string {
	const { prefix, digits = 4, separator = "-" } = config;
	const paddedSequence = sequence.toString().padStart(digits, "0");
	return `${prefix}${separator}${year}${separator}${paddedSequence}`;
}

export async function getNextSequence<T extends ModelName>(
	prisma: PrismaClient | Prisma.TransactionClient,
	modelName: T,
	year?: number,
): Promise<{ sequence: number; year: number }> {
	const currentYear = year || new Date().getFullYear();

	const client = prisma as any;
	// Get the model dynamically
	const model = client[modelName] as any;

	// Use aggregate to get max sequence for current year
	// This is extremely fast - O(1) with proper indexing
	const result = await model.aggregate({
		where: {
			year: currentYear,
		},
		_max: {
			sequence: true,
		},
	});

	// Get the next sequence number
	const maxSequence = result._max.sequence || 0;
	const nextSequence = maxSequence + 1;

	return {
		sequence: nextSequence,
		year: currentYear,
	};
}

export async function generateNextNumber<T extends ModelName>(
	prisma: PrismaClient | Prisma.TransactionClient,
	modelName: T,
	config: SequenceConfig,
): Promise<{ number: string; sequence: number; year: number }> {
	const { sequence, year } = await getNextSequence(prisma, modelName);
	const number = formatSequentialNumber(sequence, year, config);

	return {
		number,
		sequence,
		year,
	};
}
