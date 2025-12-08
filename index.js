require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const {
  createSocketServer,
  emitTodoListUpdate,
  emitNotifUpdate,
} = require("./socket");
const admin = require("firebase-admin");
const serviceAccount = require("./service/todo-da3ef-firebase-adminsdk-ynx4w-86c0938daf.json");
const cors = require("cors");
const router = require("./routes/routes");
const app = express();
const { createServer } = require("http");
const morgan = require("morgan");
const { TodoList } = require("./models/todolistModel");
var useragent = require("express-useragent");
const { Notifications } = require("./models/userModel");
const server = createServer(app);
const port = process.env.PORT || 9000;
const uri = process.env.DB_DEV;
const dbName = process.env.DB_DATABASE;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
app.use(useragent.express());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api", router);
const io = createSocketServer(server);

mongoose
  .connect(uri)
  .then(() => {
    console.log("Connect");
  })
  .catch((err) => {
    console.log(err);
  });
const connection = mongoose.connection;

connection.once("open", () => {
  // todo list
  const watchAllList = TodoList.watch();
  watchAllList.on("change", emitTodoListUpdate);

  // notification
  const watchNotif = Notifications.watch();
  watchNotif.on("change", async (change) => {
    const ObjectId = mongoose.Types.ObjectId;
    switch (change.operationType) {
      case "insert":
        const newNotif = await Notifications.aggregate([
          { $match: { _id: new ObjectId(change.documentKey._id) } },
          {
            $lookup: {
              from: "users",
              localField: "from",
              foreignField: "_id",
              as: "userDetails",
            },
          },
          {
            $unwind: "$userDetails",
          },
          {
            $addFields: {
              userDetails: 0,
              username: "$userDetails.username",
              photo_profile: "$userDetails.photo_profile",
              default_color: "$userDetails.default_color",
            },
          },
        ]);
        const titleMapping = {
          message: "New Message Arrived!",
          request: "You've got a Request!",
          invitation: "You've been Invited!",
          response: "You've received a Response!",
        };

        const notificationType = newNotif[0].type;
        const customTitle =
          titleMapping[notificationType] || "Something's Happening!";
        const payload = {
          notification: {
            title: customTitle,
            body: newNotif[0].title,
          },
          data: {
            _id: newNotif[0]._id.toString(),
            senderId: newNotif[0].from.toString(),
            status: newNotif[0].status,
            id_content: newNotif[0].id_content.toString(),
            type: newNotif[0].type, // Add the 'type' property
            id_user: newNotif[0].id_user.toString(), // Add the 'id_user' property (convert to string if necessary)
            title: customTitle,
            body: newNotif[0].title,
            createdAt: newNotif[0].createdAt.toString(),
            updatedAt: newNotif[0].updatedAt.toString(),
          },
        };
        try {
          await admin.messaging().sendToTopic("notif", payload);
          console.log("FCM notification sent successfully");
        } catch (error) {
          console.error("Error sending FCM notification:", error);
        }
        break;
    }
  });
});
// app.listen(port, () => {
//   console.log(`Server Berjalan di port ${port} Berhasil`);
// });

server.listen(port);
