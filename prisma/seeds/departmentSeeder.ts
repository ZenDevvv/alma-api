import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedDepartment() {
	console.log("🌱 Starting department seeding...");

	const departmentData = [
		{
			name: "PPP Management",
			code: "PPP-MGMT",
			type: "PPP",
			address: "PPP Management Office",
			city: "Quezon City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1100",
			contactName: "PPP Manager",
			contactPhone: "+63-2-8123-4567",
			contactEmail: "ppp.mgmt@company.com",
			isActive: true,
			isDeleted: false,
		},
		{
			name: "PPP Office",
			code: "PPP-OFFICE",
			type: "PPP",
			address: "PPP Office Tower",
			city: "Makati City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1200",
			contactName: "PPP Office Coordinator",
			contactPhone: "+63-2-8812-3456",
			contactEmail: "ppp.office@company.com",
			isActive: true,
			isDeleted: false,
		},
		{
			name: "Pharmacy",
			code: "PHARMACY",
			type: "DEPT",
			address: "Hospital Wing B",
			city: "Quezon City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1100",
			contactName: "Chief Pharmacist",
			contactPhone: "+63-2-8374-5678",
			contactEmail: "pharmacy@company.com",
			isActive: true,
			isDeleted: false,
		},
		{
			name: "Radiology",
			code: "RADIOLOGY",
			type: "DEPT",
			address: "Imaging Center",
			city: "Quezon City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1100",
			contactName: "Radiology Supervisor",
			contactPhone: "+63-2-8291-2345",
			contactEmail: "radiology@company.com",
			isActive: true,
			isDeleted: false,
		},
		{
			name: "Laboratory",
			code: "LAB",
			type: "DEPT",
			address: "Lab Complex",
			city: "Quezon City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1100",
			contactName: "Lab Director",
			contactPhone: "+63-2-8123-4567",
			contactEmail: "lab@company.com",
			isActive: true,
			isDeleted: false,
		},
		{
			name: "Hemodialysis",
			code: "HEMO",
			type: "DEPT",
			address: "Dialysis Unit",
			city: "Quezon City",
			state: "Metro Manila",
			country: "Philippines",
			postalCode: "1100",
			contactName: "Hemodialysis Coordinator",
			contactPhone: "+63-2-8812-3456",
			contactEmail: "hemodialysis@company.com",
			isActive: true,
			isDeleted: false,
		},
	];

	try {
		// Clear existing departments (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing departments...");
		await prisma.department.deleteMany({});

		// Create departments
		console.log("📝 Creating department records...");
		for (const dept of departmentData) {
			const createdDept = await prisma.department.create({
				data: dept,
			});
			console.log(`✅ Created department: ${createdDept.name} (${createdDept.code})`);
		}

		console.log(`\n✅ Successfully created ${departmentData.length} department records`);

		console.log("\n🎉 Department seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during department seeding:", error);
		throw error;
	}
}
