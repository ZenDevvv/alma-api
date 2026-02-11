import { uploadFiles } from "../middleware/upload";

const FOLDER_PREFIX = "LMS";

export const uploadOrgImages = uploadFiles({
	fields: [
		{ name: "logo", folder: `${FOLDER_PREFIX}/organizations/logos` },
		{ name: "background", folder: `${FOLDER_PREFIX}/organizations/backgrounds` },
	],
});
