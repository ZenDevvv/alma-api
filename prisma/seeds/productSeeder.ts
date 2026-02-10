import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

const categoriesData = [
	{
		name: "Pharmaceuticals",
		description: "Medications and drugs for patient treatment",
	},
	{
		name: "Medical Devices",
		description: "Reusable and disposable medical equipment",
	},
	{
		name: "Imaging Supplies",
		description: "Materials used in diagnostic imaging",
	},
	{
		name: "Laboratory Supplies",
		description: "Reagents and tools for lab testing",
	},
	{
		name: "Dialysis Supplies",
		description: "Equipment and consumables for hemodialysis",
	},
];

const productTypesData = [
	// Under Pharmaceuticals
	{ name: "Analgesics", categoryName: "Pharmaceuticals", description: "Pain relief medications" },
	{
		name: "Antibiotics",
		categoryName: "Pharmaceuticals",
		description: "Infection-fighting drugs",
	},
	{
		name: "Anticoagulants",
		categoryName: "Pharmaceuticals",
		description: "Blood thinning agents",
	},
	{ name: "IV Fluids", categoryName: "Pharmaceuticals", description: "Intravenous solutions" },

	// Under Medical Devices
	{ name: "Syringes", categoryName: "Medical Devices", description: "Injection devices" },
	{ name: "Wound Care", categoryName: "Medical Devices", description: "Bandages and dressings" },
	{ name: "PPE", categoryName: "Medical Devices", description: "Personal protective equipment" },

	// Under Imaging Supplies
	{
		name: "Contrast Agents",
		categoryName: "Imaging Supplies",
		description: "Agents for enhanced imaging",
	},
	{ name: "Films", categoryName: "Imaging Supplies", description: "Radiographic films" },

	// Under Laboratory Supplies
	{
		name: "Blood Collection",
		categoryName: "Laboratory Supplies",
		description: "Tubes for sample collection",
	},
	{
		name: "Reagents",
		categoryName: "Laboratory Supplies",
		description: "Chemical test strips and kits",
	},

	// Under Dialysis Supplies
	{ name: "Filters", categoryName: "Dialysis Supplies", description: "Dialysis machine filters" },
];

