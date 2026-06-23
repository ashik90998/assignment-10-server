const express = require("express");
const Stripe = require("stripe");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

router.get("/", verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const db = getDB();
    const collection = db.collection("fundings");
    const total = await collection.countDocuments();
    const data = await collection
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalAmount = await collection
      .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
      .toArray();

    res.json({
      data: data.map((f) => ({ ...f, _id: f._id.toString() })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      totalFunds: totalAmount[0]?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/total", verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const result = await db
      .collection("fundings")
      .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
      .toArray();

    res.json({ totalFunds: result[0]?.total || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/create-payment-intent", verifyToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: "Stripe is not configured." });
    }

    const { amount } = req.body;
    if (!amount || amount < 1) {
      return res.status(400).json({ message: "Valid amount is required." });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      metadata: { userId: req.user.id },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/confirm", verifyToken, async (req, res) => {
  try {
    const { amount, paymentIntentId } = req.body;
    const db = getDB();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.user.id) });

    const funding = {
      userId: req.user.id,
      userName: user.name,
      userEmail: user.email,
      amount: parseFloat(amount),
      paymentIntentId,
      createdAt: new Date(),
    };

    const result = await db.collection("fundings").insertOne(funding);
    funding._id = result.insertedId;
    res.status(201).json({ ...funding, _id: funding._id.toString() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
