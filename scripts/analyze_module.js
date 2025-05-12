const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {SimplePropertyRetriever} = require('./ffdir');
const v8 = require('v8')
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

fqn2overloads = {}
fqn2cb = {}
fqn2cfuncs = {}

cbs = new Set()

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
    console.log(`dir(): ${obj}`)
    return SimplePropertyRetriever.getOwnAndPrototypeEnumAndNonEnumProps(obj);
}

function resolve_gdb(addresses) {
    const tmp_dir = os.tmpdir();
    const addr_file = path.join(tmpDir, `addr_${randomUUID()}.json`);
    const res_file = path.join(tmpDir, `res_${randomUUID()}.json`);

	fs.writeFileSync(addr_file, JSON.stringify(cbs, null, 2));

	var cmd = `python3 resolve_syms.py -p ${pid} -i ${addr_file} -o ${res_file}`
	console.log(`CMD = ${cmd}`)

	var result = spawnSync('python3', ['-la'], { shell: true, encoding: 'utf-8' });
	const out = result.stdout
	console.log('OUT:')
	console.log(out)
	const err = result.stderr
	console.log('ERR:')
	console.log(err)

	const raw = fs.readFileSync(res_file, 'utf-8');
	result = JSON.parse(raw);
	console.log('RESULT:')
	console.log(result)
}

function analyze_single(mod_file, pkg_root) {
    obj = require(mod_file)
    jsname = get_mod_fqn(mod_file, pkg_root)
    console.log(`${mod_file}: jsname = ${jsname}`)
    recursive_inspect(obj, jsname)
    console.log(`FQN2CB = ${JSON.stringify(fqn2cb, null, 2)}`)
    console.log(`FQN2OVERLOADS = ${JSON.stringify(fqn2overloads, null, 2)}`)
    console.log(`CBS = (next line)`)
    console.log(cbs)
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
    // const dottedPath = noExt.split(path.sep).join('.');
    // return `${packageName}.${dottedPath}`;
    return `${packageName}/${noExt}`;
    // const relativePath = path.relative(packageRoot, fullPath);
    // const noExt = relativePath.replace(/\.node$/, ''); // remove .node
}

function check_bingo(obj, jsname) {
    res = v8.getcb(obj)
    if (res == 'NONE') {
        return
    } else {
        jres = JSON.parse(res)
        cb = jres['callback']
        overloads = jres['overloads']
        cbs.add(cb)
        console.log('CBS = (next line)')
        console.log(cbs)
        fqn2cb[jsname] = cb
        fqn2overloads[jsname] = overloads
    }
}

function recursive_inspect(obj, jsname) {
    pending = [[obj, jsname]]
    console.log(`pending = ${pending}`)
    seen = new Set()

    // XXX: BFS. Use queue: insert using .push(),
    //      get head using .shift
    while (pending.length > 0) {
        [obj, jsname] = pending.shift()
        console.log(`jsname = ${jsname}`)

        if (!(obj instanceof(Object))) {
            continue
        }
        if (typeof(obj) == 'function') {
            check_bingo(obj, jsname)
        }

        for (const k of dir(obj)) {
            console.log(`getattr(${jsname}, ${k})`)
            try {
              v = obj[k]
            } catch(error) {
              console.log(error)
              continue
            }
            if (typeof v == 'undefined' || !(v instanceof(Object))) {
                continue
            }

            ident = v8.jid(v)
            if (seen.has(ident)) {
                console.log('ALREADY SEEN')
                continue
            } else {
                seen.add(ident)
            }

            pending.push([v, jsname + '.' + k])
        }
        seen.add(v8.jid(obj))
    }
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
