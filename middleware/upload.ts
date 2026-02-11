import { Request, Response, NextFunction } from "express";
import multer from "multer";
import uploadToCloudinary from "../helper/cloudinary-helper";
import "../config/cloudinary.config";

interface FieldConfig {
	name: string;
	maxCount?: number;
	folder: string;
	required?: boolean;
}

interface UploadConfig {
	fields: FieldConfig[];
	fileSizeLimit?: number;
}

declare global {
	namespace Express {
		interface Request {
			uploadedFiles?: Record<string, string>;
		}
	}
}

const storage = multer.memoryStorage();

const imageFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
	if (file.mimetype.startsWith("image/")) {
		cb(null, true);
	} else {
		cb(new Error(`Only image files are allowed. Received: ${file.mimetype}`));
	}
};

const csvFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
	if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
		cb(null, true);
	} else {
		cb(new Error("Only CSV files are allowed."));
	}
};

/**
 * Reusable upload middleware that handles multer parsing + Cloudinary upload.
 *
 * Usage in routes:
 *   router.post("/", uploadFiles({
 *     fields: [
 *       { name: "logo", folder: "organizations/logos" },
 *       { name: "background", folder: "organizations/backgrounds" },
 *     ],
 *   }), controller.create);
 *
 * After this middleware, `req.uploadedFiles` contains { fieldName: cloudinaryUrl }
 * e.g. { logo: "https://res.cloudinary.com/...", background: "https://res.cloudinary.com/..." }
 */
export const uploadFiles = (config: UploadConfig) => {
	const multerFields = config.fields.map((f) => ({
		name: f.name,
		maxCount: f.maxCount || 1,
	}));

	const upload = multer({
		storage,
		fileFilter: imageFilter,
		limits: {
			fileSize: config.fileSizeLimit || 10 * 1024 * 1024,
		},
	});

	const multerMiddleware = upload.fields(multerFields);

	return (req: Request, res: Response, next: NextFunction) => {
		multerMiddleware(req, res, async (err: any) => {
			if (err) {
				res.status(400).json({ success: false, message: err.message });
				return;
			}

			const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
			if (!files) {
				next();
				return;
			}

			try {
				req.uploadedFiles = {};

				const uploadPromises = config.fields
					.filter((field) => files[field.name]?.length)
					.map(async (field) => {
						const file = files[field.name][0];
						const result = await uploadToCloudinary(file.buffer, {
							folder: field.folder,
							public_id: `${field.name}-${Date.now()}`,
						});
						req.uploadedFiles![field.name] = result.secure_url;
					});

				await Promise.all(uploadPromises);

				// Check required fields
				for (const field of config.fields) {
					if (field.required && !req.uploadedFiles[field.name]) {
						res.status(400).json({
							success: false,
							message: `${field.name} is required`,
						});
						return;
					}
				}

				next();
			} catch (error: any) {
				res.status(500).json({
					success: false,
					message: "Failed to upload files",
					error: error.message,
				});
			}
		});
	};
};

/**
 * CSV upload middleware (no Cloudinary, just multer parsing).
 * File available at req.file after this middleware.
 */
export const uploadCSV = () => {
	const upload = multer({
		storage,
		fileFilter: csvFilter,
		limits: {
			fileSize: 50 * 1024 * 1024,
			files: 1,
		},
	});

	return upload.single("file");
};
