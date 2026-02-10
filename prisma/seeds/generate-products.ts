import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

// Categories configuration
const categories = [
	{
		name: "Medicines",
		description: "Pharmaceutical drugs and medications for various treatments",
	},
	{
		name: "Medical Supplies",
		description: "General medical supplies and consumables",
	},
	{
		name: "Equipment",
		description: "Medical equipment and surgical supplies",
	},
];

// Product Types configuration with their category
const productTypes = [
	{
		name: "Tablet",
		description: "Solid pharmaceutical dosage form",
		categoryName: "Medicines",
	},
	{
		name: "Syrup",
		description: "Liquid pharmaceutical dosage form",
		categoryName: "Medicines",
	},
	{
		name: "Consumable",
		description: "Single-use medical consumable items",
		categoryName: "Medical Supplies",
	},
	{
		name: "IV Fluid",
		description: "Intravenous fluid solutions",
		categoryName: "Medical Supplies",
	},
	{
		name: "Surgical Supply",
		description: "Supplies used in surgical procedures",
		categoryName: "Equipment",
	},
];

// Complete product data
const productsData = [
	{
		sku: "MED-001",
		name: "Paracetamol 500mg",
		description:
			"Used to relieve pain and reduce fever. Commonly used for headaches and body aches.",
		gtin: "8901234567890",
		categoryName: "Medicines",
		productTypeName: "Tablet",
		unitOfMeasure: "box",
		requiresPrescription: false,
		status: "active",
		reorderLevel: 10,
		maxStockLevel: 1000,
		storageRequirement: "Store in a cool, dry place below 30°C",
	},
	{
		sku: "MED-002",
		name: "Amoxicillin 250mg",
		description:
			"Antibiotic used to treat bacterial infections such as pneumonia, ear, and throat infections.",
		gtin: "8901234567891",
		categoryName: "Medicines",
		productTypeName: "Syrup",
		unitOfMeasure: "bottle",
		requiresPrescription: true,
		status: "active",
		reorderLevel: 15, 
		maxStockLevel: 500,
		storageRequirement: "Store below 25°C; shake well before use",
	},
	{
		sku: "MED-003",
		name: "Alcohol Swab 70% Isopropyl",
		description: "Used for disinfecting the skin prior to injection or minor procedures.",
		gtin: "8901234567892",
		categoryName: "Medical Supplies",
		productTypeName: "Consumable",
		unitOfMeasure: "box",
		requiresPrescription: false,
		status: "active",
		reorderLevel: 15, 
		maxStockLevel: 2000,
		storageRequirement: "Store at room temperature; keep tightly sealed",
	},
	{
		sku: "MED-004",
		name: "IV Fluid",
		description: "Sterile solution used for fluid and electrolyte replenishment.",
		gtin: "8901234567893",
		categoryName: "Medical Supplies",
		productTypeName: "IV Fluid",
		unitOfMeasure: "bottle",
		requiresPrescription: true,
		status: "active",
		reorderLevel: 15,
		maxStockLevel: 500,
		storageRequirement: "Store below 30°C; protect from freezing",
	},
	{
		sku: "MED-005",
		name: "Surgical Gloves",
		description:
			"Disposable gloves used to maintain hygiene and prevent contamination during surgical procedures.",
		gtin: "8901234567894",
		categoryName: "Equipment",
		productTypeName: "Surgical Supply",
		unitOfMeasure: "box",
		requiresPrescription: false,
		status: "active",
		reorderLevel: 15,
		maxStockLevel: 1500,
		storageRequirement: "Store in a cool, dry place away from direct sunlight",
	},
];

