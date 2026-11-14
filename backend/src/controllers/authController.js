import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createToken } from "../utils/token.js";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function publicUser(user) {
  // Returns account fields without the password hash.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
function validEmail(email) {
  // Checks the email address format.
  return (
    typeof email === "string" && email.length <= 254 && emailPattern.test(email)
  );
}
function validPassword(password) {
  // Checks password length and supported input.
  // bcrypt accepts at most 72 UTF-8 bytes, not necessarily 72 characters.
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}
export const register = asyncHandler(async (req, res) => {
  // Validates and creates a password-hashed account.
  const { name, email, password } = req.body || {};
  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 60
  ) {
    return res.status(400).json({
      message: "Name must contain 2 to 60 characters.",
    });
  }
  const cleanEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!validEmail(cleanEmail)) {
    return res.status(400).json({
      message: "Enter a valid email address.",
    });
  }
  if (!validPassword(password)) {
    return res.status(400).json({
      message:
        "Use at least 8 characters and at most 72 UTF-8 bytes for your password.",
    });
  }
  if (
    await User.exists({
      email: cleanEmail,
    })
  ) {
    return res.status(409).json({
      message: "An account with this email already exists.",
    });
  }
  const user = await User.create({
    name: name.trim(),
    email: cleanEmail,
    password,
  });
  res.status(201).json({
    token: createToken(user.id),
    user: publicUser(user),
  });
});
export const login = asyncHandler(async (req, res) => {
  // Checks credentials and returns a login token.
  const { email, password } = req.body || {};
  const cleanEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!validEmail(cleanEmail) || !validPassword(password)) {
    return res.status(400).json({
      message:
        "Enter a valid email and a password of at least 8 characters (maximum 72 bytes).",
    });
  }
  const user = await User.findOne({
    email: cleanEmail,
  }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({
      message: "Email or password is incorrect.",
    });
  }
  res.json({
    token: createToken(user.id),
    user: publicUser(user),
  });
});
export const getMe = asyncHandler(async (req, res) => {
  // Returns the authenticated account.
  res.json({
    user: publicUser(req.user),
  });
});
