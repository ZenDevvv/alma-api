import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from "cloudinary";
import { Readable } from "stream";

interface CloudinaryUploadOptions extends UploadApiOptions {
	folder?: string;
	public_id?: string;
	transformation?: any;
}

const uploadToCloudinary = (
	buffer: Buffer,
	options: CloudinaryUploadOptions = {},
): Promise<UploadApiResponse> => {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				folder: options.folder || "uploads",
				public_id: options.public_id,
				transformation: options.transformation,
				resource_type: "auto",
				...options,
			},
			(error, result) => {
				if (error) {
					reject(error);
				} else {
					resolve(result!);
				}
			},
		);

		// Convert buffer to stream and pipe to Cloudinary
		const readable = Readable.from(buffer);
		readable.pipe(uploadStream);
	});
};

export const deleteFromCloudinary = async (publicId: string): Promise<any> => {
	try {
		const result = await cloudinary.uploader.destroy(publicId);
		return result;
	} catch (error: any) {
		throw new Error(`Failed to delete from Cloudinary: ${error.message}`);
	}
};

// Helper function to generate optimized URL
export const getOptimizedUrl = (publicId: string, options: any = {}): string => {
	return cloudinary.url(publicId, {
		fetch_format: "auto",
		quality: "auto",
		...options,
	});
};

export const getTransformedUrl = (publicId: string, transformations: any = {}): string => {
	return cloudinary.url(publicId, transformations);
};

export default uploadToCloudinary;
