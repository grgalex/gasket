const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const {SimplePropertyRetriever} = require('./ffdir');


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

/*
 * Deduplicate file paths by basename,
 * prefer real files that do not contain 'build' or 'tmp'.
 */
function deduplicate_paths(paths) {
  const grouped = new Map(); // basename → list of paths

  for (const p of paths) {
    const base = path.basename(p);
    if (!grouped.has(base)) {
      grouped.set(base, []);
    }
    grouped.get(base).push(p);
  }

  const result = [];

  for (const [, pathList] of grouped) {
    // Prefer non-build/tmp paths that exist
    const preferred = pathList.find(
      p => !p.includes('build') && !p.includes('tmp') && fs.existsSync(p)
    );

    // If not found, fallback to any existing file
    const fallback = pathList.find(p => fs.existsSync(p));

    if (preferred) {
      result.push(path.resolve(preferred));
    } else if (fallback) {
      result.push(path.resolve(fallback));
    }
  }

  return result;
}

function dir(obj) {
  return SimplePropertyRetriever.getOwnAndPrototypeEnumAndNonEnumProps(obj);
}

function recursive_inspect(obj, jsname) {
  return;
}

function analyze_single(mod_file, pkg_root) {
  obj = require(mod_file)
  jsname = get_mod_fqn(mod_file, pkg_root)
  console.log(`${mod_file}: jsname = ${jsname}`)
  // recursive_inspect(obj)
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

function get_mod_fqn(fullPath, packageRoot) {
  const packageName = path.basename(packageRoot);
  const relativePath = path.relative(packageRoot, fullPath);
  const noExt = relativePath.replace(/\.[^/.]+$/, ''); // strip extension
  const dottedPath = noExt.split(path.sep).join('.');
  return `${packageName}.${dottedPath}`;
  // const relativePath = path.relative(packageRoot, fullPath);
  // const noExt = relativePath.replace(/\.node$/, ''); // remove .node
  // const dotted = noExt.split(path.sep).join('.');    // replace / or \ with .
  // return dotted;
}

function main() {
  args = parse_args();

  console.log(`Package root = ${args.root}`)

  so_files = locate_so_modules(args.root)
  so_files = deduplicate_paths(so_files)
  console.log(`Native extension files :\n${so_files.join('\n')}`)


  for (const so_file of so_files) {
    analyze_single(so_file, args.root);
  }
}

main()
