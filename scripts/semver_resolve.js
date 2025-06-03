const semver = require('semver');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
let pkg, constraint;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' && args[i+1]) {
        pkg = args[i+1];
        i++;
    } else if (args[i] === '-s' && args[i+1]) {
        constraint = args[i+1];
        i++;
    }
}

if (!pkg || !constraint) {
    console.error('Usage: node script.js -p <package> -s <constraint>');
    process.exit(1);
}

// Fetch all versions
const versionsJson = execSync(`npm view ${pkg} versions --json`).toString();
const versions = JSON.parse(versionsJson);

// Filter compatible versions
const compatibleVersions = versions.filter(version => semver.satisfies(version, constraint));
console.log(JSON.stringify(compatibleVersions));
