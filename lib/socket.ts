import { Server } from "socket.io";
import http from "http";
import express, { Application } from "express";
import { config } from "../config/config";

const app: Application = express();
const server = http.createServer(app);

const io = new Server(server, {
	cors: {
		origin: config.cors.origins,
		credentials: config.cors.credentials,
	},
});

export function getReceiverSocketId(userId: string) {
	return userSocketMap[userId];
}

const userSocketMap: { [key: string]: string } = {};

io.on("connection", (socket) => {
	console.log("A user connected : ", socket.id);

	const userId = socket.handshake.query.userId as string;
	if (userId) userSocketMap[userId] = socket.id;

	socket.on("send_message", (data) => {
		// Validate data exists and has message property
		if (!data || typeof data !== "object" || !data.message) {
			console.error("Invalid data received for send_message:", data);
			return;
		}

		const { message } = data;

		// Additional validation for message object
		if (typeof message !== "object" || !message.receiverId) {
			console.error("Invalid message object:", message);
			return;
		}

		const currentTime = new Date().toLocaleString("en-US", {
			timeZone: "Asia/Manila",
		});

		message.sentAt = currentTime;

		const receiverSocketId = userSocketMap[message.receiverId];
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("newMessage", message);
		} else {
			console.log(`Receiver with ID ${message.receiverId} not found.`);
		}
	});

	socket.on("disconnect", () => {
		console.log("A user disconnected", socket.id);

		if (userId) {
			delete userSocketMap[userId];
			io.emit("getOnlineUsers", Object.keys(userSocketMap));
		}
	});
});

export { io, app, server };
