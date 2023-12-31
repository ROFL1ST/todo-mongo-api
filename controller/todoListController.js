const {
  TodoList,
  SubList,
  Attaches,
  Asign,
} = require("../models/todolistModel");
const { TodoModel } = require("../models/todoModels");
const { default: jwtDecode } = require("jwt-decode");
const { default: mongoose } = require("mongoose");
const cloudinary = require("cloudinary").v2;
const { RoomChat, Message } = require("../models/chatModel");
const crypto = require("crypto");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY_CLOUD,
  api_secret: process.env.API_SECRET_CLOUD,
});

class todoList {
  async getAllList(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const { status, priority } = req.query;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            $and: [{ "user.id_user": new ObjectId(id_user) }],
          },
        },
      ]);
      const list = todo.map((item) => item._id);
      const todoList = await TodoList.aggregate([
        {
          $match: {
            $and: [
              { id_todo: { $in: list.map((id) => new ObjectId(id)) } },
              {
                $and: [
                  status
                    ? {
                        status: { $regex: status, $options: "i" },
                      }
                    : {},
                  priority
                    ? {
                        priority: { $regex: priority, $options: "i" },
                      }
                    : {},
                ],
              },
            ],
          },
        },
      ]).exec();
      return res.status(200).json({
        status: "Success",
        data: todoList,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }
  async getList(req, res) {
    try {
      const ObjectId = mongoose.Types.ObjectId;
      const id = req.params.id;
      const todo = await TodoModel.findById(id);
      if (!todo) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo not found",
        });
      } else {
        const data = await TodoList.aggregate([
          { $match: { id_todo: new ObjectId(id) } },
          {
            $lookup: {
              from: "sublists",
              localField: "_id",
              foreignField: "id_todoList",
              as: "sublist",
            },
          },
          {
            $lookup: {
              from: "roomchats",
              localField: "_id",
              foreignField: "id_todoList",
              as: "chat",
            },
          },
          {
            $lookup: {
              from: "asign-lists",
              localField: "_id",
              foreignField: "id_todoList",
              as: "asigned",
            },
          },
        ]);
        return res.status(200).json({
          status: "Success",
          data: data,
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async getDetailList(req, res) {
    try {
      const ObjectId = mongoose.Types.ObjectId;
      const id = req.params.id;
      const data = await TodoList.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "id_user",
            foreignField: "_id",
            as: "users",
          },
        },

        { $match: { _id: new ObjectId(id) } },
        {
          $project: {
            id_todo: "$id_todo",
            name: "$name",
            status: "$status",
            priority: "$priority",
            date: "$date",
            "users._id": 1,
            "users.username": 1,
            "users.name": 1,
            "users.photo_profile": 1,
          },
        },
        {
          $lookup: {
            from: "attaches",
            localField: "_id",
            foreignField: "id_todoList",
            as: "attaches",
          },
        },
        {
          $lookup: {
            from: "sublists",
            localField: "_id",
            foreignField: "id_todoList",
            as: "sublists",
          },
        },
        {
          $lookup: {
            from: "asign-lists",
            localField: "_id",
            foreignField: "id_todoList",
            as: "asigned",
          },
        },
      ]);
      if (!data || data.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Data not found",
        });
      } else {
        return res.status(200).json({
          status: "Success",
          data: data,
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async postList(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.body.id_todo;
      const body = req.body;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            _id: new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      // return console.log(todo);
      if (todo.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo or user is not in this server",
        });
      } else {
        let listUser = todo[0].user.filter((i) => i.id_user == id_user);
        // return console.log();
        if (listUser[0].role == "member") {
          return res.status(401).json({
            status: "Failed",
            message: "You are not the admin of this todo",
          });
        }
        body.id_user = id_user;
        const newTodoList = await TodoList.create(body); // Notice the change here
        let roomCode = crypto.randomBytes(10).toString("hex");
        let dataRoom = {
          room_code: roomCode,
          id_todoList: newTodoList._id,
        };
        await RoomChat.create(dataRoom);
        console.log(newTodoList.id_todo);

        return res.status(200).json({
          status: "Success",
          data: newTodoList,
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async updateList(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;
      const body = req.body;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            "todolists._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      if (!todo || todo.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo or user is not in this server",
        });
      }
      let listUser = todo[0].user.filter((i) => i.id_user == id_user);
      if (listUser[0].role == "member") {
        return res.status(401).json({
          status: "Failed",
          message: "You are not the admin of this todo",
        });
      }
      await TodoList.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            name: body.name,
            status: body.status,
            priority: body.priority,
            start: body.start,
            end: body.end,
          },
        }
      );
      return res.status(200).json({
        status: "Success",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async deleteList(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            "todolists._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      if (!todo || todo.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo or user is not in this server",
        });
      }
      let listUser = todo[0].user.filter((i) => i.id_user == id_user);
      if (listUser[0].role == "member") {
        return res.status(401).json({
          status: "Failed",
          message: "You are not the admin of this todo",
        });
      }
      let check_chat = await RoomChat.findOne({
        id_todoList: id,
      });
      // console.log(check_chat);
      if (check_chat) {
        await RoomChat.findOneAndDelete({
          id_todoList: id,
        });
        await Message.deleteMany({
          room_code: RoomChat.room_code,
        });
      }
      let check_sub = await SubList.findOne({ id_todoList: new ObjectId(id) });
      if (check_sub) {
        await SubList.deleteMany({
          id_todoList: new ObjectId(id),
        });
      }
      let check_asigned = await Asign.findOne({
        id_todoList: new ObjectId(id),
      });
      if (check_asigned) {
        await Asign.deleteMany({ id_todoList: new ObjectId(id) });
      }
      const deleteTask = await TodoList.deleteOne({ _id: new ObjectId(id) });
      return res.status(200).json({
        status: "Success",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async postAttaches(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;
      const body = req.body;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            "todolists._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);

      if (todo.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo or user is not in this server",
        });
      } else {
        let listUser = todo[0].user.filter((i) => i.id_user == id_user);
        if (listUser[0].role == "member") {
          let check_asigned = await Asign.findOne({
            id_user: new ObjectId(id_user),
          });
          if (!check_asigned) {
            return res.status(401).json({
              status: "Failed",
              message: "You are not the admin of this todo",
            });
          }
        }
        body.id_user = id_user;
        body.id_todoList = id;
        if (req.file?.path != undefined) {
          const { secure_url, public_id } = await cloudinary.uploader.upload(
            req.file.path,
            {
              folder: "/todo/list",
              public_id: `${req.file.originalname.substring(
                0,
                req.file.originalname.length - 5
              )}-${crypto.randomInt(0, 100000)}`,
              resource_type: "auto",
              format: `${req.file.originalname.split(".")[1]}`,
            }
          );
          body.attach_url = secure_url;
          body.public_id = public_id;
          const attach = await Attaches.create(body);
          return res.status(200).json({
            status: "Success",
            message: "You have added attachment",
            data: attach,
          });
        }
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async getAttaches(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;
      const data = await Attaches.aggregate([
        {
          $match: { id_todoList: new ObjectId(id) },
        },
        {
          $lookup: {
            from: "users",
            localField: "id_user",
            foreignField: "_id",
            as: "users",
          },
        },
        {
          $project: {
            public_id: 0,
            "users.password": 0,
          },
        },
      ]);
      return res.status(200).json({
        status: "Success",
        data: data,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async deleteAttaches(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;

      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $lookup: {
            from: "attaches",
            localField: "todolists._id",
            foreignField: "id_todoList",
            as: "attaches",
          },
        },
        {
          $match: {
            "attaches._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      // console.log(todo);
      if (todo.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Attach or user is not in this server",
        });
      }
      let listUser = todo[0].user.filter((i) => i.id_user == id_user);
      if (listUser[0].role == "member") {
        let check_asigned = await Asign.findOne({
          id_user: new ObjectId(id_user),
        });
        if (!check_asigned) {
          return res.status(401).json({
            status: "Failed",
            message: "You are not the admin of this todo",
          });
        }
      }
      const data = await Attaches.findById(id);
      if (!data) {
        return res.status(404).json({
          status: "Failed",
          message: "Attach is not in this server",
        });
      }
      // return console.log(data);
      await cloudinary.uploader.destroy(data.public_id);
      await Attaches.deleteOne({
        _id: id,
      });
      return res.status(200).json({
        status: "Success",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async postSubList(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;
      const body = req.body;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            "todolists._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      if (!todo) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo or user is not in this server",
        });
      } else {
        let listUser = todo[0].user.filter((i) => i.id_user == id_user);
        if (listUser[0].role == "member") {
          let check_asigned = await Asign.findOne({
            id_user: new ObjectId(id_user),
          });
          if (!check_asigned) {
            return res.status(401).json({
              status: "Failed",
              message: "You are not the admin of this todo",
            });
          }
        }
        body.id_user = id_user;
        body.id_todoList = id;
        if (!body.name) {
          return res.status(401).json({
            status: "Failed",
            message: "Please enter the name of sublist",
          });
        }
        let newSub = await SubList.create(body);
        return res.status(200).json({
          status: "Success",
          data: newSub,
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async updateSubList(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;
      const body = req.body;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $lookup: {
            from: "sublists",
            localField: "todolists._id",
            foreignField: "id_todoList",
            as: "sublists",
          },
        },
        {
          $match: {
            "sublists._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      if (!todo || todo.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "sublist or user is not in this server",
        });
      }
      let listUser = todo[0].user.filter((i) => i.id_user == id_user);
      if (listUser[0].role == "member") {
        let check_asigned = await Asign.findOne({
          id_user: new ObjectId(id_user),
        });
        if (!check_asigned) {
          return res.status(401).json({
            status: "Failed",
            message: "You are not the admin of this todo",
          });
        }
      }

      await SubList.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            name: body.name,
            checked: body.checked,
          },
        }
      );

      return res.status(200).json({
        status: "Success",
        message: "You've updated the sublist",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async deleteSub(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const id = req.params.id;
      const todo = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $lookup: {
            from: "sublists",
            localField: "todolists._id",
            foreignField: "id_todoList",
            as: "sublists",
          },
        },
        {
          $match: {
            "sublists._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      if (!todo) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo or user is not in this server",
        });
      } else {
        let listUser = todo[0].user.filter((i) => i.id_user == id_user);
        if (listUser[0].role == "member") {
          let check_asigned = await Asign.findOne({
            id_user: new ObjectId(id_user),
          });
          if (!check_asigned) {
            return res.status(401).json({
              status: "Failed",
              message: "You are not the admin of this todo",
            });
          } else {
            next();
          }
        }
        await SubList.deleteOne({
          _id: new ObjectId(id),
        });
        return res.status(200).json({
          status: "Success",
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async insertAsign(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const { id } = req.params;
      const asignData = req.body;
      const data = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            "todolists._id": new ObjectId(id),
            "user.id_user": new ObjectId(id_user),
          },
        },
      ]);
      if (data.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo's not found",
        });
      }
      let check = data[0].user.filter((e) => e.id_user == id_user);
      // Check member can assign to himself only
      // if (check[0].role == "member") {
      //   return res.status(403).json({
      //     status: "Failed",
      //     message: `Only owner or admin can do that`,
      //   });
      // }
      if (
        check.length === 0 ||
        (check[0].role !== "admin" && check[0].role !== "owner")
      ) {
        // If the user is trying to assign someone else
        if (asignData.id_user !== id_user) {
          return res.status(403).json({
            status: "Failed",
            message: "You can only assign roles to yourself",
          });
        }
      }

      const userExist = data[0].user.filter((e) => e.id_user == id_user);
      if (userExist.length != 0) {
        // return console.log("HAi");
        let check_asigned = await Asign.findOne({
          id_user: new ObjectId(asignData.id_user),
        });
        if (check_asigned) {
          return res.status(403).json({
            status: "Failed",
            message: "User's already assigned",
          });
        }
        asignData.id_todoList = id;
        await Asign.create(asignData);
        return res.status(200).json({
          status: "Success",
          message: "Assigned successfully",
        });
      } else {
        return res.status(404).json({
          status: "Failed",
          message: "User's not found in this todo",
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }

  async kickAssign(req, res) {
    try {
      const headers = req.headers;
      const ObjectId = mongoose.Types.ObjectId;
      const id_user = jwtDecode(headers.authorization).id;
      const { id } = req.params;
      const { kick } = req.body;
      const data = await TodoModel.aggregate([
        {
          $lookup: {
            from: "todolists",
            localField: "_id",
            foreignField: "id_todo",
            as: "todolists",
          },
        },
        {
          $lookup: {
            from: "listusers",
            localField: "_id",
            foreignField: "id_todo",
            as: "user",
          },
        },
        {
          $match: {
            "todolists._id": new ObjectId(id),
            "user.id_user": { $exists: true }, // Check if "user" array exists
          },
        },
      ]);
      if (data.length == 0) {
        return res.status(404).json({
          status: "Failed",
          message: "Todo is not found",
        });
      }

      let check_asigned = await TodoList.aggregate([
        {
          $lookup: {
            from: "asign-lists",
            localField: "_id",
            foreignField: "id_todoList",
            as: "asigned",
          },
        },
        {
          $match: {
            $and: [
              { _id: new ObjectId(id) },
              { "asigned.id_user": new ObjectId(kick) },
            ],
          },
        },
      ]);
      // return console.log(check_asigned);
      if (check_asigned.length != 0) {
        return res.status(404).json({
          status: "Failed",
          message: "User's not here",
        });
      }
      let listUser = data[0].user.filter((i) => i.id_user == id_user);
      if (listUser[0].role !== "admin" && listUser[0].role !== "owner") {
        if (kick !== id_user) {
          return res.status(403).json({
            status: "Failed",
            message: "You are not the owner of this todo",
          });
        }
      }
      await Asign.findOneAndDelete({ id_user: new ObjectId(kick) });
      return res.status(200).json({
        status: "Success",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        status: "Failed",
        message: error,
      });
    }
  }
}

module.exports = new todoList();
