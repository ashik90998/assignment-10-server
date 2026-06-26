const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const donationRequestsRoutes = require("./routes/donationRequests.routes");
const fundingRoutes = require("./routes/funding.routes");
const statsRoutes = require("./routes/stats.routes");

const app = express();
const port = process.env.PORT || 8000;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "SaveBlood API is successfully running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/donation-requests", donationRequestsRoutes);
app.use("/api/funding", fundingRoutes);
app.use("/api/stats", statsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "This Route is not founded" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`SaveBlood server Running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the MongoDB:", err);
    process.exit(1);
  });
