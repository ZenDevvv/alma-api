import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedDeliveryReceiptItem() {
	console.log("🌱 Starting deliveryReceiptItem seeding...");

	const deliveryReceiptItemData = [
		// Email Templates
		{
			id: "507f1f77bcf86cd799439011",
			name: "Email Welcome DeliveryReceiptItem",
			description: "Welcome email deliveryReceiptItem for new users with personalized greeting",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439012",
			name: "Email Password Reset",
			description: "Password reset email deliveryReceiptItem with secure reset link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439013",
			name: "Email Marketing DeliveryReceiptItem",
			description: "Marketing email deliveryReceiptItem for promotions and campaigns",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439014",
			name: "Email Order Confirmation",
			description: "Order confirmation email deliveryReceiptItem with order details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439015",
			name: "Email Newsletter",
			description: "Newsletter email deliveryReceiptItem for regular updates",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439016",
			name: "Email Invoice",
			description: "Invoice email deliveryReceiptItem with payment details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439017",
			name: "Email Support Ticket",
			description: "Support ticket confirmation email deliveryReceiptItem",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439018",
			name: "Email Feedback Request",
			description: "Feedback request email deliveryReceiptItem for customer satisfaction",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439019",
			name: "Email Event Invitation",
			description: "Event invitation email deliveryReceiptItem with RSVP functionality",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439020",
			name: "Email Account Activation",
			description: "Account activation email deliveryReceiptItem with verification link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439021",
			name: "Email Subscription Confirmation",
			description: "Subscription confirmation email deliveryReceiptItem",
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
			description: "Unsubscribe confirmation email deliveryReceiptItem",
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
			description: "Welcome email series deliveryReceiptItem for onboarding",
			type: "email",
			isDeleted: false,
		},

		// SMS Templates
		{
			id: "507f1f77bcf86cd799439028",
			name: "SMS Notification DeliveryReceiptItem",
			description: "SMS deliveryReceiptItem for important notifications",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "SMS Verification Code",
			description: "SMS deliveryReceiptItem for verification codes",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439030",
			name: "SMS Appointment Reminder",
			description: "Appointment reminder SMS deliveryReceiptItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439031",
			name: "SMS Payment Reminder",
			description: "Payment reminder SMS deliveryReceiptItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439032",
			name: "SMS Emergency Alert",
			description: "Emergency alert SMS deliveryReceiptItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439033",
			name: "SMS Delivery Update",
			description: "Delivery update SMS deliveryReceiptItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439034",
			name: "SMS Two-Factor Auth",
			description: "Two-factor authentication SMS deliveryReceiptItem",
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
			name: "Push Notification DeliveryReceiptItem",
			description: "Push notification deliveryReceiptItem for mobile apps",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439037",
			name: "Push Marketing DeliveryReceiptItem",
			description: "Marketing push notification deliveryReceiptItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439038",
			name: "Push System Update",
			description: "System update notification deliveryReceiptItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439039",
			name: "Push Feature Announcement",
			description: "New feature announcement deliveryReceiptItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439040",
			name: "Push Location Update",
			description: "Location-based push notification deliveryReceiptItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439041",
			name: "Push Maintenance Alert",
			description: "System maintenance notification deliveryReceiptItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439042",
			name: "Push Social Update",
			description: "Social media update notification deliveryReceiptItem",
			type: "push",
			isDeleted: false,
		},

		// Form Templates
		{
			id: "507f1f77bcf86cd799439043",
			name: "Form DeliveryReceiptItem",
			description: "Contact form deliveryReceiptItem for website",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439044",
			name: "Form Registration",
			description: "User registration form deliveryReceiptItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439045",
			name: "Form Survey",
			description: "Customer survey form deliveryReceiptItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439046",
			name: "Form Feedback",
			description: "Customer feedback form deliveryReceiptItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439047",
			name: "Form Contact Us",
			description: "Contact us form deliveryReceiptItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439048",
			name: "Form Application",
			description: "Job application form deliveryReceiptItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439049",
			name: "Form Booking",
			description: "Appointment booking form deliveryReceiptItem",
			type: "form",
			isDeleted: false,
		},

		// Templates without type (for testing null handling)
		{
			id: "507f1f77bcf86cd799439050",
			name: "Generic DeliveryReceiptItem",
			description: "Generic deliveryReceiptItem without specific type",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439051",
			name: "Legacy DeliveryReceiptItem",
			description: "Legacy deliveryReceiptItem without type classification",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439052",
			name: "Custom DeliveryReceiptItem",
			description: "Custom deliveryReceiptItem for special use cases",
			type: null,
			isDeleted: false,
		},
	];

	try {
		// Clear existing deliveryReceiptItems (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing deliveryReceiptItems...");
		await prisma.deliveryReceiptItem.deleteMany({});

		// Create deliveryReceiptItems
		console.log("📝 Creating deliveryReceiptItem records...");
		for (const deliveryReceiptItem of deliveryReceiptItemData) {
			await prisma.deliveryReceiptItem.create({
				data: deliveryReceiptItem,
			});
		}

		console.log(`✅ Successfully created ${deliveryReceiptItemData.length} deliveryReceiptItem records`);

		// Display summary by type
		const emailCount = deliveryReceiptItemData.filter((t) => t.type === "email").length;
		const smsCount = deliveryReceiptItemData.filter((t) => t.type === "sms").length;
		const pushCount = deliveryReceiptItemData.filter((t) => t.type === "push").length;
		const formCount = deliveryReceiptItemData.filter((t) => t.type === "form").length;
		const nullCount = deliveryReceiptItemData.filter((t) => t.type === null).length;

		console.log("\n📊 DeliveryReceiptItem Summary:");
		console.log(`   📧 Email deliveryReceiptItems: ${emailCount}`);
		console.log(`   📱 SMS deliveryReceiptItems: ${smsCount}`);
		console.log(`   🔔 Push deliveryReceiptItems: ${pushCount}`);
		console.log(`   📋 Form deliveryReceiptItems: ${formCount}`);
		console.log(`   ❓ Unclassified: ${nullCount}`);
		console.log(`   📈 Total: ${deliveryReceiptItemData.length}`);

		console.log("\n🎉 DeliveryReceiptItem seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during deliveryReceiptItem seeding:", error);
		throw error;
	}
}
