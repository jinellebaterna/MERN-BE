const express = require("express");
const https = require("https");
const router = express.Router();

const CSV_URL =
  "https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-tidy.csv";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let visaCache = null;
let cacheTime = 0;

const normalize = (raw) => {
  const r = raw.trim().toLowerCase();
  if (r === "-1") return "NA";
  if (r === "visa required" || r === "vr") return "VR";
  if (r === "visa on arrival" || r === "voa") return "VOA";
  if (r === "e-visa" || r === "evisa" || r === "eta") return "ETA";
  if (r === "free" || r === "visa free" || r === "vf") return "VF";
  const n = Number(r);
  if (!isNaN(n) && n > 0) return String(n); // visa-free days
  return raw.trim();
};

const loadVisaData = () =>
  new Promise((resolve, reject) => {
    if (visaCache && Date.now() - cacheTime < CACHE_TTL) {
      return resolve(visaCache);
    }
    https
      .get(CSV_URL, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`CSV fetch failed: ${res.statusCode}`));
        }
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          const map = {};
          const lines = raw.trim().split("\n");
          // skip header row
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(",");
            if (parts.length < 3) continue;
            const passport = parts[0].trim().toUpperCase();
            const dest = parts[1].trim().toUpperCase();
            const req = parts.slice(2).join(","); // handle commas in value
            if (!map[passport]) map[passport] = {};
            map[passport][dest] = normalize(req);
          }
          visaCache = map;
          cacheTime = Date.now();
          resolve(map);
        });
      })
      .on("error", reject);
  });

// Debug: see raw parsed keys + sample entries
router.get("/debug", async (req, res) => {
  try {
    const data = await loadVisaData();
    const passportKeys = Object.keys(data).slice(0, 5);
    const sample = {};
    passportKeys.forEach((k) => {
      sample[k] = Object.entries(data[k]).slice(0, 3);
    });
    res.json({ totalPassports: Object.keys(data).length, sample });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

router.get("/:passportName/:destName", async (req, res) => {
  const passport = decodeURIComponent(req.params.passportName).toUpperCase().trim();
  const dest = decodeURIComponent(req.params.destName).toUpperCase().trim();

  if (passport === dest) {
    return res.json({ requirement: "citizen" });
  }

  try {
    const data = await loadVisaData();
    const requirement = data[passport]?.[dest] ?? null;
    res.json({ requirement });
  } catch (err) {
    console.error("[visa] load error:", err.message);
    res.status(502).json({ message: "Could not load visa data." });
  }
});

module.exports = router;
