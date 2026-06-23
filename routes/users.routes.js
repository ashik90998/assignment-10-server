const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { verifyToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return { ...rest, _id: user._id.toString() };
}

router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const role = req.query.role || "";
    const status = req.query.status || "";

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (role) filter.role = role;
    if (status) filter.status = status;

    const db = getDB();
    const users = db.collection("users");
    const total = await users.countDocuments(filter);
    const data = await users
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      data: data.map(sanitizeUser),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { bloodGroup, district, upazila, page = 1, limit = 12 } = req.query;
    if (!bloodGroup && !district && !upazila) {
      return res.json({ data: [], total: 0, page: 1, totalPages: 0 });
    }

    const filter = { role: "donor", status: "active" };
    if (bloodGroup) filter.bloodGroup = bloodGroup;
    if (district) filter.district = district;
    if (upazila) filter.upazila = upazila;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = getDB();
    const users = db.collection("users");
    const total = await users.countDocuments(filter);
    const data = await users
      .find(filter, { projection: { password: 0 } })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    res.json({
      data: data.map((u) => ({ ...u, _id: u._id.toString() })),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/role", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["donor", "volunteer", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role." });
    }

    const db = getDB();
    const result = await db.collection("users").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { role } },
      { returnDocument: "after" }
    );

    if (!result) return res.status(404).json({ message: "User not found." });
    res.json(sanitizeUser(result));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/status", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const db = getDB();
    const result = await db.collection("users").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { status } },
      { returnDocument: "after" }
    );

    if (!result) return res.status(404).json({ message: "User not found." });
    res.json(sanitizeUser(result));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const { name, bloodGroup, district, upazila, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (bloodGroup) updates.bloodGroup = bloodGroup;
    if (district) updates.district = district;
    if (upazila) updates.upazila = upazila;
    if (avatar !== undefined) updates.avatar = avatar;

    const db = getDB();
    const result = await db.collection("users").findOneAndUpdate(
      { _id: new ObjectId(req.user.id) },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result) return res.status(404).json({ message: "User not found." });
    res.json(sanitizeUser(result));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
