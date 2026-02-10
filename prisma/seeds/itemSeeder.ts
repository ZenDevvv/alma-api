import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedItem() {
	console.log("🌱 Starting item seeding...");

	const itemData = [
		// Email Templates
		{
			id: "507f1f77bcf86cd799439011",
			name: "Email Welcome Item",
			description: "Welcome email item for new users with personalized greeting",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439012",
			name: "Email Password Reset",
			description: "Password reset email item with secure reset link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439013",
			name: "Email Marketing Item",
			description: "Marketing email item for promotions and campaigns",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439014",
			name: "Email Order Confirmation",
			description: "Order confirmation email item with order details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439015",
			name: "Email Newsletter",
			description: "Newsletter email item for regular updates",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439016",
			name: "Email Invoice",
			description: "Invoice email item with payment details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439017",
			name: "Email Support Ticket",
			description: "Support ticket confirmation email item",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439018",
			name: "Email Feedback Request",
			description: "Feedback request email item for customer satisfaction",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439019",
			name: "Email Event Invitation",
			description: "Event invitation email item with RSVP functionality",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439020",
			name: "Email Account Activation",
			description: "Account activation email item with verification link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439021",
			name: "Email Subscription Confirmation",
			description: "Subscription confirmation email item",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439022",
			name: "Email Welcome Back",
			description: "Welcome back email for returning users",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439023",
			name: "Email Unsubscribe",
			description: "Unsubscribe confirmation email item",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439024",
			name: "Email Account Suspended",
			description: "Account suspension notification email",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439025",
			name: "Email Password Changed",
			description: "Password change confirmation email",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439026",
			name: "Email Profile Updated",
			description: "Profile update confirmation email",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "Email Welcome Series",
			description: "Welcome email series item for onboarding",
			type: "email",
			isDeleted: false,
		},

		// SMS Templates
		{
			id: "507f1f77bcf86cd799439028",
			name: "SMS Notification Item",
			description: "SMS item for important notifications",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "SMS Verification Code",
			description: "SMS item for verification codes",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439030",
			name: "SMS Appointment Reminder",
			description: "Appointment reminder SMS item",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439031",
			name: "SMS Payment Reminder",
			description: "Payment reminder SMS item",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439032",
			name: "SMS Emergency Alert",
			description: "Emergency alert SMS item",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439033",
			name: "SMS Delivery Update",
			description: "Delivery update SMS item",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439034",
			name: "SMS Two-Factor Auth",
			description: "Two-factor authentication SMS item",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439035",
			name: "SMS Service Update",
			description: "Service update notification SMS",
			type: "sms",
			isDeleted: false,
		},

		// Push Notification Templates
		{
			id: "507f1f77bcf86cd799439036",
			name: "Push Notification Item",
			description: "Push notification item for mobile apps",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439037",
			name: "Push Marketing Item",
			description: "Marketing push notification item",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439038",
			name: "Push System Update",
			description: "System update notification item",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439039",
			name: "Push Feature Announcement",
			description: "New feature announcement item",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439040",
			name: "Push Location Update",
			description: "Location-based push notification item",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439041",
			name: "Push Maintenance Alert",
			description: "System maintenance notification item",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439042",
			name: "Push Social Update",
			description: "Social media update notification item",
			type: "push",
			isDeleted: false,
		},

		// Form Templates
		{
			id: "507f1f77bcf86cd799439043",
			name: "Form Item",
			description: "Contact form item for website",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439044",
			name: "Form Registration",
			description: "User registration form item",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439045",
			name: "Form Survey",
			description: "Customer survey form item",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439046",
			name: "Form Feedback",
			description: "Customer feedback form item",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439047",
			name: "Form Contact Us",
			description: "Contact us form item",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439048",
			name: "Form Application",
			description: "Job application form item",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439049",
			name: "Form Booking",
			description: "Appointment booking form item",
			type: "form",
			isDeleted: false,
		},

		// Templates without type (for testing null handling)
		{
			id: "507f1f77bcf86cd799439050",
			name: "Generic Item",
			description: "Generic item without specific type",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439051",
			name: "Legacy Item",
			description: "Legacy item without type classification",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439052",
			name: "Custom Item",
			description: "Custom item for special use cases",
			type: null,
			isDeleted: false,
		},
	];

	try {
		// Clear existing items (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing items...");
		await prisma.item.deleteMany({});

		// Create items
		console.log("📝 Creating item records...");
		for (const item of itemData) {
			await prisma.item.create({
				data: item,
			});
		}

		console.log(`✅ Successfully created ${itemData.length} item records`);

		// Display summary by type
		const emailCount = itemData.filter((t) => t.type === "email").length;
		const smsCount = itemData.filter((t) => t.type === "sms").length;
		const pushCount = itemData.filter((t) => t.type === "push").length;
		const formCount = itemData.filter((t) => t.type === "form").length;
		const nullCount = itemData.filter((t) => t.type === null).length;

		console.log("\n📊 Item Summary:");
		console.log(`   📧 Email items: ${emailCount}`);
		console.log(`   📱 SMS items: ${smsCount}`);
		console.log(`   🔔 Push items: ${pushCount}`);
		console.log(`   📋 Form items: ${formCount}`);
		console.log(`   ❓ Unclassified: ${nullCount}`);
		console.log(`   📈 Total: ${itemData.length}`);

		console.log("\n🎉 Item seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during item seeding:", error);
		throw error;
	}
}
