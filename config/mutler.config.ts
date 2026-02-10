import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({
	storage,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB limit
	},
	fileFilter: (req, file, cb) => {
		// Accept images only
		if (!file.mimetype.startsWith("image/")) {
			return cb(null, false);
		}
		cb(null, true);
	},
});

export default upload;
