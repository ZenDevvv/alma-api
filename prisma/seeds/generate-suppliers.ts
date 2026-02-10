import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

// Only 2 organization IDs

// Base supplier configurations
const baseSuppliersData = [
	{
		code: "SUP-001",
		name: "MedPharm Distribution Inc.",
		contactPerson: "Roberto Santos",
		email: "procurement@medpharm.com.ph",
		phone: "+63-2-8555-1234",
		tin: "123-456-789-000",
		address: {
			addressLine1: "Unit 501-505 Medical Plaza",
			addressLine2: "Commerce Avenue",
			city: "Makati City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1200",
		},
		gln: "8901234567890",
		paymentTerms: "Net 30 days",
		isActive: true,
		rating: 4.5,
	},
	{
		code: "SUP-002",
		name: "Global Medical Supplies Corp.",
		contactPerson: "Maria Concepcion",
		email: "sales@globalmedsupply.com.ph",
		phone: "+63-2-8777-5678",
		tin: "987-654-321-000",
		address: {
			addressLine1: "Building B, Healthcare Complex",
			addressLine2: "Ortigas Center",
			city: "Pasig City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1605",
		},
		gln: "8901234567891",
		paymentTerms: "Net 45 days",
		isActive: true,
		rating: 4.8,
	},
];

export async function GenerateSuppliers() {
	console.log("🌱 Starting supplier seed...\n");

	try {
		let totalSuppliersCreated = 0;

		console.log(`\n🏢 Creating suppliers with no organization`);

		for (const baseSupplierData of baseSuppliersData) {
			// Use base code
			const supplierCode = baseSupplierData.code;

			console.log(`  🏢 Creating supplier: ${baseSupplierData.name} (${supplierCode})...`);

			// Check if supplier already exists
			const existingSupplier = await prisma.supplier.findFirst({
				where: { code: supplierCode, isDeleted: false },
			});

			let supplier;
			if (existingSupplier) {
				// Update existing supplier
				supplier = await prisma.supplier.update({
					where: { id: existingSupplier.id },
					data: {
						name: baseSupplierData.name,
						contactPerson: baseSupplierData.contactPerson,
						email: baseSupplierData.email,
						phone: baseSupplierData.phone,
						tin: baseSupplierData.tin,
						address: baseSupplierData.address,
						gln: baseSupplierData.gln,
						paymentTerms: baseSupplierData.paymentTerms,
						isActive: baseSupplierData.isActive,
						rating: baseSupplierData.rating,
						orgId: null,
						isDeleted: false,
					},
				});
				console.log(`  🔄 Supplier updated: ${supplier.name}`);
			} else {
				// Create new supplier
				supplier = await prisma.supplier.create({
					data: {
						code: supplierCode,
						name: baseSupplierData.name,
						contactPerson: baseSupplierData.contactPerson,
						email: baseSupplierData.email,
						phone: baseSupplierData.phone,
						tin: baseSupplierData.tin,
						address: baseSupplierData.address,
						gln: baseSupplierData.gln,
						paymentTerms: baseSupplierData.paymentTerms,
						isActive: baseSupplierData.isActive,
						rating: baseSupplierData.rating,
						orgId: null,
						isDeleted: false,
					},
				});
				console.log(`  ✅ Supplier created: ${supplier.name}`);
			}

			console.log(`     ID: ${supplier.id}`);
			console.log(`     Code: ${supplier.code}`);
			console.log(`     Organization: None`);
			console.log(`     Contact: ${supplier.contactPerson}`);
			console.log(`     Email: ${supplier.email}`);
			console.log(`     Phone: ${supplier.phone}`);
			console.log(`     Payment Terms: ${supplier.paymentTerms}`);
			console.log(`     Rating: ${supplier.rating}/5.0\n`);

			totalSuppliersCreated++;
		}

		// Summary
		console.log("═════════════════════════════════════════");
		console.log("📊 SUPPLIER SEED SUMMARY");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log(`🏢 TOTAL SUPPLIERS CREATED: ${totalSuppliersCreated}`);
		console.log("");
		console.log("🏢 SUPPLIER LIST");

		for (const baseSupplier of baseSuppliersData) {
			console.log(`    • ${baseSupplier.code} - ${baseSupplier.name}`);
			console.log(`      Contact: ${baseSupplier.contactPerson} (${baseSupplier.email})`);
			console.log(`      Rating: ${baseSupplier.rating}/5.0`);
			console.log(`      Payment Terms: ${baseSupplier.paymentTerms}`);
		}

		console.log("");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log("✨ Supplier seed completed successfully!\n");
	} catch (error) {
		console.error("❌ Error during supplier seeding:");
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
