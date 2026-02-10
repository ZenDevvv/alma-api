import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedUser() {
	console.log("🌱 Starting user seeding...");

	const userData = [
		// Email Templates
		{
			id: "507f1f77bcf86cd799439011",
			name: "Email Welcome User",
			description: "Welcome email user for new users with personalized greeting",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439012",
			name: "Email Password Reset",
			description: "Password reset email user with secure reset link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439013",
			name: "Email Marketing User",
			description: "Marketing email user for promotions and campaigns",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439014",
			name: "Email Order Confirmation",
			description: "Order confirmation email user with order details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439015",
			name: "Email Newsletter",
			description: "Newsletter email user for regular updates",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439016",
			name: "Email Invoice",
			description: "Invoice email user with payment details",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439017",
			name: "Email Support Ticket",
			description: "Support ticket confirmation email user",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439018",
			name: "Email Feedback Request",
			description: "Feedback request email user for customer satisfaction",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439019",
			name: "Email Event Invitation",
			description: "Event invitation email user with RSVP functionality",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439020",
			name: "Email Account Activation",
			description: "Account activation email user with verification link",
			type: "email",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439021",
			name: "Email Subscription Confirmation",
			description: "Subscription confirmation email user",
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
			description: "Unsubscribe confirmation email user",
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
			description: "Welcome email series user for onboarding",
			type: "email",
			isDeleted: false,
		},

		// SMS Templates
		{
			id: "507f1f77bcf86cd799439028",
			name: "SMS Notification User",
			description: "SMS user for important notifications",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "SMS Verification Code",
			description: "SMS user for verification codes",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439030",
			name: "SMS Appointment Reminder",
			description: "Appointment reminder SMS user",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439031",
			name: "SMS Payment Reminder",
			description: "Payment reminder SMS user",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439032",
			name: "SMS Emergency Alert",
			description: "Emergency alert SMS user",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439033",
			name: "SMS Delivery Update",
			description: "Delivery update SMS user",
			type: "sms",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439034",
			name: "SMS Two-Factor Auth",
			description: "Two-factor authentication SMS user",
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
			name: "Push Notification User",
			description: "Push notification user for mobile apps",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439037",
			name: "Push Marketing User",
			description: "Marketing push notification user",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439038",
			name: "Push System Update",
			description: "System update notification user",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439039",
			name: "Push Feature Announcement",
			description: "New feature announcement user",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439040",
			name: "Push Location Update",
			description: "Location-based push notification user",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439041",
			name: "Push Maintenance Alert",
			description: "System maintenance notification user",
			type: "push",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439042",
			name: "Push Social Update",
			description: "Social media update notification user",
			type: "push",
			isDeleted: false,
		},

		// Form Templates
		{
			id: "507f1f77bcf86cd799439043",
			name: "Form User",
			description: "Contact form user for website",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439044",
			name: "Form Registration",
			description: "User registration form user",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439045",
			name: "Form Survey",
			description: "Customer survey form user",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439046",
			name: "Form Feedback",
			description: "Customer feedback form user",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439047",
			name: "Form Contact Us",
			description: "Contact us form user",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439048",
			name: "Form Application",
			description: "Job application form user",
			type: "form",
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439049",
			name: "Form Booking",
			description: "Appointment booking form user",
			type: "form",
			isDeleted: false,
		},

		// Templates without type (for testing null handling)
		{
			id: "507f1f77bcf86cd799439050",
			name: "Generic User",
			description: "Generic user without specific type",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439051",
			name: "Legacy User",
			description: "Legacy user without type classification",
			type: null,
			isDeleted: false,
		},
		{
			id: "507f1f77bcf86cd799439052",
			name: "Custom User",
			description: "Custom user for special use cases",
			type: null,
			isDeleted: false,
		},
	];

	try {
		// Clear existing users (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing users...");
		await prisma.user.deleteMany({});

		// Create users
		console.log("📝 Creating user records...");
		for (const user of userData) {
			await prisma.user.create({
				data: user,
			});
		}

		console.log(`✅ Successfully created ${userData.length} user records`);

		// Display summary by type
		const emailCount = userData.filter((t) => t.type === "email").length;
		const smsCount = userData.filter((t) => t.type === "sms").length;
		const pushCount = userData.filter((t) => t.type === "push").length;
		const formCount = userData.filter((t) => t.type === "form").length;
		const nullCount = userData.filter((t) => t.type === null).length;

		console.log("\n📊 User Summary:");
		console.log(`   📧 Email users: ${emailCount}`);
		console.log(`   📱 SMS users: ${smsCount}`);
		console.log(`   🔔 Push users: ${pushCount}`);
		console.log(`   📋 Form users: ${formCount}`);
		console.log(`   ❓ Unclassified: ${nullCount}`);
		console.log(`   📈 Total: ${userData.length}`);

		console.log("\n🎉 User seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during user seeding:", error);
		throw error;
	}
}
