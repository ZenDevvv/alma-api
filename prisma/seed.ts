import seedSuperAdmin from "./seeds/superadmin.seed";
import seedOrganizations from "./seeds/organization.seed";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();

async function main() {
	await seedSuperAdmin();
	await seedOrganizations();

	console.log("Seeding completed successfully!");
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error("Error during seeding:", e);
		await prisma.$disconnect();
		process.exit(1);
	});
