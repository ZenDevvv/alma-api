import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedPurchaseOrderItem() {
	console.log("🌱 Starting PurchaseOrderItem seeding...");

	const PurchaseOrderItemData = [
		// Email Templates
		{
			id: "507f1f77bcf86cd799439011",
			name: "Email Welcome PurchaseOrderItem",
			description: "Welcome email PurchaseOrderItem for new users with personalized greeting",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439012",
			name: "Email Password Reset",
			description: "Password reset email PurchaseOrderItem with secure reset link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439013",
			name: "Email Marketing PurchaseOrderItem",
			description: "Marketing email PurchaseOrderItem for promotions and campaigns",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439014",
			name: "Email Order Confirmation",
			description: "Order confirmation email PurchaseOrderItem with order details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439015",
			name: "Email Newsletter",
			description: "Newsletter email PurchaseOrderItem for regular updates",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439016",
			name: "Email Invoice",
			description: "Invoice email PurchaseOrderItem with payment details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439017",
			name: "Email Support Ticket",
			description: "Support ticket confirmation email PurchaseOrderItem",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439018",
			name: "Email Feedback Request",
			description: "Feedback request email PurchaseOrderItem for customer satisfaction",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439019",
			name: "Email Event Invitation",
			description: "Event invitation email PurchaseOrderItem with RSVP functionality",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439020",
			name: "Email Account Activation",
			description: "Account activation email PurchaseOrderItem with verification link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439021",
			name: "Email Subscription Confirmation",
			description: "Subscription confirmation email PurchaseOrderItem",
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
			description: "Unsubscribe confirmation email PurchaseOrderItem",
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
			description: "Welcome email series PurchaseOrderItem for onboarding",
			type: "email",
			isDeleted: false,
		},

		// SMS Templates
		{
			id: "507f1f77bcf86cd799439028",
			name: "SMS Notification PurchaseOrderItem",
			description: "SMS PurchaseOrderItem for important notifications",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "SMS Verification Code",
			description: "SMS PurchaseOrderItem for verification codes",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439030",
			name: "SMS Appointment Reminder",
			description: "Appointment reminder SMS PurchaseOrderItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439031",
			name: "SMS Payment Reminder",
			description: "Payment reminder SMS PurchaseOrderItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439032",
			name: "SMS Emergency Alert",
			description: "Emergency alert SMS PurchaseOrderItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439033",
			name: "SMS Delivery Update",
			description: "Delivery update SMS PurchaseOrderItem",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439034",
			name: "SMS Two-Factor Auth",
			description: "Two-factor authentication SMS PurchaseOrderItem",
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
			name: "Push Notification PurchaseOrderItem",
			description: "Push notification PurchaseOrderItem for mobile apps",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439037",
			name: "Push Marketing PurchaseOrderItem",
			description: "Marketing push notification PurchaseOrderItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439038",
			name: "Push System Update",
			description: "System update notification PurchaseOrderItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439039",
			name: "Push Feature Announcement",
			description: "New feature announcement PurchaseOrderItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439040",
			name: "Push Location Update",
			description: "Location-based push notification PurchaseOrderItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439041",
			name: "Push Maintenance Alert",
			description: "System maintenance notification PurchaseOrderItem",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439042",
			name: "Push Social Update",
			description: "Social media update notification PurchaseOrderItem",
			type: "push",
			isDeleted: false,
		},

		// Form Templates
		{
			id: "507f1f77bcf86cd799439043",
			name: "Form PurchaseOrderItem",
			description: "Contact form PurchaseOrderItem for website",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439044",
			name: "Form Registration",
			description: "User registration form PurchaseOrderItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439045",
			name: "Form Survey",
			description: "Customer survey form PurchaseOrderItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439046",
			name: "Form Feedback",
			description: "Customer feedback form PurchaseOrderItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439047",
			name: "Form Contact Us",
			description: "Contact us form PurchaseOrderItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439048",
			name: "Form Application",
			description: "Job application form PurchaseOrderItem",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439049",
			name: "Form Booking",
			description: "Appointment booking form PurchaseOrderItem",
			type: "form",
			isDeleted: false,
		},

		// Templates without type (for testing null handling)
		{
			id: "507f1f77bcf86cd799439050",
			name: "Generic PurchaseOrderItem",
			description: "Generic PurchaseOrderItem without specific type",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439051",
			name: "Legacy PurchaseOrderItem",
			description: "Legacy PurchaseOrderItem without type classification",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439052",
			name: "Custom PurchaseOrderItem",
			description: "Custom PurchaseOrderItem for special use cases",
			type: null,
			isDeleted: false,
		},
	];

	try {
		// Clear existing PurchaseOrderItems (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing PurchaseOrderItems...");
		await prisma.purchaseorderitem.deleteMany({});

		// Create PurchaseOrderItems
		console.log("📝 Creating PurchaseOrderItem records...");
		for (const PurchaseOrderItem of PurchaseOrderItemData) {
			await prisma.purchaseorderitem.create({
				data: PurchaseOrderItem,
			});
		}

		console.log(`✅ Successfully created ${PurchaseOrderItemData.length} PurchaseOrderItem records`);

		// Display summary by type
		const emailCount = PurchaseOrderItemData.filter((t) => t.type === "email").length;
		const smsCount = PurchaseOrderItemData.filter((t) => t.type === "sms").length;
		const pushCount = PurchaseOrderItemData.filter((t) => t.type === "push").length;
		const formCount = PurchaseOrderItemData.filter((t) => t.type === "form").length;
		const nullCount = PurchaseOrderItemData.filter((t) => t.type === null).length;

		console.log("\n📊 PurchaseOrderItem Summary:");
		console.log(`   📧 Email PurchaseOrderItems: ${emailCount}`);
		console.log(`   📱 SMS PurchaseOrderItems: ${smsCount}`);
		console.log(`   🔔 Push PurchaseOrderItems: ${pushCount}`);
		console.log(`   📋 Form PurchaseOrderItems: ${formCount}`);
		console.log(`   ❓ Unclassified: ${nullCount}`);
		console.log(`   📈 Total: ${PurchaseOrderItemData.length}`);

		console.log("\n🎉 PurchaseOrderItem seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during PurchaseOrderItem seeding:", error);
		throw error;
	}
}
