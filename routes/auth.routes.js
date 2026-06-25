const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return { ...rest, _id: user._id.toString() };
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, bloodGroup, district, upazila, avatar } = req.body;

    if (!name || !email || !password || !bloodGroup || !district || !upazila || !avatar) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    const db = getDB();
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "This Email already exist." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      name,
      email,
      password: hashedPassword,
      bloodGroup,
      district,
      upazila,
      avatar: avatar || "",
      role: "donor",
      status: "active",
      createdAt: new Date(),
    };

    const result = await users.insertOne(newUser);
    newUser._id = result.insertedId;

    const token = createToken(newUser);
    res.status(201).json({ token, user: sanitizeUser(newUser) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const db = getDB();
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.status === "blocked") {
      return res.status(403).json({ message: "Your account has been blocked." });
    }

    const token = createToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/me", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.user.id) });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json(sanitizeUser(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
