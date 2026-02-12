import { PrismaClient } from "../../generated/prisma";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function seedSuperAdmin() {
	const email = "superadmin@alma.com";

	const existing = await prisma.user.findUnique({ where: { email } });
	if (existing) {
		console.log(`Super admin already exists (${email}), skipping.`);
		return;
	}

	const hashedPassword = await argon2.hash("Test123!");

	const person = await prisma.person.create({
		data: {
			personalInfo: {
				firstName: "Super",
				lastName: "Admin",
			},
			contactInfo: [],
			addresses: [],
			languages: [],
			emergencyContacts: [],
			kycStatus: "APPROVED",
		},
	});

	const user = await prisma.user.create({
		data: {
			email,
			userName: "superadmin",
			password: hashedPassword,
			role: "admin",
			subRole: ["superadmin"],
			status: "active",
			loginMethod: "email",
			personId: person.id,
		},
	});

	console.log(`Super admin created: ${user.email} (id: ${user.id})`);
}

export default seedSuperAdmin;