const productsData = [
	// Pharmacy/Pharmaceuticals
	{
		name: "Paracetamol 500mg Tablet",
		description: "Acetaminophen for pain and fever relief",
		gtin: "01234567890123",
		sku: "PARA-500-TAB",
		unitOfMeasure: "piece",
		requiresPrescription: false,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 50,
		maxStockLevel: 500,
		categoryName: "Pharmaceuticals",
		productTypeName: "Analgesics",
		status: "active",
	},
	{
		name: "Amoxicillin 500mg Capsule",
		description: "Antibiotic for bacterial infections",
		gtin: "01234567890124",
		sku: "AMOX-500-CAP",
		unitOfMeasure: "piece",
		requiresPrescription: true,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 30,
		maxStockLevel: 300,
		categoryName: "Pharmaceuticals",
		productTypeName: "Antibiotics",
		status: "active",
	},
	{
		name: "Heparin Sodium 5000 IU/ml",
		description: "Anticoagulant injection for hemodialysis",
		gtin: "01234567890125",
		sku: "HEPA-5000-INJ",
		unitOfMeasure: "vial",
		requiresPrescription: true,
		storageRequirement: "Refrigerate (2-8°C)",
		reorderLevel: 20,
		maxStockLevel: 200,
		categoryName: "Pharmaceuticals",
		productTypeName: "Anticoagulants",
		status: "active",
	},
	{
		name: "Normal Saline 0.9% 500ml",
		description: "Sterile sodium chloride solution for IV use",
		gtin: "01234567890126",
		sku: "NSAL-500-IV",
		unitOfMeasure: "bottle",
		requiresPrescription: true,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 40,
		maxStockLevel: 400,
		categoryName: "Pharmaceuticals",
		productTypeName: "IV Fluids",
		status: "active",
	},

	// Medical Devices (General/Pharmacy/Hemodialysis)
	{
		name: "Insulin Syringe 1ml 30G",
		description: "Disposable syringe for insulin injections",
		gtin: "01234567890127",
		sku: "INSU-1ML-SYR",
		unitOfMeasure: "piece",
		requiresPrescription: false,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 100,
		maxStockLevel: 1000,
		categoryName: "Medical Devices",
		productTypeName: "Syringes",
		status: "active",
	},
	{
		name: "Adhesive Bandage 7.5cm x 1.8m",
		description: "Sterile bandage roll for wound dressing",
		gtin: "01234567890128",
		sku: "BAND-ROLL",
		unitOfMeasure: "roll",
		requiresPrescription: false,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 60,
		maxStockLevel: 600,
		categoryName: "Medical Devices",
		productTypeName: "Wound Care",
		status: "active",
	},
	{
		name: "Nitrile Exam Gloves Medium",
		description: "Powder-free disposable gloves",
		gtin: "01234567890129",
		sku: "GLOV-MED",
		unitOfMeasure: "box",
		requiresPrescription: false,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 25,
		maxStockLevel: 250,
		categoryName: "Medical Devices",
		productTypeName: "PPE",
		status: "active",
	},

	// Radiology
	{
		name: "Iodixanol 320mg/ml Injection",
		description: "Non-ionic contrast agent for CT scans",
		gtin: "01234567890130",
		sku: "IODI-320-INJ",
		unitOfMeasure: "vial",
		requiresPrescription: true,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 15,
		maxStockLevel: 150,
		categoryName: "Imaging Supplies",
		productTypeName: "Contrast Agents",
		status: "active",
	},
	{
		name: "X-Ray Film 35x43cm",
		description: "Medical radiographic film for X-rays",
		gtin: "01234567890131",
		sku: "XRAY-FILM",
		unitOfMeasure: "pack",
		requiresPrescription: false,
		storageRequirement: "Cool and Dry (10-25°C)",
		reorderLevel: 10,
		maxStockLevel: 100,
		categoryName: "Imaging Supplies",
		productTypeName: "Films",
		status: "active",
	},

	// Laboratory
	{
		name: "EDTA Blood Collection Tube 5ml",
		description: "Vacutainer tube for hematology tests",
		gtin: "01234567890132",
		sku: "EDTA-TUBE",
		unitOfMeasure: "tube",
		requiresPrescription: false,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 200,
		maxStockLevel: 2000,
		categoryName: "Laboratory Supplies",
		productTypeName: "Blood Collection",
		status: "active",
	},
	{
		name: "Glucose Test Strips 50pk",
		description: "Strips for blood glucose monitoring",
		gtin: "01234567890133",
		sku: "GLUC-STRIP",
		unitOfMeasure: "pack",
		requiresPrescription: false,
		storageRequirement: "Room Temperature (2-30°C)",
		reorderLevel: 30,
		maxStockLevel: 300,
		categoryName: "Laboratory Supplies",
		productTypeName: "Reagents",
		status: "active",
	},

	// Hemodialysis
	{
		name: "High-Flux Dialyzer F60",
		description: "Disposable dialyzer filter for hemodialysis",
		gtin: "01234567890134",
		sku: "DIAL-F60",
		unitOfMeasure: "piece",
		requiresPrescription: true,
		storageRequirement: "Room Temperature (15-30°C)",
		reorderLevel: 20,
		maxStockLevel: 200,
		categoryName: "Dialysis Supplies",
		productTypeName: "Filters",
		status: "active",
	},
];

