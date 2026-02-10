import { PrismaClient } from "../generated/prisma";
import { GenerateUser } from "./seeds/generate-user";
import { GenerateProducts } from "./seeds/generate-products";
import { GenerateSuppliers } from "./seeds/generate-suppliers";
import { seedOrganization } from "./seeds/organizationSeeder";
const prisma = new PrismaClient();

async function main() {
	// await GenerateSuperadmin();
	// await GenerateProducts();
	await GenerateProducts();
	await seedOrganization();
	await GenerateUser(); //this seed generate user, department, and stock records
	await GenerateSuppliers();

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
