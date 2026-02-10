import { PrismaClient } from "../../generated/prisma";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

// Department configurations
// PPP Management has NO orgId (global department - can access all)
// PPP Office has one per organization
// Other departments are split between ospar-1, ospar-2, and ospar-3
const departments = [
	{ name: "PPP Management", code: "PPPMG", orgId: null }, // Global department, no organization
	{ name: "PPP Office", code: "PPPOF", orgId: "507f1f77bcf86cd799439011" },

	{ name: "Pharmacy", code: "PHMCY", orgId: "507f1f77bcf86cd799439011" },
	{ name: "Radiology", code: "RADLG", orgId: "507f1f77bcf86cd799439011" },
	{ name: "Laboratory", code: "LABRT", orgId: "507f1f77bcf86cd799439011" },
	{ name: "Hemodialysis", code: "HMDLS", orgId: "507f1f77bcf86cd799439011" },
	{ name: "Malasakit Center", code: "MLSKT", orgId: "507f1f77bcf86cd799439011" },

	{ name: "PPP Office", code: "PPPOF", orgId: "507f1f77bcf86cd799439012" },
	{ name: "Pharmacy", code: "PHMCY", orgId: "507f1f77bcf86cd799439012" },
	{ name: "Radiology", code: "RADLG", orgId: "507f1f77bcf86cd799439012" },
	{ name: "Laboratory", code: "LABRT", orgId: "507f1f77bcf86cd799439012" },
	{ name: "Hemodialysis", code: "HMDLS", orgId: "507f1f77bcf86cd799439012" },
	{ name: "Malasakit Center", code: "MLSKT", orgId: "507f1f77bcf86cd799439012" },
];

