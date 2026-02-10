import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

// Two main organizations
const organizations = [
	{
		id: "507f1f77bcf86cd799439011",
		name: "Ospital ng Paranaque I",
		description: "First OSPAR organization for inventory management",
		code: "OSPAR-1",
		isDeleted: false,
	},
	{
		id: "507f1f77bcf86cd799439012",
		name: "Ospital ng Paranque II",
		description: "Second OSPAR organization for inventory management",
		code: "OSPAR-2",
		isDeleted: false,
	},
];

export async function seedOrganization() {
	console.log("🌱 Starting organization seeding...");

	try {
		// Clear existing organizations (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing organizations and dependent data...");
		// Delete suppliers first to avoid foreign key constraint violations
		await prisma.supplier.deleteMany({});
		await prisma.organization.deleteMany({});

		// Create organizations
		console.log("📝 Creating organization records...");
		for (const organization of organizations) {
			await prisma.organization.create({
				data: organization,
			});
		}

		console.log(`✅ Successfully created ${organizations.length} organization records`);

		console.log("\n🎉 Organization seeding completed successfully!");

		return organizations;
	} catch (error) {
		console.error("❌ Error during organization seeding:", error);
		throw error;
	}
}
