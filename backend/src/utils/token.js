import jwt from "jsonwebtoken";
export function createToken(userId) {
  // Creates a signed account login token.
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(userId),
    algorithm: "HS256",
    expiresIn: "7d",
  });
}
