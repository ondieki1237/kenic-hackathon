import express from "express";
import cors from "cors";   // <-- import cors
import { execFile } from "child_process";

const app = express();
app.use(express.json());

// Enable CORS for frontend localhost:3001
app.use(cors({
  origin: "http://localhost:3001", // frontend URL
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

app.get("/check/:domain", async (req,res)=> {
  try { res.json(await runPython(["check", req.params.domain])); }
  catch(e){ res.status(500).json({error:e}); }
});

app.post("/create", async (req,res)=>{
  const {domain, contact} = req.body;
  if(!domain||!contact) return res.status(400).json({error:"domain & contact required"});
  try{ res.json(await runPython(["create", domain, contact])); }
  catch(e){ res.status(500).json({error:e}); }
});

app.delete("/delete/:domain", async (req,res)=>{
  try{ res.json(await runPython(["delete", req.params.domain])); }
  catch(e){ res.status(500).json({error:e}); }
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
        const created = await runPython([
          "domain_create",
          domain,
          "1",
          contact,
          contact,
          contact,
          "secret",
          "-",
        ]);
        results.push({ domain, prefix, extension: ext, status: "created", info: created });
      }
      // else: do not include domains that already exist or errored
    } catch (err) {
      console.error(`[BULK-CREATE] Error checking domain: ${domain}, extension: ${ext}, error:`, err);
      // skip errors (do not include in results)
    }
  }

  res.json({ keyword, type: type || "all", results });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=>console.log(`EPP API running on port ${PORT}`));
