import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
      validate: {
        validator: (value) =>
          // Checks bcrypt's maximum password byte length.
          Buffer.byteLength(value, "utf8") <= 72,
        message: "Password must not exceed 72 UTF-8 bytes.",
      },
    },
  },
  {
    timestamps: true,
  },
);
userSchema.pre("save", async function hashPassword() {
  // Hashes changed passwords before saving the account.
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});
userSchema.methods.comparePassword = function comparePassword(candidate) {
  // Checks a password against its stored hash.
  return bcrypt.compare(candidate, this.password);
};
export default mongoose.model("User", userSchema);
