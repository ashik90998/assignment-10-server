const express = require("express");
const { getDB } = require("../config/db");
const { verifyToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/admin", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const db = getDB();
    const users = db.collection("users");
    const requests = db.collection("donation_requests");
    const fundings = db.collection("fundings");

    const [totalUsers, totalDonors, totalVolunteers, totalRequests, pendingRequests, inProgressRequests, doneRequests, fundingTotal] =
      await Promise.all([
        users.countDocuments(),
        users.countDocuments({ role: "donor" }),
        users.countDocuments({ role: "volunteer" }),
        requests.countDocuments(),
        requests.countDocuments({ status: "pending" }),
        requests.countDocuments({ status: "inprogress" }),
        requests.countDocuments({ status: "done" }),
        fundings
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray(),
      ]);

    const now = new Date();
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await requests.countDocuments({
        createdAt: { $gte: date, $lt: nextDate },
      });
      daily.push({
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        count,
      });
    }

    const weekly = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const count = await requests.countDocuments({
        createdAt: { $gte: weekStart, $lt: weekEnd },
      });
      weekly.push({ label: `Week ${4 - i}`, count });
    }

    const monthly = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const count = await requests.countDocuments({
        createdAt: { $gte: monthStart, $lt: monthEnd },
      });
      monthly.push({
        label: monthStart.toLocaleDateString("en-US", { month: "short" }),
        count,
      });
    }

    res.json({
      totalUsers,
      totalDonors,
      totalVolunteers,
      totalRequests,
      pendingRequests,
      inProgressRequests,
      doneRequests,
      totalFunds: fundingTotal[0]?.total || 0,
      charts: { daily, weekly, monthly },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/volunteer", verifyToken, authorizeRoles("volunteer", "admin"), async (req, res) => {
  try {
    const db = getDB();
    const requests = db.collection("donation_requests");
    const fundings = db.collection("fundings");

    const [totalRequests, pendingRequests, inProgressRequests, doneRequests, fundingTotal] =
      await Promise.all([
        requests.countDocuments(),
        requests.countDocuments({ status: "pending" }),
        requests.countDocuments({ status: "inprogress" }),
        requests.countDocuments({ status: "done" }),
        fundings
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray(),
      ]);

    res.json({
      totalRequests,
      pendingRequests,
      inProgressRequests,
      doneRequests,
      totalFunds: fundingTotal[0]?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/donor", verifyToken, authorizeRoles("donor", "admin"), async (req, res) => {
  try {
    const db = getDB();
    const requests = db.collection("donation_requests");

    const [total, pending, inprogress, done] = await Promise.all([
      requests.countDocuments({ requesterId: req.user.id }),
      requests.countDocuments({ requesterId: req.user.id, status: "pending" }),
      requests.countDocuments({ requesterId: req.user.id, status: "inprogress" }),
      requests.countDocuments({ requesterId: req.user.id, status: "done" }),
    ]);

    res.json({ total, pending, inprogress, done });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