// Complete user data with person information
const usersData = [
	{
		// User credentials - PPP Management (Global, no org - can access all)
		username: "ppp-management-1",
		email: "ppp-management-1@company.com",
		role: "admin",
		subRole: "super",
		departmentCode: "PPPMG",
		orgId: null, // No organization for management

		// Person information
		person: {
			firstName: "John",
			lastName: "Martinez",
			middleName: "Santos",
			dateOfBirth: "1985-03-15",
			gender: "MALE",
			nationality: "Filipino",
			phoneNumber: "+639171234561",
			address: {
				addressLine1: "123 Admin Tower",
				addressLine2: "5th Floor Management Wing",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Maria",
				lastName: "Martinez",
				relationship: "Spouse",
				phoneNumber: "+639181234561",
			},
		},
	},
	{
		username: "ppp-office-ospar1",
		email: "ppp-office-ospar1@company.com",
		role: "admin",
		subRole: "supervisor",
		departmentCode: "PPPOF",
		orgId: "507f1f77bcf86cd799439011", // OSPAR-1

		person: {
			firstName: "Jane",
			lastName: "Dela Cruz",
			middleName: "Reyes",
			dateOfBirth: "1990-07-22",
			gender: "FEMALE",
			nationality: "Filipino",
			phoneNumber: "+639171234562",
			address: {
				addressLine1: "456 Office Complex",
				addressLine2: "3rd Floor PPP Wing",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Pedro",
				lastName: "Dela Cruz",
				relationship: "Father",
				phoneNumber: "+639181234562",
			},
		},
	},
	{
		username: "ppp-office-ospar2",
		email: "ppp-office-ospar2@company.com",
		role: "admin",
		subRole: "supervisor",
		departmentCode: "PPPOF",
		orgId: "507f1f77bcf86cd799439012", // OSPAR-2

		person: {
			firstName: "Robert",
			lastName: "Gonzales",
			middleName: "Cruz",
			dateOfBirth: "1988-06-15",
			gender: "MALE",
			nationality: "Filipino",
			phoneNumber: "+639171234568",
			address: {
				addressLine1: "789 Business Center",
				addressLine2: "2nd Floor Admin Wing",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Linda",
				lastName: "Gonzales",
				relationship: "Wife",
				phoneNumber: "+639181234568",
			},
		},
	},
	{
		username: "pharmacy-ospar1",
		email: "pharmacy-ospar1@company.com",
		role: "user",
		subRole: "staff",
		departmentCode: "PHMCY",
		orgId: "507f1f77bcf86cd799439011", // OSPAR-1

		person: {
			firstName: "Mike",
			lastName: "Ramos",
			middleName: "Cruz",
			dateOfBirth: "1988-11-10",
			gender: "MALE",
			nationality: "Filipino",
			phoneNumber: "+639171234563",
			address: {
				addressLine1: "789 Medical Plaza",
				addressLine2: "Ground Floor Pharmacy Section",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Anna",
				lastName: "Ramos",
				relationship: "Sister",
				phoneNumber: "+639181234563",
			},
		},
	},
	{
		username: "radiology-ospar1",
		email: "radiology-ospar1@company.com",
		role: "user",
		subRole: "staff",
		departmentCode: "RADLG",
		orgId: "507f1f77bcf86cd799439011", // OSPAR-1

		person: {
			firstName: "Sarah",
			lastName: "Villanueva",
			middleName: "Torres",
			dateOfBirth: "1992-05-18",
			gender: "FEMALE",
			nationality: "Filipino",
			phoneNumber: "+639171234564",
			address: {
				addressLine1: "321 Diagnostic Center",
				addressLine2: "2nd Floor Radiology Department",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Roberto",
				lastName: "Villanueva",
				relationship: "Father",
				phoneNumber: "+639181234564",
			},
		},
	},
	{
		username: "laboratory-ospar1",
		email: "laboratory-ospar1@company.com",
		role: "user",
		subRole: "staff",
		departmentCode: "LABRT",
		orgId: "507f1f77bcf86cd799439011", // OSPAR-1

		person: {
			firstName: "Carlos",
			lastName: "Garcia",
			middleName: "Lopez",
			dateOfBirth: "1987-09-25",
			gender: "MALE",
			nationality: "Filipino",
			phoneNumber: "+639171234565",
			address: {
				addressLine1: "654 Clinical Building",
				addressLine2: "Basement Laboratory Wing",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Carmen",
				lastName: "Garcia",
				relationship: "Mother",
				phoneNumber: "+639181234565",
			},
		},
	},
	{
		username: "pharmacy-ospar2",
		email: "pharmacy-ospar2@company.com",
		role: "user",
		subRole: "staff",
		departmentCode: "PHMCY",
		orgId: "507f1f77bcf86cd799439012", // OSPAR-2

		person: {
			firstName: "Emily",
			lastName: "Santos",
			middleName: "Fernandez",
			dateOfBirth: "1991-12-08",
			gender: "FEMALE",
			nationality: "Filipino",
			phoneNumber: "+639171234566",
			address: {
				addressLine1: "987 Treatment Facility",
				addressLine2: "4th Floor Pharmacy Unit",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Luis",
				lastName: "Santos",
				relationship: "Brother",
				phoneNumber: "+639181234566",
			},
		},
	},
	{
		username: "radiology-ospar2",
		email: "radiology-ospar2@company.com",
		role: "user",
		subRole: "staff",
		departmentCode: "RADLG",
		orgId: "507f1f77bcf86cd799439012", // OSPAR-2

		person: {
			firstName: "Daniel",
			lastName: "Reyes",
			middleName: "Cruz",
			dateOfBirth: "1989-03-20",
			gender: "MALE",
			nationality: "Filipino",
			phoneNumber: "+639171234567",
			address: {
				addressLine1: "456 Medical Center",
				addressLine2: "3rd Floor Radiology",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Rosa",
				lastName: "Reyes",
				relationship: "Wife",
				phoneNumber: "+639181234567",
			},
		},
	},
	{
		username: "laboratory-ospar2",
		email: "laboratory-ospar2@company.com",
		role: "user",
		subRole: "staff",
		departmentCode: "LABRT",
		orgId: "507f1f77bcf86cd799439012", // OSPAR-2

		person: {
			firstName: "Patricia",
			lastName: "Mendoza",
			middleName: "Rivera",
			dateOfBirth: "1993-08-14",
			gender: "FEMALE",
			nationality: "Filipino",
			phoneNumber: "+639171234568",
			address: {
				addressLine1: "789 Health Complex",
				addressLine2: "Basement Laboratory",
				street: "Commonwealth Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Miguel",
				lastName: "Mendoza",
				relationship: "Father",
				phoneNumber: "+639181234568",
			},
		},
	},
	{
		username: "malasakit-1-ospar1",
		email: "malasakit.ospar1@company.com",
		role: "user",
		subRole: "malasakit",
		departmentCode: "MLSKT",
		orgId: "507f1f77bcf86cd799439011", // OSPAR-1

		person: {
			firstName: "Maria",
			lastName: "Bautista",
			middleName: "Angeles",
			dateOfBirth: "1990-05-12",
			gender: "FEMALE",
			nationality: "Filipino",
			phoneNumber: "+639171234569",
			address: {
				addressLine1: "123 Malasakit Building",
				addressLine2: "Ground Floor Service Center",
				street: "Quezon Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Jose",
				lastName: "Bautista",
				relationship: "Husband",
				phoneNumber: "+639181234569",
			},
		},
	},
	{
		username: "malasakit-2-ospar2",
		email: "malasakit.ospar2@company.com",
		role: "user",
		subRole: "malasakit",
		departmentCode: "MLSKT",
		orgId: "507f1f77bcf86cd799439012", // OSPAR-2

		person: {
			firstName: "Antonio",
			lastName: "Flores",
			middleName: "Santiago",
			dateOfBirth: "1986-11-28",
			gender: "MALE",
			nationality: "Filipino",
			phoneNumber: "+639171234570",
			address: {
				addressLine1: "456 Community Care Center",
				addressLine2: "2nd Floor Assistance Office",
				street: "Quezon Avenue",
				city: "Quezon City",
				state: "Metro Manila",
				postalCode: "1100",
			},
			emergencyContact: {
				firstName: "Teresa",
				lastName: "Flores",
				relationship: "Sister",
				phoneNumber: "+639181234570",
			},
		},
	},
];

