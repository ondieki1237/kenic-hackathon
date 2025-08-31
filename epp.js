import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Domain schema
const domainSchema = new mongoose.Schema({
  domain: { type: String, unique: true }, // <-- updated to be unique
  prefix: String,
  extension: String,
  contact: String,
  user: String,
  createdAt: { type: Date, default: Date.now }
});
const Domain = mongoose.model("Domain", domainSchema);

// Enable CORS for frontend localhost:3000 and localhost:3001
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001"], // allow both ports
  methods: ["GET", "POST", "DELETE"],
  credentials: true,
}));

// Safe Python runner with logging
function runPython(args) {
  return new Promise((resolve, reject) => {
    console.log(`[${new Date().toISOString()}] Calling Python with args:`, args);
    execFile("python3", ["epp_client.py", ...args], { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Python error:`, stderr || err.message);
        return reject(stderr || err.message);
      }
      try {
        const result = JSON.parse(stdout);
        console.log(`[${new Date().toISOString()}] Python response:`, result);
        resolve(result);
      } catch {
        console.error(`[${new Date().toISOString()}] Invalid JSON from Python:`, stdout);
        reject("Invalid JSON: " + stdout);
      }
    });
  });
}

// New endpoint to check MongoDB connection status
app.get("/mongodb-status", async (req, res) => {
  try {
    // Check MongoDB connection status (1 = connected)
    const isConnected = mongoose.connection.readyState === 1;
    res.json({ connected: isConnected });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] MongoDB status check error:`, err.message);
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.get("/check/:domain", async (req, res) => {
  try { res.json(await runPython(["check", req.params.domain])); }
  catch (e) { res.status(500).json({ error: e }); }
});

app.post("/create", async (req, res) => {
  const { domain, contact } = req.body;
  if (!domain || !contact) return res.status(400).json({ error: "domain & contact required" });
  try { res.json(await runPython(["create", domain, contact])); }
  catch (e) { res.status(500).json({ error: e }); }
});

app.delete("/delete/:domain", async (req, res) => {
  try { res.json(await runPython(["delete", req.params.domain])); }
  catch (e) { res.status(500).json({ error: e }); }
});

// Manual API to save a domain to the database
app.post("/save-domain", async (req, res) => {
  const { domain, prefix, extension, contact, user } = req.body;
  if (!domain || !prefix || !extension || !contact || !user)
    return res.status(400).json({ error: "domain, prefix, extension, contact, and user required" });

  try {
    const saved = await Domain.create({ domain, prefix, extension, contact, user });
    res.json({ success: true, domain: saved });
  } catch (err) {
    res.status(500).json({ error: "Failed to save domain", details: err.message });
  }
});

// Bulk create domains endpoint (with extensions)
app.post("/bulk-create", async (req, res) => {
  const { keyword, contact, extensions, type } = req.body;

  if (!keyword || !contact || !extensions?.length)
    return res.status(400).json({ error: "keyword, contact & extensions required" });

  // Prefix groups
  const prefixGroups = {
    simple: ["my", "the", "best", "top", "go"],
    professional: ["pro", "hub", "shop", "online", "global"],
    tech: ["app", "digital", "cloud", "tech", "smart"],
    fun: ["go", "wow", "try", "hey", "i"],
    short: ["x", "e", "i", "k"]
  };

  // Default to all if type not provided or invalid
  let prefixes = [];
  if (type && prefixGroups[type]) {
    prefixes = prefixGroups[type];
  } else {
    // Use all unique prefixes if no type specified
    prefixes = Array.from(new Set(Object.values(prefixGroups).flat()));
  }

  // Generate all possible prefix-extension pairs
  const allPairs = [];
  for (const prefix of prefixes) {
    for (const ext of extensions) {
      allPairs.push({ prefix, ext });
    }
  }
  // Shuffle and pick 3 or 4 pairs
  const shuffledPairs = allPairs.sort(() => 0.5 - Math.random());
  const pickCount = Math.min(4, Math.max(3, shuffledPairs.length > 1 ? Math.floor(Math.random() * 2) + 3 : 1));
  const pickedPairs = shuffledPairs.slice(0, pickCount);

  const results = [];
  const seen = new Set();

  for (const { prefix, ext } of pickedPairs) {
    const domain = `${prefix}${keyword}${ext}`;
    if (seen.has(domain)) continue; // skip duplicates
    seen.add(domain);
    try {
      const check = await runPython(["check", domain]);
      console.log(`[BULK-CREATE] Checked domain: ${domain}, extension: ${ext}, result:`, check);
      if (check.data && check.data.available === "1") {
        results.push({ domain, prefix, extension: ext, status: "available", info: check });
      }
      // else: do not include domains that already exist or errored
    } catch (err) {
      console.error(`[BULK-CREATE] Error checking domain: ${domain}, extension: ${ext}, error:`, err);
      // skip errors (do not include in results)
    }
  }

  res.json({ keyword, type: type || "all", results });
});

app.get("/user-domains/:user", async (req, res) => {
  try {
    const domains = await Domain.find({ user: req.params.user });
    res.json({ user: req.params.user, domains });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch domains", details: err.message });
  }
});

app.get("/my-domains", async (req, res) => {
  // Example: get user email from header (replace with real auth in production)
  const userEmail = req.headers["x-user-email"];
  if (!userEmail) return res.status(401).json({ error: "User email required in x-user-email header" });
  try {
    const domains = await Domain.find({ user: userEmail });
    res.json({ user: userEmail, domains });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch domains", details: err.message });
  }
});

const paymentSchema = new mongoose.Schema({
  domain: String,
  amount: Number,
  user: String,
  paidAt: { type: Date, default: Date.now }
});
const Payment = mongoose.model("Payment", paymentSchema);

// Pay API
app.post("/pay", async (req, res) => {
  const { domain, amount, user } = req.body;
  if (!domain || !amount || !user)
    return res.status(400).json({ error: "domain, amount, and user (email) required" });

  try {
    const payment = await Payment.create({ domain, amount, user });
    res.json({ success: true, payment });
  } catch (err) {
    res.status(500).json({ error: "Failed to save payment", details: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`EPP API running on port ${PORT}`));