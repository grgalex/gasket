const PackageDependents = require("package-dependents");

// Get is-there's dependents
PackageDependents("nan").then(packages => {
    packages.forEach(c => {
        console.log(c.name + (c.author && c.author.name ? " by " + c.author.name : ""));
    })
})
