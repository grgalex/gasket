const semver = require('semver');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
let pkg, constraint;

for (let i = 0; i < args.length; i++) {
+--  7 lines: if (args[i] === '-p' && args[i+1]) {------------------------------------------------------------------------------------------------------------
}

if (!pkg || !constraint) {
+--  2 lines: console.error('Usage: node script.js -p <package> -s <constraint>');----------------------------------------------------------------------------
}

// Fetch all versions
const versionsJson = execSync(`npm view ${pkg} versions --json`).toString();
const versions = JSON.parse(versionsJson);

// Filter compatible versions
const compatibleVersions = versions.filter(version => semver.satisfies(version, constraint));

console.log(JSON.stringify(compatibleVersions));
