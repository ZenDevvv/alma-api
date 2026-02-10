// import { PrismaClient } from "../generated/prisma";

// export async function generateOrderNumberCompact(prisma: PrismaClient): Promise<string> {
// 	const now = new Date();

// 	const year = now.getFullYear();
// 	const month = String(now.getMonth() + 1).padStart(2, "0");
// 	const day = String(now.getDate()).padStart(2, "0");
// 	const hours = String(now.getHours()).padStart(2, "0");
// 	const minutes = String(now.getMinutes()).padStart(2, "0");
// 	const seconds = String(now.getSeconds()).padStart(2, "0");

// 	const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
// 	const prefix = `DO-${timestamp}-`;

// 	const latestOrder = await prisma.delivery.findFirst({
// 		where: {
// 			orderNumber: {
// 				startsWith: prefix,
// 			},
// 		},
// 		orderBy: {
// 			orderNumber: "desc",
// 		},
// 		select: {
// 			orderNumber: true,
// 		},
// 	});

// 	let nextNumber = 1;

// 	if (latestOrder) {
// 		const lastNumber = parseInt(latestOrder.orderNumber.split("-")[2], 10);
// 		nextNumber = lastNumber + 1;
// 	}

// 	const paddedNumber = nextNumber.toString().padStart(3, "0");
// 	return `${prefix}${paddedNumber}`;
// }
