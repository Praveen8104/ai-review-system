require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.post("/github/webhook", async (req, res) => {
  const event = req.headers["x-github-event"];
  const action = req.body.action;

  if (event === "pull_request" && (action === "opened" || action === "synchronize")) {
    const prNumber = req.body.pull_request.number;
    const repoFullName = req.body.repository.full_name;

    console.log("================================");
    console.log("PR Triggered");
    console.log("Repo:", repoFullName);
    console.log("PR Number:", prNumber);
    console.log("Action:", action);
    console.log("Fetching PR diff...");
    console.log("================================");

    try {
      // 🔹 Step 1 — Fetch PR files from GitHub
      const githubResponse = await axios.get(
        `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files`,
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "User-Agent": "ai-reviewer",
          },
        }
      );

      const files = githubResponse.data;

      let combinedPatch = "";

      files.forEach((file) => {
        if (file.patch) {
          combinedPatch += `\nFile: ${file.filename}\n${file.patch}\n`;
        }
      });

      console.log("Sending patch to Gemini...");
      console.log("Using model:", GEMINI_MODEL);

      // 🔹 Step 2 — Send to Gemini (AI Studio v1beta)
      const geminiResponse = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [
            {
              parts: [
                {
                  text: `
You are a senior software mentor reviewing an intern's pull request.

Return ONLY valid JSON:
{
  "overall_score": 1-10,
  "bugs": [],
  "strengths": [],
  "weaknesses": [],
  "suggestions": [],
  "summary": ""
}

Pull Request Diff:
${combinedPatch}
`
                }
              ]
            }
          ]
        }
      );

      const aiText =
        geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text;

      console.log("================================");
      console.log("Gemini Review Result:");
      console.log(aiText);
      console.log("================================");

    } catch (err) {
      console.error("Gemini Error:");
      console.error(err.response?.data || err.message);
    }
  }

  res.status(200).send("OK");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});