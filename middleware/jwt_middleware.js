const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");

async function jwtMiddleWare(req, res, next) {
  const { authorization } = req.headers;
  if (authorization == undefined)
    return res.status(401).json({
      status: "False",
      message: "Authorization token is required!",
    });
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_ACCESS_TOKEN, async (err, decode) => {
    if (err) {
      return res.status(401).json({
        status: "Failed",
        message: "Token is not valid",
      });
    } else {
      const user = await userModel.findOne({ username: decode.username });
      if (!user) {
        return res.json({
          status: "Failed",
          message: "User's not found",
        });
      }
      req.username = decode.username;
      next();
    }
  });
}

module.exports = { jwtMiddleWare };