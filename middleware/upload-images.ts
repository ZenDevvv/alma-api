import { Request, Response, NextFunction } from "express";
import { UploadApiResponse, v2 as cloudinary } from "cloudinary";
import upload from "../config/mutler.config";
import "../config/cloudinary.config"; // Import cloudinary config
import { Readable } from "stream";

interface CloudinaryOptions {
	public_id?: string;
	folder?: string;
	transformation?: any;
}

interface CloudinaryResult {
	public_id: string;
	secure_url: string;
	url: string;
	format: string;
	width: number;
	height: number;
	bytes: number;
	created_at: string;
}

declare global {
	namespace Express {
		interface Request {
			cloudinaryResult?: CloudinaryResult;
			cloudinaryResults?: CloudinaryResult[];
		}
	}
}

// Upload to Cloudinary function
const uploadToCloudinary = async (
	buffer: Buffer,
	options: CloudinaryOptions,
): Promise<UploadApiResponse> => {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				public_id: options.public_id,
				folder: options.folder,
				transformation: options.transformation,
				resource_type: "auto",
			},
			(error, result) => {
				if (error) {
					reject(error);
				} else if (result) {
					resolve(result);
				} else {
					reject(new Error("Upload failed with no result"));
				}
			},
		);

		// Convert buffer to stream and pipe to Cloudinary
		const bufferStream = Readable.from(buffer);
		bufferStream.pipe(uploadStream);
	});
};

// Middleware for single file upload
export const uploadSingle = (fieldName: string, options: CloudinaryOptions = {}) => {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		upload.single(fieldName)(req, res, async (err: any) => {
			if (err) {
				res.status(400).json({
					error: err.message,
				});
				return;
			}

			if (!req.file) {
				res.status(400).json({
					error: "No file uploaded",
				});
				return;
			}

			try {
				const result = await uploadToCloudinary(req.file.buffer, {
					public_id:
						options.public_id || `${Date.now()}-${req.file.originalname.split(".")[0]}`,
					folder: options.folder,
					transformation: options.transformation,
				});

				req.cloudinaryResult = {
					public_id: result.public_id,
					secure_url: result.secure_url,
					url: result.url,
					format: result.format,
					width: result.width,
					height: result.height,
					bytes: result.bytes,
					created_at: result.created_at,
				};

				next();
			} catch (error: any) {
				res.status(500).json({
					error: "Failed to upload to Cloudinary",
					details: error.message,
				});
			}
		});
	};
};

// Middleware for multiple files upload
export const uploadMultiple = (
	fieldName: string,
	maxCount: number = 10,
	options: CloudinaryOptions = {},
	isRequired: boolean = false,
) => {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		console.log("Upload multiple middleware called");

		upload.array(fieldName, maxCount)(req, res, async (err: any) => {
			if (err) {
				res.status(400).json({
					error: err.message,
				});
				return;
			}

			if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
				if (isRequired) {
					res.status(400).json({
						error: "No files uploaded",
					});
					return;
				}
				// If files are not required and none are uploaded, just continue
				req.cloudinaryResults = [];
				next();
				return;
			}

			try {
				const uploadPromises = req.files.map((file: Express.Multer.File, index: number) =>
					uploadToCloudinary(file.buffer, {
						public_id: options.public_id
							? `${options.public_id}-${index}`
							: `${Date.now()}-${index}-${file.originalname.split(".")[0]}`,
						folder: options.folder,
						transformation: options.transformation,
					}),
				);

				const results = await Promise.all(uploadPromises);

				req.cloudinaryResults = results.map((result) => ({
					public_id: result.public_id,
					secure_url: result.secure_url,
					url: result.url,
					format: result.format,
					width: result.width,
					height: result.height,
					bytes: result.bytes,
					created_at: result.created_at,
				}));

				next();
			} catch (error: any) {
				res.status(500).json({
					error: "Failed to upload to Cloudinary",
					details: error.message,
				});
			}
		});
	};
};