export async function GenerateProducts() {
	console.log("🌱 Starting product seed...\n");

	try {
		// 1. Create Categories
		console.log("📁 Creating Categories...");
		const categoryMap = new Map();

		for (const cat of categories) {
			// First, try to find existing category
			const existingCategory = await prisma.category.findFirst({
				where: { name: cat.name, isDeleted: false },
			});

			let category;
			if (existingCategory) {
				// Update existing category
				category = await prisma.category.update({
					where: { id: existingCategory.id },
					data: {
						description: cat.description,
						isDeleted: false,
					},
				});
				console.log(`🔄 Category updated: ${category.name}`);
			} else {
				// Create new category
				category = await prisma.category.create({
					data: {
						name: cat.name,
						description: cat.description,
						isDeleted: false,
					},
				});
				console.log(`✅ Category created: ${category.name}`);
			}

			categoryMap.set(cat.name, category);
			console.log(`   ID: ${category.id}`);
			console.log(`   Description: ${category.description}\n`);
		}
		console.log("");

		// 2. Create Product Types
		console.log("🏷️  Creating Product Types...");
		const productTypeMap = new Map();

		for (const type of productTypes) {
			const category = categoryMap.get(type.categoryName);

			if (!category) {
				console.error(`❌ Category not found for: ${type.categoryName}`);
				continue;
			}

			// First, try to find existing product type
			const existingProductType = await prisma.productType.findFirst({
				where: { name: type.name, isDeleted: false },
			});

			let productType;
			if (existingProductType) {
				// Update existing product type
				productType = await prisma.productType.update({
					where: { id: existingProductType.id },
					data: {
						description: type.description,
						categoryId: category.id,
						isDeleted: false,
					},
				});
				console.log(`🔄 Product Type updated: ${productType.name}`);
			} else {
				// Create new product type
				productType = await prisma.productType.create({
					data: {
						name: type.name,
						description: type.description,
						categoryId: category.id,
						isDeleted: false,
					},
				});
				console.log(`✅ Product Type created: ${productType.name}`);
			}

			productTypeMap.set(type.name, productType);
			console.log(`   ID: ${productType.id}`);
			console.log(`   Category: ${type.categoryName}`);
			console.log(`   Description: ${productType.description}\n`);
		}
		console.log("");

		// 3. Create Products
		console.log("📦 Creating Products...");
		let totalProductsCreated = 0;

		for (const productData of productsData) {
			const category = categoryMap.get(productData.categoryName);
			const productType = productTypeMap.get(productData.productTypeName);

			if (!category) {
				console.error(`❌ Category not found for: ${productData.categoryName}`);
				continue;
			}

			if (!productType) {
				console.error(`❌ Product Type not found for: ${productData.productTypeName}`);
				continue;
			}

			console.log(`📦 Creating product: ${productData.name}...`);
			const product = await prisma.product.upsert({
				where: { sku: productData.sku },
				update: {
					name: productData.name,
					description: productData.description,
					gtin: productData.gtin,
					unitOfMeasure: productData.unitOfMeasure as any,
					requiresPrescription: productData.requiresPrescription,
					status: productData.status as any,
					reorderLevel: productData.reorderLevel,
					maxStockLevel: productData.maxStockLevel,
					storageRequirement: productData.storageRequirement,
					categoryId: category.id,
					productTypeId: productType.id,
					isDeleted: false,
				},
				create: {
					srp: 0,
					sku: productData.sku,
					name: productData.name,
					description: productData.description,
					gtin: productData.gtin,
					unitOfMeasure: productData.unitOfMeasure as any,
					requiresPrescription: productData.requiresPrescription,
					status: productData.status as any,
					reorderLevel: productData.reorderLevel,
					maxStockLevel: productData.maxStockLevel,
					storageRequirement: productData.storageRequirement,
					categoryId: category.id,
					productTypeId: productType.id,
					isDeleted: false,
				},
				include: {
					category: true,
					productType: true,
				},
			});

			console.log(`✅ Product created successfully`);
			console.log(`   ID: ${product.id}`);
			console.log(`   SKU: ${product.sku}`);
			console.log(`   Name: ${product.name}`);
			console.log(`   Category: ${category.name}`);
			console.log(`   Product Type: ${productType.name}`);
			console.log(`   Unit: ${product.unitOfMeasure}`);
			console.log(`   Requires Prescription: ${product.requiresPrescription ? "Yes" : "No"}`);
			console.log(`   Status: ${product.status}`);
			console.log(`   Reorder Level: ${product.reorderLevel}`);
			console.log(`   Max Stock: ${product.maxStockLevel}\n`);

			totalProductsCreated++;
		}

		// Summary
		console.log("═════════════════════════════════════════");
		console.log("📊 PRODUCT SEED SUMMARY");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log(`📁 CATEGORIES CREATED: ${categories.length}`);
		categories.forEach((cat) => {
			const productCount = productsData.filter((p) => p.categoryName === cat.name).length;
			const typeCount = productTypes.filter((t) => t.categoryName === cat.name).length;
			console.log(`   • ${cat.name} - ${typeCount} type(s), ${productCount} product(s)`);
		});
		console.log("");
		console.log(`🏷️  PRODUCT TYPES CREATED: ${productTypes.length}`);
		productTypes.forEach((type) => {
			const productCount = productsData.filter((p) => p.productTypeName === type.name).length;
			console.log(`   • ${type.name} (${type.categoryName}) - ${productCount} product(s)`);
		});
		console.log("");
		console.log(`📦 TOTAL PRODUCTS CREATED: ${totalProductsCreated}`);
		console.log("");
		console.log("📋 PRODUCT LIST");
		productsData.forEach((p) => {
			const prescriptionIcon = p.requiresPrescription ? "⚕️" : "✓";
			console.log(`   ${prescriptionIcon} ${p.sku} - ${p.name} (${p.productTypeName})`);
		});
		console.log("");
		console.log("🔗 RELATIONSHIPS");
		console.log(`   All products linked to Categories and Product Types: ✅`);
		console.log("");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log("✨ Product seed completed successfully!\n");
	} catch (error) {
		console.error("❌ Error during product seeding:");
		if (error instanceof Error) {
			console.error(`   Message: ${error.message}`);
			console.error(`   Stack: ${error.stack}`);
		} else {
			console.error(error);
		}
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}