export async function GenerateProducts() {
	console.log("🌱 Starting product seed...\n");

	try {
		// 1. Create Categories
		console.log("📂 Creating Categories...");
		const categories = [];
		for (const catData of categoriesData) {
			const existingCategory = await prisma.category.findFirst({
				where: { name: catData.name },
			});
			let category;
			if (existingCategory) {
				category = await prisma.category.update({
					where: { id: existingCategory.id },
					data: {
						description: catData.description,
						isDeleted: false,
					},
				});
				console.log(`✅ Category updated: ${category.name}`);
			} else {
				category = await prisma.category.create({
					data: {
						name: catData.name,
						description: catData.description,
						isDeleted: false,
					},
				});
				console.log(`✅ Category created: ${category.name}`);
			}
			categories.push(category);
		}
		console.log(`\n`);

		// 2. Create Product Types
		console.log("🏷️ Creating Product Types...");
		const productTypes = [];
		for (const ptData of productTypesData) {
			const category = categories.find((c) => c.name === ptData.categoryName);
			if (!category) {
				console.warn(
					`⚠️ Category ${ptData.categoryName} not found for ProductType ${ptData.name}`,
				);
				continue;
			}
			const productType = await prisma.productType.upsert({
				where: { name: ptData.name },
				update: {
					description: ptData.description,
					categoryId: category.id,
					isDeleted: false,
				},
				create: {
					name: ptData.name,
					description: ptData.description,
					categoryId: category.id,
					isDeleted: false,
				},
			});
			productTypes.push(productType);
			console.log(
				`✅ ProductType created/updated: ${productType.name} under ${ptData.categoryName}`,
			);
		}
		console.log(`\n`);

		// 3. Create Products
		console.log("💊 Creating Products...");
		let totalProductsCreated = 0;
		for (const prodData of productsData) {
			const category = categories.find((c) => c.name === prodData.categoryName);
			const productType = productTypes.find((pt) => pt.name === prodData.productTypeName);
			if (!category || !productType) {
				console.warn(`⚠️ Category/Type not found for Product ${prodData.name}`);
				continue;
			}

			const existingProduct = await prisma.product.findUnique({
				where: { sku: prodData.sku },
			});
			let product;
			if (existingProduct) {
				product = await prisma.product.update({
					where: { id: existingProduct.id },
					data: {
						name: prodData.name,
						description: prodData.description,
						gtin: prodData.gtin,
						unitOfMeasure: prodData.unitOfMeasure,
						status: prodData.status,
						categoryId: category.id,
						productTypeId: productType.id,
						requiresPrescription: prodData.requiresPrescription,
						storageRequirement: prodData.storageRequirement,
						reorderLevel: prodData.reorderLevel,
						maxStockLevel: prodData.maxStockLevel,
						isDeleted: false,
					},
				});
				console.log(
					`✅ Product updated: ${product.name} (${product.sku}) - ${product.status}`,
				);
			} else {
				product = await prisma.product.create({
					data: {
						name: prodData.name,
						description: prodData.description,
						gtin: prodData.gtin,
						sku: prodData.sku,
						unitOfMeasure: prodData.unitOfMeasure,
						status: prodData.status,
						categoryId: category.id,
						productTypeId: productType.id,
						requiresPrescription: prodData.requiresPrescription,
						storageRequirement: prodData.storageRequirement,
						reorderLevel: prodData.reorderLevel,
						maxStockLevel: prodData.maxStockLevel,
						isDeleted: false,
					},
				});
				console.log(
					`✅ Product created: ${product.name} (${product.sku}) - ${product.status}`,
				);
			}
			totalProductsCreated++;
		}
		console.log(`\n`);

		// Summary
		console.log("═════════════════════════════════════════");
		console.log("📊 PRODUCT SEED SUMMARY");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log(`🏷️ CATEGORIES CREATED/UPDATED: ${categories.length}`);
		categories.forEach((cat) => {
			console.log(`   • ${cat.name}`);
		});
		console.log("");
		console.log(`🔖 PRODUCT TYPES CREATED/UPDATED: ${productTypes.length}`);
		console.log(`💊 TOTAL PRODUCTS PROCESSED: ${totalProductsCreated}`);
		console.log("");
		console.log("✨ Seed completed successfully!\n");
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
