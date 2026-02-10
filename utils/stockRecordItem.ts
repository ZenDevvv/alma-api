// import { PrismaClient } from "../generated/prisma";

// interface ProductStockData {
// 	product: any;
// 	totalQuantity: number;
// 	lastUpdated: Date;
// 	batches: Set<string>;
// }

// interface BatchData {
// 	product: any;
// 	batch: any;
// 	quantity: number;
// 	movements: Array<{ quantity: number; date: Date; batchNumber?: string }>;
// }

// export async function getStockLevels(departmentId: string, prisma: PrismaClient) {
// 	// Fetch all stock items for the department
// 	const stockItems = await prisma.stockItem.findMany({
// 		where: {
// 			inventoryRecord: {
// 				departmentId: departmentId,
// 				isDeleted: false,
// 			},
// 			isDeleted: false,
// 		},
// 		include: {
// 			product: {
// 				include: {
// 					category: true,
// 					productType: true,
// 				},
// 			},
// 			batch: true,
// 			inventoryRecord: true,
// 		},
// 		orderBy: {
// 			updatedAt: "desc",
// 		},
// 	});

// 	const productStockMap = new Map<string, ProductStockData>();

// 	stockItems.forEach((item) => {
// 		if (!item.product) return;

// 		const productId = item.productId;
// 		const quantity = item.quantity || 0;

// 		const existing = productStockMap.get(productId);

// 		if (existing) {
// 			productStockMap.set(productId, {
// 				product: existing.product,
// 				totalQuantity: existing.totalQuantity + quantity,
// 				lastUpdated:
// 					item.updatedAt > existing.lastUpdated ? item.updatedAt : existing.lastUpdated,
// 				batches: item.batchId ? existing.batches.add(item.batchId) : existing.batches,
// 			});
// 		} else {
// 			const batches = new Set<string>();
// 			if (item.batchId) batches.add(item.batchId);
// 			productStockMap.set(productId, {
// 				product: item.product,
// 				totalQuantity: quantity,
// 				lastUpdated: item.updatedAt,
// 				batches,
// 			});
// 		}
// 	});

// 	// Transform to response format
// 	const stockLevels = Array.from(productStockMap.values()).map(
// 		({ product, totalQuantity, lastUpdated, batches }) => {
// 			const currentStock = totalQuantity;

// 			// Determine status based on reorder and max levels
// 			let status: "In Stock" | "Low Stock" | "Critical" | "Overstock";
// 			if (currentStock <= 0) {
// 				status = "Critical";
// 			} else if (currentStock <= product.reorderLevel) {
// 				status = "Low Stock";
// 			} else if (currentStock > product.maxStockLevel) {
// 				status = "Overstock";
// 			} else {
// 				status = "In Stock";
// 			}

// 			return {
// 				sku: product.sku || "N/A",
// 				productName: product.name,
// 				category: product.category?.name || "Uncategorized",
// 				productType: product.productType?.name || "N/A",
// 				currentStock: `${currentStock} ${formatUnitOfMeasure(product.unitOfMeasure, currentStock)}`,
// 				currentStockRaw: currentStock,
// 				unitOfMeasure: product.unitOfMeasure,
// 				lastUpdated: lastUpdated,
// 				status: status,
// 				reorderLevel: product.reorderLevel,
// 				maxStockLevel: product.maxStockLevel,
// 				productId: product.id,
// 				batchCount: batches.size,
// 				requiresPrescription: product.requiresPrescription,
// 				srp: product.srp,
// 			};
// 		},
// 	);

// 	// Sort by product name
// 	return stockLevels.sort((a, b) => a.productName.localeCompare(b.productName));
// }

// function formatUnitOfMeasure(unit: string, quantity: number): string {
// 	const unitMap: Record<string, string> = {
// 		piece: "Pieces",
// 		box: "Box",
// 		bottle: "Bottles",
// 		vial: "Vials",
// 		pack: "Packs",
// 		tube: "Tubes",
// 		strip: "Strips",
// 		carton: "Cartons",
// 		bag: "Bags",
// 		unit: "Units",
// 	};

// 	// Pluralize based on quantity (except for "Box" which stays singular)
// 	const formattedUnit = unitMap[unit.toLowerCase()] || unit;

