import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedDeliveryReceipt() {
	console.log("🌱 Starting deliveryReceipt seeding...");

	const deliveryReceiptData = [
		// Email Templates
		{
			id: "507f1f77bcf86cd799439011",
			name: "Email Welcome DeliveryReceipt",
			description: "Welcome email deliveryReceipt for new users with personalized greeting",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439012",
			name: "Email Password Reset",
			description: "Password reset email deliveryReceipt with secure reset link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439013",
			name: "Email Marketing DeliveryReceipt",
			description: "Marketing email deliveryReceipt for promotions and campaigns",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439014",
			name: "Email Order Confirmation",
			description: "Order confirmation email deliveryReceipt with order details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439015",
			name: "Email Newsletter",
			description: "Newsletter email deliveryReceipt for regular updates",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439016",
			name: "Email Invoice",
			description: "Invoice email deliveryReceipt with payment details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439017",
			name: "Email Support Ticket",
			description: "Support ticket confirmation email deliveryReceipt",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439018",
			name: "Email Feedback Request",
			description: "Feedback request email deliveryReceipt for customer satisfaction",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439019",
			name: "Email Event Invitation",
			description: "Event invitation email deliveryReceipt with RSVP functionality",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439020",
			name: "Email Account Activation",
			description: "Account activation email deliveryReceipt with verification link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439021",
			name: "Email Subscription Confirmation",
			description: "Subscription confirmation email deliveryReceipt",
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
			description: "Unsubscribe confirmation email deliveryReceipt",
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
			description: "Welcome email series deliveryReceipt for onboarding",
			type: "email",
			isDeleted: false,
		},

		// SMS Templates
		{
			id: "507f1f77bcf86cd799439028",
			name: "SMS Notification DeliveryReceipt",
			description: "SMS deliveryReceipt for important notifications",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "SMS Verification Code",
			description: "SMS deliveryReceipt for verification codes",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439030",
			name: "SMS Appointment Reminder",
			description: "Appointment reminder SMS deliveryReceipt",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439031",
			name: "SMS Payment Reminder",
			description: "Payment reminder SMS deliveryReceipt",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439032",
			name: "SMS Emergency Alert",
			description: "Emergency alert SMS deliveryReceipt",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439033",
			name: "SMS Delivery Update",
			description: "Delivery update SMS deliveryReceipt",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439034",
			name: "SMS Two-Factor Auth",
			description: "Two-factor authentication SMS deliveryReceipt",
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
			name: "Push Notification DeliveryReceipt",
			description: "Push notification deliveryReceipt for mobile apps",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439037",
			name: "Push Marketing DeliveryReceipt",
			description: "Marketing push notification deliveryReceipt",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439038",
			name: "Push System Update",
			description: "System update notification deliveryReceipt",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439039",
			name: "Push Feature Announcement",
			description: "New feature announcement deliveryReceipt",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439040",
			name: "Push Location Update",
			description: "Location-based push notification deliveryReceipt",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439041",
			name: "Push Maintenance Alert",
			description: "System maintenance notification deliveryReceipt",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439042",
			name: "Push Social Update",
			description: "Social media update notification deliveryReceipt",
			type: "push",
			isDeleted: false,
		},

		// Form Templates
		{
			id: "507f1f77bcf86cd799439043",
			name: "Form DeliveryReceipt",
			description: "Contact form deliveryReceipt for website",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439044",
			name: "Form Registration",
			description: "User registration form deliveryReceipt",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439045",
			name: "Form Survey",
			description: "Customer survey form deliveryReceipt",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439046",
			name: "Form Feedback",
			description: "Customer feedback form deliveryReceipt",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439047",
			name: "Form Contact Us",
			description: "Contact us form deliveryReceipt",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439048",
			name: "Form Application",
			description: "Job application form deliveryReceipt",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439049",
			name: "Form Booking",
			description: "Appointment booking form deliveryReceipt",
			type: "form",
			isDeleted: false,
		},

		// Templates without type (for testing null handling)
		{
			id: "507f1f77bcf86cd799439050",
			name: "Generic DeliveryReceipt",
			description: "Generic deliveryReceipt without specific type",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439051",
			name: "Legacy DeliveryReceipt",
			description: "Legacy deliveryReceipt without type classification",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439052",
			name: "Custom DeliveryReceipt",
			description: "Custom deliveryReceipt for special use cases",
			type: null,
			isDeleted: false,
		},
	];

	try {
		// Clear existing deliveryReceipts (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing deliveryReceipts...");
		await prisma.deliveryReceipt.deleteMany({});

		// Create deliveryReceipts
		console.log("📝 Creating deliveryReceipt records...");
		for (const deliveryReceipt of deliveryReceiptData) {
			await prisma.deliveryReceipt.create({
				data: deliveryReceipt,
			});
		}

		console.log(`✅ Successfully created ${deliveryReceiptData.length} deliveryReceipt records`);

		// Display summary by type
		const emailCount = deliveryReceiptData.filter((t) => t.type === "email").length;
		const smsCount = deliveryReceiptData.filter((t) => t.type === "sms").length;
		const pushCount = deliveryReceiptData.filter((t) => t.type === "push").length;
		const formCount = deliveryReceiptData.filter((t) => t.type === "form").length;
		const nullCount = deliveryReceiptData.filter((t) => t.type === null).length;

		console.log("\n📊 DeliveryReceipt Summary:");
		console.log(`   📧 Email deliveryReceipts: ${emailCount}`);
		console.log(`   📱 SMS deliveryReceipts: ${smsCount}`);
		console.log(`   🔔 Push deliveryReceipts: ${pushCount}`);
		console.log(`   📋 Form deliveryReceipts: ${formCount}`);
		console.log(`   ❓ Unclassified: ${nullCount}`);
		console.log(`   📈 Total: ${deliveryReceiptData.length}`);

		console.log("\n🎉 DeliveryReceipt seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during deliveryReceipt seeding:", error);
		throw error;
	}
}
