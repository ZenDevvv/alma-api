import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

const organizations = [
	{
		name: "ALMA University",
		description: "Main university organization",
		code: "ALMA-UNI",
		logo: "https://picsum.photos/seed/alma-uni-logo/200/200",
		background: "https://picsum.photos/seed/alma-uni-bg/1920/400",
	},
	{
		name: "ALMA College of Engineering",
		description: "College of Engineering",
		code: "ALMA-COE",
		logo: "https://picsum.photos/seed/alma-coe-logo/200/200",
		background: "https://picsum.photos/seed/alma-coe-bg/1920/400",
	},
	{
		name: "ALMA College of Arts and Sciences",
		description: "College of Arts and Sciences",
		code: "ALMA-CAS",
		logo: "https://picsum.photos/seed/alma-cas-logo/200/200",
		background: "https://picsum.photos/seed/alma-cas-bg/1920/400",
	},
];

async function seedOrganizations() {
	for (const org of organizations) {
		const existing = await prisma.organization.findUnique({
			where: { code: org.code },
		});

		if (existing) {
			console.log(`Organization "${org.name}" already exists (${org.code}), skipping.`);
			continue;
		}

		const created = await prisma.organization.create({
			data: org,
		});

		console.log(`Organization created: ${created.name} (id: ${created.id})`);
	}
}

export default seedOrganizations;