// 	// Handle special cases where singular and plural are the same or need special handling
// 	if (quantity === 1 && formattedUnit === "Pieces") return "Piece";
// 	if (quantity === 1 && formattedUnit === "Bottles") return "Bottle";
// 	if (quantity === 1 && formattedUnit === "Vials") return "Vial";
// 	if (quantity === 1 && formattedUnit === "Packs") return "Pack";
// 	if (quantity === 1 && formattedUnit === "Tubes") return "Tube";
// 	if (quantity === 1 && formattedUnit === "Strips") return "Strip";
// 	if (quantity === 1 && formattedUnit === "Cartons") return "Carton";
// 	if (quantity === 1 && formattedUnit === "Bags") return "Bag";
// 	if (quantity === 1 && formattedUnit === "Units") return "Unit";

// 	return formattedUnit;
// }

// // Get stock levels with additional details (batch breakdown)
// export async function getStockLevelsDetailed(
// 	prisma: PrismaClient,
// 	departmentId: string,
// 	productId?: string,
// ) {
// 	const whereClause: any = {
// 		inventoryRecord: {
// 			departmentId: departmentId,
// 			isDeleted: false,
// 		},
// 		isDeleted: false,
// 	};

// 	if (productId) {
// 		whereClause.productId = productId;
// 	}

// 	const stockItems = await prisma.stockItem.findMany({
// 		where: whereClause,
// 		include: {
// 			product: {
// 				include: {
// 					category: true,
// 					productType: true,
// 				},
// 			},
// 			batch: true,
// 			inventoryRecord: true,
// 		},
// 		orderBy: {
// 			createdAt: "desc",
// 		},
// 	});

// 	// Group by product and lot
// 	const productBatchMap = new Map<string, Map<string, BatchData>>();

// 	stockItems.forEach((item) => {
// 		if (!item.product) return;

// 		const productId = item.productId;
// 		const batchId = item.batchId || "no-batch";
// 		const quantity = item.quantity || 0;

// 		if (!productBatchMap.has(productId)) {
// 			productBatchMap.set(productId, new Map());
// 		}

// 		const batchMap = productBatchMap.get(productId)!;
// 		const existing = batchMap.get(batchId);
// 		if (existing) {
// 			existing.quantity += quantity;
// 			existing.movements.push({
// 				quantity: quantity,
// 				date: item.createdAt,
// 				batchNumber: item.batch?.batchNumber,
// 			});
// 		} else {
// 			batchMap.set(batchId, {
// 				product: item.product,
// 				batch: item.batch,
// 				quantity: quantity,
// 				movements: [
// 					{
// 						quantity: quantity,
// 						date: item.createdAt,
// 						batchNumber: item.batch?.batchNumber,
// 					},
// 				],
// 			});
// 		}
// 	});

// 	// Transform to detailed response
// 	const detailedStockLevels = Array.from(productBatchMap.entries()).map(
// 		([productId, batchMap]) => {
// 			const batches = Array.from(batchMap.values());
// 			const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
// 			const product = batches[0].product;

// 			let status: string;
// 			if (totalQuantity <= 0) {
// 				status = "Critical";
// 			} else if (totalQuantity <= product.reorderLevel) {
// 				status = "Low Stock";
// 			} else if (totalQuantity > product.maxStockLevel) {
// 				status = "Overstock";
// 			} else {
// 				status = "In Stock";
// 			}

// 			return {
// 				productId,
// 				sku: product.sku || "N/A",
// 				productName: product.name,
// 				category: product.category?.name || "Uncategorized",
// 				totalQuantity,
// 				unitOfMeasure: product.unitOfMeasure,
// 				status,
// 				reorderLevel: product.reorderLevel,
// 				maxStockLevel: product.maxStockLevel,
// 				batches: batches.map((batch) => ({
// 					batchId: batch.batch?.id || null,
// 					batchNumber: batch.batch?.batchNumber || "N/A",
// 					date: batch.batch?.date || null,
// 					quantity: batch.quantity,
// 					movements: batch.movements,
// 				})),
// 			};
// 		},
// 	);

// 	return detailedStockLevels;
// }
