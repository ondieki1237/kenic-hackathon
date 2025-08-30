
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
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject("Invalid JSON from Python: " + stdout);
        }
      }
    });
  });
}

app.get("/check/:domain", async (req, res) => {
  try {
    const result = await runPythonCommand(`check ${req.params.domain}`);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error });
  }
});

app.post("/create", async (req, res) => {
  try {
    const { domain, password } = req.body;
    const result = await runPythonCommand(`create_domain ${domain} ${password}`);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error });
  }
});

app.listen(3000, () => console.log("EPP API running on port 3000"));
