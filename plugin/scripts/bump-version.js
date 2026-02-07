const fs = require("fs");
const path = require("path");

const versionFile = path.resolve(__dirname, "../version.json");
const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
const [major, minor, patch] = data.version.split(".").map(Number);

let newVersion;
if (patch >= 9) {
  newVersion = `${major}.${minor + 1}.0`;
} else {
  newVersion = `${major}.${minor}.${patch + 1}`;
}

fs.writeFileSync(versionFile, JSON.stringify({ version: newVersion }, null, 2) + "\n");
console.log(`Version bumped: ${data.version} → ${newVersion}`);