export async function GenerateUser() {
	console.log("🌱 Starting seed...\n");

	try {
		// 1. Hash password using Argon2 (once for all users)
		console.log("🔐 Hashing password with Argon2...");
		const hashedPassword = await argon2.hash("Test123!", {
			type: argon2.argon2id,
			memoryCost: 65536, // 64 MB
			timeCost: 3,
			parallelism: 4,
		});
		console.log("✅ Password hashed securely\n");

		// 2. Create Departments first
		console.log("📁 Creating Departments...");
		const departmentMap = new Map();

		for (const dept of departments) {
			const existingDepartment = await prisma.department.findFirst({
				where: {
					orgId: dept.orgId,
					code: dept.code,
				},
			});

			let department;
			if (existingDepartment) {
				department = await prisma.department.update({
					where: { id: existingDepartment.id },
					data: {
						name: dept.name,
						// Update other fields if needed
					},
				});
			} else {
				department = await prisma.department.create({
					data: {
						orgId: dept.orgId,
						name: dept.name,
						code: dept.code,
						address: "Main Office Building",
						city: "Quezon City",
						state: "Metro Manila",
						country: "Philippines",
						postalCode: "1100",
						contactPerson: `${dept.name} Support`,
						contactPhone: "+63-2-8123-4567",
						contactEmail: `${dept.code}@company.com`,
						isActive: true,
						isDeleted: false,
					},
				});
			}
			// Store with composite key for lookup
			const deptKey = `${dept.orgId || "null"}-${dept.code}`;
			departmentMap.set(deptKey, department);
			const orgLabel = dept.orgId ? `Org: ${dept.orgId.slice(-4)}` : "Global (No Org)";
			console.log(
				`✅ Department created: ${department.name} (${department.code}) - ${orgLabel}`,
			);
		}

		// 3. Create Users with their Person data
		let totalUsersCreated = 0;

		for (const userData of usersData) {
			// Look up department using composite key
			const deptKey = `${userData.orgId || "null"}-${userData.departmentCode}`;
			const department = departmentMap.get(deptKey);

			if (!department) {
				console.error(
					`❌ Department not found for code: ${userData.departmentCode} with orgId: ${userData.orgId}`,
				);
				continue;
			}

			const orgId = userData.orgId;

			console.log(`👤 Creating Person record for ${userData.username}...`);
			const person = await prisma.person.create({
				data: {
					orgId: orgId,
					personalInfo: {
						firstName: userData.person.firstName,
						lastName: userData.person.lastName,
						middleName: userData.person.middleName,
						dateOfBirth: new Date(userData.person.dateOfBirth),
						gender: userData.person.gender as any,
						nationality: userData.person.nationality,
					},
					contactInfo: [
						{
							type: "MOBILE",
							phoneNumber: userData.person.phoneNumber,
							email: userData.email,
							countryCode: "+63",
							isPrimary: true,
							isVerified: true,
							label: "Primary Contact",
						},
					],
					addresses: [
						{
							type: "PRIMARY",
							addressLine1: userData.person.address.addressLine1,
							addressLine2: userData.person.address.addressLine2,
							street: userData.person.address.street,
							city: userData.person.address.city,
							state: userData.person.address.state,
							country: "Philippines",
							postalCode: userData.person.address.postalCode,
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
							languageCode: "fil",
							languageName: "Filipino",
							proficiency: "NATIVE",
							isNative: true,
						},
					],
					preferredLanguage: "en",
					emergencyContacts: [
						{
							firstName: userData.person.emergencyContact.firstName,
							lastName: userData.person.emergencyContact.lastName,
							relationship: userData.person.emergencyContact.relationship,
							phoneNumber: userData.person.emergencyContact.phoneNumber,
							priority: 1,
							notes: `Primary emergency contact for ${userData.person.firstName} ${userData.person.lastName}`,
						},
					],
					kycStatus: "APPROVED",
				},
			});

			console.log(`✅ Person created: ${person.id}`);

			// Create User linked to Person
			console.log(`👨‍💼 Creating User account for ${userData.username}...`);
			const user = await prisma.user.upsert({
				where: { userName: userData.username },
				update: {},
				create: {
					orgId: orgId,
					userName: userData.username,
					email: userData.email,
					password: hashedPassword,
					role: userData.role as any,
					...(userData.subRole && { subRole: userData.subRole as any }),
					departmentId: department.id,
					personId: person.id,
					status: "active",
					isDeleted: false,
					loginMethod: "local",
				},
			});

			console.log(`✅ User created successfully`);
			console.log(`   ID: ${user.id}`);
			console.log(`   Username: ${user.userName}`);
			console.log(`   Email: ${user.email}`);
			console.log(`   Role: ${user.role}`);
			console.log(`   Organization ID: ${orgId || "None (Global)"}`);
			console.log(`   Department: ${department.name}\n`);

			totalUsersCreated++;
		}

		// Summary
		console.log("═════════════════════════════════════════");
		console.log("📊 SEED SUMMARY");
		console.log("═════════════════════════════════════════");
		console.log("");
		console.log(`🏢 DEPARTMENTS CREATED: ${departments.length}`);
		console.log("\n  Global Departments (No Organization):");
		departments
			.filter((d) => !d.orgId)
			.forEach((dept) => {
				const userCount = usersData.filter((u) => u.departmentCode === dept.code).length;
				console.log(`    • ${dept.name} (${dept.code}) - ${userCount} user(s)`);
			});
		console.log("\n  OSPAR-1 Departments:");
		departments
			.filter((d) => d.orgId === "507f1f77bcf86cd799439011")
			.forEach((dept) => {
				const userCount = usersData.filter((u) => u.departmentCode === dept.code).length;
				console.log(`    • ${dept.name} (${dept.code}) - ${userCount} user(s)`);
			});
		console.log("\n  OSPAR-2 Departments:");
		departments
			.filter((d) => d.orgId === "507f1f77bcf86cd799439012")
			.forEach((dept) => {
				const userCount = usersData.filter((u) => u.departmentCode === dept.code).length;
				console.log(`    • ${dept.name} (${dept.code}) - ${userCount} user(s)`);
			});
		console.log("\n  OSPAR-3 Departments:");
		departments
			.filter((d) => d.orgId === "507f1f77bcf86cd799439013")
			.forEach((dept) => {
				const userCount = usersData.filter((u) => u.departmentCode === dept.code).length;
				console.log(`    • ${dept.name} (${dept.code}) - ${userCount} user(s)`);
			});
		console.log("");
		console.log(`👤 TOTAL PERSONS CREATED: ${totalUsersCreated}`);
		console.log(`👨‍💼 TOTAL USERS CREATED: ${totalUsersCreated}`);
		console.log("");
		console.log("📋 USER LIST");
		usersData.forEach((u) => {
			const orgLabel = u.orgId ? `Org: ${u.orgId.slice(-4)}` : "Global";
			console.log(
				`   • ${u.username} (${u.person.firstName} ${u.person.lastName}) - ${u.role} - ${orgLabel}`,
			);
		});
		console.log("");
		console.log("🔐 DEFAULT CREDENTIALS");
		console.log(`   Password: Test123! (for all users)`);
		console.log(`   Hash Algorithm: Argon2id`);
		console.log(`   ⚠️  Change after first login!`);
		console.log("");
		console.log("🔗 RELATIONSHIPS");
		console.log(`   PPP Management: Global (can access all organizations) ✅`);
		console.log(`   PPP Office: Each organization has its own ✅`);
		console.log(`   Department users: Linked to OSPAR-1, OSPAR-2, or OSPAR-3 ✅`);
		console.log(`   All users linked to their respective Persons and Departments ✅`);
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
