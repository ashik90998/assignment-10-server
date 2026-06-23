const express = require("express");

const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { verifyToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();
function formatRequest(doc) {
  return { ...doc, _id: doc._id.toString() };
}

router.get("/public", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;

    const db = getDB();
    const collection = db.collection("donation_requests");
    const filter = { status: "pending" };
    const total = await collection.countDocuments(filter);
    
    const data = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      data: data.map(formatRequest),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status || "";

    const db = getDB();
    const collection = db.collection("donation_requests");

    let filter = {};
    if (req.user.role === "donor") {
      filter.requesterId = req.user.id;
    }
    if (status && status !== "all") {
      filter.status = status;
    }

    const total = await collection.countDocuments(filter);
    const data = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      data: data.map(formatRequest),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:id", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const request = await db
      .collection("donation_requests")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!request) return res.status(404).json({ message: "Request not found." });
    res.json(formatRequest(request));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", verifyToken, authorizeRoles("donor", "volunteer", "admin"), async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.user.id) });

    if (user.status === "blocked") {
      return res.status(403).json({ message: "Blocked users cannot create donation requests." });
    }

    const {
      recipientName,
      district,
      upazila,
      hospitalName,
      fullAddress,
      bloodGroup,
      donationDate,
      donationTime,
      requestMessage,
    } = req.body;

    const newRequest = {
      requesterId: req.user.id,
      requesterName: user.name,
      requesterEmail: user.email,
      recipientName,
      district,
      upazila,
      hospitalName,
      fullAddress,
      bloodGroup,
      donationDate,
      donationTime,
      requestMessage,
      status: "pending",
      donorId: null,
      donorName: null,
      donorEmail: null,
      donorPhone: null,
      donorMessage: null,
      createdAt: new Date(),
    };

    const result = await db.collection("donation_requests").insertOne(newRequest);
    newRequest._id = result.insertedId;
    res.status(201).json(formatRequest(newRequest));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const existing = await db
      .collection("donation_requests")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!existing) return res.status(404).json({ message: "Request not found." });

    const isOwner = existing.requesterId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to update this request." });
    }

    if (existing.status !== "pending" && !isAdmin) {
      return res.status(400).json({ message: "Only pending requests can be edited." });
    }

    const allowed = [
      "recipientName",
      "district",
      "upazila",
      "hospitalName",
      "fullAddress",
      "bloodGroup",
      "donationDate",
      "donationTime",
      "requestMessage",
    ];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    const result = await db.collection("donation_requests").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: updates },
      { returnDocument: "after" }
    );

    res.json(formatRequest(result));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/status", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "inprogress", "done", "canceled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const db = getDB();
    const existing = await db
      .collection("donation_requests")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!existing) return res.status(404).json({ message: "Request not found." });

    const isOwner = existing.requesterId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const result = await db.collection("donation_requests").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { status } },
      { returnDocument: "after" }
    );

    res.json(formatRequest(result));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/:id/donate", verifyToken, async (req, res) => {
  try {
    const { donorName, donorEmail, donorPhone, donorMessage } = req.body;
    const db = getDB();
    const existing = await db
      .collection("donation_requests")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!existing) return res.status(404).json({ message: "Request not found." });
    if (existing.status !== "pending") {
      return res.status(400).json({ message: "This request is no longer pending." });
    }

    const user = await db.collection("users").findOne({ _id: new ObjectId(req.user.id) });

    const result = await db.collection("donation_requests").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: "inprogress",
          donorId: req.user.id,
          donorName: donorName || user.name,
          donorEmail: donorEmail || user.email,
          donorPhone: donorPhone || "",
          donorMessage: donorMessage || "",
        },
      },
      { returnDocument: "after" }
    );

    res.json(formatRequest(result));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const existing = await db
      .collection("donation_requests")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!existing) return res.status(404).json({ message: "Request not found." });

    const isOwner = existing.requesterId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorized." });
    }

    await db.collection("donation_requests").deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Request deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
