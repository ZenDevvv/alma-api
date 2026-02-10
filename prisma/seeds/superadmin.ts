import { PrismaClient } from "../../generated/prisma";

import * as argon2 from "argon2";

const prisma = new PrismaClient();

export async function GenerateSuperadmin() {
	console.log("🌱 Starting seed...\n");

	try {
		// 1. Hash password using Argon2
		console.log("🔐 Hashing password with Argon2...");
		const hashedPassword = await argon2.hash("Test123!", {
			type: argon2.argon2id,
			memoryCost: 65536, // 64 MB
			timeCost: 3,
			parallelism: 4,
		});
		console.log("✅ Password hashed securely\n");

		// 2. Create Person Record with Contacts and Addresses
		console.log("👤 Creating Person record...");
		const superadminPerson = await prisma.person.create({
			data: {
				personalInfo: {
					firstName: "System",
					lastName: "Administrator",
					middleName: "Super",
					dateOfBirth: new Date("1990-01-01"),
					gender: "PREFER_NOT_TO_SAY",
					nationality: "Filipino",
				},
				contactInfo: [
					{
						type: "MOBILE",
						phoneNumber: "+639171234567",
						email: "superadmin@company.com",
						countryCode: "+63",
						isPrimary: true,
						isVerified: true,
						label: "Primary Contact",
					},
					{
						type: "WORK",
						phoneNumber: "+632-8123-4567",
						email: "admin@company.com",
						countryCode: "+63",
						isPrimary: false,
						isVerified: true,
						label: "Office Line",
					},
				],
				addresses: [
					{
						type: "PRIMARY",
						addressLine1: "Main Office Building",
						addressLine2: "IT Department Floor",
						street: "Commonwealth Avenue",
						city: "Quezon City",
						state: "Metro Manila",
						country: "Philippines",
						postalCode: "1100",
						isPrimary: true,
						isVerified: true,
						label: "Office Address",
					},
				],
				languages: [
					{
						languageCode: "en",
						languageName: "English",
						proficiency: "FLUENT",
						isNative: false,
					},
					{
						languageCode: "tl",
						languageName: "Tagalog",
						proficiency: "NATIVE",
						isNative: true,
					},
				],
				preferredLanguage: "en",
				emergencyContacts: [
					{
						firstName: "Emergency",
						lastName: "Contact",
						relationship: "IT Manager",
						phoneNumber: "+639181234567",
						priority: 1,
						notes: "Primary emergency contact for system administrator",
					},
				],
				kycStatus: "APPROVED",
				kycCompletedAt: new Date(),
				lastVerifiedAt: new Date(),
			},
		});
		console.log(
			`✅ Person created: ${superadminPerson.personalInfo.firstName} ${superadminPerson.personalInfo.lastName}`,
		);
		console.log(`   ID: ${superadminPerson.id}\n`);

		// 3. Create Superadmin User with Relations
		console.log("👨‍💼 Creating Superadmin user with relations...");
		const superadminUser = await prisma.user.create({
			data: {
				userName: "superadmin",
				email: "superadmin@company.com",
				password: hashedPassword,
				role: "admin",
				subRole: "super",
				status: "active",
				isDeleted: false,
				loginMethod: "credentials",
				lastLogin: new Date(),
				// Relations
				personId: superadminPerson.id,
			},
			include: {
				person: true,
			},
		});

		console.log(`✅ Superadmin user created with relations`);
		console.log(`   ID: ${superadminUser.id}`);
		console.log(`   Username: ${superadminUser.userName}`);
		console.log(`   Email: ${superadminUser.email}\n`);

		// 4. Verify Relations
		console.log("🔍 Verifying relationships...");
		const verifyUser = await prisma.user.findUnique({
			where: { id: superadminUser.id },
			include: {
				person: true,
			},
		});

		if (verifyUser?.person) {
			console.log("✅ Relations verified successfully");
			console.log(
				`   → User linked to Person: ${verifyUser.person.personalInfo.firstName} ${verifyUser.person.personalInfo.lastName}\n`,
			);
		} else {
			console.warn("⚠️  Warning: Relations may not be properly linked\n");
		}

		// Summary
		console.log("═════════════════════════════════════════");
		console.log("📊 SEED SUMMARY");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log("👤 PERSON");
		console.log(
			`   Name: ${superadminPerson.personalInfo.firstName} ${superadminPerson.personalInfo.middleName} ${superadminPerson.personalInfo.lastName}`,
		);
		console.log(`   Gender: ${superadminPerson.personalInfo.gender}`);
		console.log(`   Nationality: ${superadminPerson.personalInfo.nationality}`);
		console.log(`   KYC Status: ${superadminPerson.kycStatus}`);
		console.log(`   Primary Contact: ${superadminPerson.contactInfo[0].phoneNumber}`);
		console.log(`   Primary Email: ${superadminPerson.contactInfo[0].email}`);
		console.log(`   ID: ${superadminPerson.id}`);
		console.log("");
		console.log("👨‍💼 USER ACCOUNT");
		console.log(`   Username: ${superadminUser.userName}`);
		console.log(`   Email: ${superadminUser.email}`);
		console.log(`   Role: ${superadminUser.role}`);
		console.log(`   SubRole: ${superadminUser.subRole}`);
		console.log(`   Status: ${superadminUser.status}`);
		console.log(`   Login Method: ${superadminUser.loginMethod}`);
		console.log(`   ID: ${superadminUser.id}`);
		console.log("");
		console.log("🔐 CREDENTIALS");
		console.log(`   Email: superadmin@company.com`);
		console.log(`   Password: Test123!`);
		console.log(`   Hash Algorithm: Argon2id`);
		console.log("");
		console.log("🔗 RELATIONSHIPS");
		console.log(
			`   User → Person: ${superadminUser.personId === superadminPerson.id ? "✅ Linked" : "❌ Not Linked"}`,
		);
		console.log("");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log("✨ Seed completed successfully!");
		console.log("⚠️  Remember to change the default password after first login!\n");
	} catch (error) {
		console.error("❌ Error during seeding:");
		if (error instanceof Error) {
			console.error(`   Message: ${error.message}`);
			console.error(`   Stack: ${error.stack}`);
		} else {
			console.error(error);
		}
		throw error;
	}
}
