const yargs = require('yargs');
const fs = require('fs');
const path = require('path');

result = { 'modules': [],
           'jump_libs': [],
           'bridges': [],
}

function parse_args() {
    return yargs
      .option('root', {
        alias: 'r',
        type: 'string',
        description: 'Package root',
        demandOption: true
      })
      .option('age', {
        alias: 'a',
        type: 'number',
        description: 'Your age'
      })
      .help()
      .argv;
}

function dir(obj) {
  const keys = new Set();

  while (obj && obj !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(obj)) {
      keys.add(key);
    }
    // for (const sym of Object.getOwnPropertySymbols(obj)) {
    //   keys.add(sym);
    // }
    obj = Object.getPrototypeOf(obj);
  }

  return [...keys].sort();
}

function recursive_inspect(obj) {
}


function analyze_single(mod_file) {
  obj = require(mod_file)
  recursive_inspect(obj)
}

function locate_so_modules(packagePath) {
  const soFiles = [];

  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath); // Recursive call for directories
      } else if (file.endsWith('.node')) {
        soFiles.push(path.resolve(fullPath)); // Add .so files to the list
      }
    });
  }

  walkDir(packagePath);
  return soFiles;
}

function main() {
  args = parse_args();

  console.log(`Package root = ${args.root}`)

  so_files = locate_so_modules(args.root)
  console.log(`Native extension files = ${so_files}`)


  for (const so_file of so_files) {
    analyze_single(so_file);
  }
}

main()
