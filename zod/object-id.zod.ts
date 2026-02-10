import z from "zod";

export const ObjectIdSchema = z.string().refine(
	(value) => {
		return /^[0-9a-fA-F]{24}$/.test(value);
	},
	{
		message: "Invalid MongoDB ObjectId format",
	},
);
