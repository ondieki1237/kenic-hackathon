// epp.js
import express from "express";
import { exec } from "child_process";

const app = express();
app.use(express.json());

function runPythonCommand(args) {
  return new Promise((resolve, reject) => {
    exec(`python3 epp_client.py ${args}`, (err, stdout, stderr) => {
      if (err) {
        reject(stderr || err.message);
      } else {
        resolve(stdout);
      }
    });
  });
}

app.get("/check/:domain", async (req, res) => {
  try {
    const { domain } = req.params;
    const output = await runPythonCommand(`check ${domain}`);
    res.json({ success: true, output });
  } catch (error) {
    res.status(500).json({ success: false, error });
  }
});

app.post("/create", async (req, res) => {
  try {
    const { domain, password } = req.body;
    if (!domain || !password) {
      return res.status(400).json({ error: "Domain and password are required" });
    }
    const output = await runPythonCommand(`create_domain ${domain} ${password}`);
    res.json({ success: true, output });
  } catch (error) {
    res.status(500).json({ success: false, error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`EPP API server running on port ${PORT}`);
});
