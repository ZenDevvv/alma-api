import { uploadFiles } from "../middleware/upload";

export const uploadOrgImages = uploadFiles({
	fields: [
		{ name: "logo", folder: "organizations/logos" },
		{ name: "background", folder: "organizations/backgrounds" },
	],
});
