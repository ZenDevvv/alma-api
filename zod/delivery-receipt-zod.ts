import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { DeliveryReceiptItem, DeliveryReceiptItemSchema } from "./receipt-item-zod";

export const DeliveryReceiptStatusEnum = z.enum(["pending", "partial", "completed", "rejected"]);
export const ConditionEnum = z.enum(["good", "damaged"]);

export const DeliveryReceiptSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), "Invalid MongoDB ObjectId"),
	receiptNumber: z.string().min(1, "Receipt number is required"),

	deliveryRequestId: z
		.string()
		.refine((val) => isValidObjectId(val), "Invalid delivery ID")
		.nullable()
		.optional(),
	deliveryOrderId: z.string().refine((val) => isValidObjectId(val), "Invalid delivery order ID"),

	receivedDate: z.coerce.date(),

	receivedById: z.string().refine((val) => isValidObjectId(val), "Invalid received by ID"),

	inspectedById: z
		.string()
		.refine((val) => isValidObjectId(val), "Invalid inspected by ID")
		.nullable()
		.optional(),

	condition: ConditionEnum.nullable().optional(),
	inspectionNotes: z.string().nullable().optional(),
	discrepancyReported: z.boolean(),
	discrepancyDetails: z.string().nullable().optional(),

	attachments: z.array(z.string()).optional(),

	receiverSignature: z.string().nullable().optional(),
	delivererSignature: z.string().nullable().optional(),

	items: z.array(DeliveryReceiptItemSchema).optional(),

	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),

	userId: z
		.string()
		.refine((val) => isValidObjectId(val), "Invalid user ID")
		.nullable()
		.optional(),
});

export type DeliveryReceipt = z.infer<typeof DeliveryReceiptSchema>;
export type DeliveryReceiptStatus = z.infer<typeof DeliveryReceiptStatusEnum>;
export type Condition = z.infer<typeof ConditionEnum>;

export const CreateDeliveryReceiptSchema = DeliveryReceiptSchema.omit({
	id: true,
	receiptNumber: true,
	createdAt: true,
	updatedAt: true,
}).extend({
	receivedDate: z.coerce.date().default(() => new Date()),
	discrepancyReported: z.boolean().default(false),
	attachments: z.array(z.string()).default([]),
	isActive: z.boolean().default(true),
	isDeleted: z.boolean().default(false),
});

export type CreateDeliveryReceipt = z.infer<typeof CreateDeliveryReceiptSchema>;

export const UpdateDeliveryReceiptSchema = DeliveryReceiptSchema.omit({
	id: true,
	receiptNumber: true,
	deliveryOrderId: true,
	receivedById: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateDeliveryReceipt = z.infer<typeof UpdateDeliveryReceiptSchema>;

export type DeliveryReceiptWithRelation = DeliveryReceipt & {
	items: DeliveryReceiptItem;
};
