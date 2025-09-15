#!/usr/bin/env node

const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {SimplePropertyRetriever} = require('./ffdir');
const v8 = require('v8')
const { execSync, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

RESOLVE_SCRIPT_PATH = '/home/george.alexopoulos/jsxray/prv-jsxray/scripts/resolve_syms.py'

objects_examined = 0
callable_objects = 0
foreign_callable_objects = 0

cur_file = 'none'

fqn2failed = {}
fqn2mod = {}
fqn2obj = {}

foreign_ids = new Set()

fqn2idx = {}
fqn2wasminstance = {}
wasminstance2jsnames = {}

wasm_file_idx2jsnames = {}
wasm_file_idx2cfunc = {}
wasm_file_jsnames = {}
wasmobject2jsnames = {}

fqn2type = {}

addr2sym = {}

cbs_set = new Set()
cbs = []

final_result = {
    'objects_examined': 0,
    'callable_objects': 0,
    'foreign_callable_objects': 0,
    'duration_sec': 0,
    'count': 0,
    'modules': [],
    'jump_libs': [],
    'bridges': [],
}

function sleepSync(seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end);
}

function parse_args() {
    return yargs
      .option('root', {
        alias: 'r',
        type: 'string',
        description: 'Package root',
        demandOption: true
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        description: 'output file',
      })
      .help()
      .argv;
}


function parseWasmFuncExports(filePath) {
    // 1) run wasm-objdump synchronously
    const output = execSync(`wasm-objdump -xj Export ${filePath}`, {
      encoding: "utf8",
    });

    // 2) regex parse
    const re = /^\s*-\s*func\[(\d+)\]\s*<([^>]*)>\s*->\s*"([^"]*)"\s*$/;

    const idx2cfunc = {};
    const idx2jsnames = {};
	const allJsNames = [];

    for (const line of output.split(/\r?\n/)) {
      const m = re.exec(line);
      if (!m) continue;

      const index = Number(m[1]);
      const internalName = m[2];
      const exportName = m[3];

      if (!(index in idx2cfunc)) {
        idx2cfunc[index] = internalName;
      }
      (idx2jsnames[index] ??= []).push(exportName);
	  allJsNames.push(exportName);
    }

    return { idx2cfunc, idx2jsnames, allJsNames };
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
        p => !p.includes('darwin') && !p.includes('build') && !p.includes('tmp') && fs.existsSync(p)
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
    // console.log(`dir(): ${obj}`)
    return SimplePropertyRetriever.getOwnAndPrototypeEnumAndNonEnumProps(obj);
}

function clear_dicts() {
    fqn2mod = {}
    fqn2obj = {}
    fqn2idx = {}
    fqn2wasminstance = {}
    wasminstance2jsnames = {}
}

function resolve_wasm(
  fqn2idx,
  fqn2wasminstance,
  wasminstance2jsnames,
  wasm_file_jsnames,
  wasm_file_idx2cfunc
) {
    const fileToNameSet = {};
    for (const [file, names] of Object.entries(wasm_file_jsnames)) {
      fileToNameSet[file] = new Set(names);
    }

    const fqn2cfunc = {};
    const fqn2wasmfile = {};
    const unresolved = [];
    const ambiguous = [];

    for (const fqn of Object.keys(fqn2idx)) {
      const idx = fqn2idx[fqn];
      const inst = fqn2wasminstance[fqn];
      const jsnames = wasminstance2jsnames[inst] || [];

      // find files whose name set is a superset of jsnames
      const candidates = [];
      for (const [file, nameSet] of Object.entries(fileToNameSet)) {
        const ok = jsnames.every(n => nameSet.has(n));
        if (ok) candidates.push(file);
      }

      if (candidates.length === 0) {
        unresolved.push({ fqn, idx, jsnames });
        continue;
      }

      // choose file
      let chosen = null;
      const exact = candidates.filter(f => fileToNameSet[f].size === jsnames.length);
      if (exact.length === 1) {
        chosen = exact[0];
      } else if (candidates.length === 1) {
        chosen = candidates[0];
      } else {
        ambiguous.push({ fqn, idx, jsnames, candidates });
        continue;
      }

      const idx2cfunc = wasm_file_idx2cfunc[chosen] || {};
      const cfunc = idx2cfunc[idx];
      if (cfunc !== undefined) {
        fqn2cfunc[fqn] = cfunc;
        fqn2wasmfile[fqn] = chosen;
      } else {
        unresolved.push({ fqn, idx, jsnames, file: chosen, reason: "idx not in file" });
      }
    }

    return { fqn2cfunc, fqn2wasmfile, unresolved, ambiguous };
}

function analyze_single(mod_file, pkg_root) {
    var res
	var b
	clear_dicts()
    cur_file = mod_file
    try {
        obj = require(mod_file)
    } catch(error) {
        console.log(error)
        return
    }
    jsname = get_mod_fqn(mod_file, pkg_root)
    fqn2mod[jsname] = obj
    console.log(`${mod_file}: jsname = ${jsname}`)
    recursive_inspect(obj, jsname)

    res = resolve_wasm(fqn2idx, fqn2wasminstance, wasminstance2jsnames, wasm_file_jsnames, wasm_file_idx2cfunc)

    for (const fqn of Object.keys(res.fqn2cfunc)) {
		var jumplib = res.fqn2wasmfile[fqn]
		b = {
			 'jsname': fqn,
			 'cfunc': res.fqn2cfunc[fqn],
			 'library': jumplib
			 }
            final_result['bridges'].push(b)
			if (!final_result['jump_libs'].includes(jumplib)) {
			  final_result['jump_libs'].push(jumplib);
			}
    }
    final_result['ambiguous'] = res.ambiguous
    final_result['unresolved'] = res.unresolved
}

function locate_wasm_files(packagePath) {
    const wasmFiles = [];

    function walkDir(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                walkDir(fullPath); // Recursive call for directories
            } else if (file.endsWith('.wasm')) {
                wasmFiles.push(path.resolve(fullPath)); // Add .wasm files to the list
            }
        });
    }

    walkDir(packagePath);
    return wasmFiles;
}

function locate_js_modules(packagePath) {
    const soFiles = [];

    function walkDir(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                walkDir(fullPath); // Recursive call for directories
            } else if (file.endsWith('.js')) {
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

function extract_jsnames_from_export(text) {
  const out = [];
  const seen = new Set();
  const re = /#([^:\s]+)\s*:/; // captures the token after '#' up to ':' (name)

  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("js-to-wasm")) continue;
    const m = re.exec(line);
    if (m) {
      const name = m[1];
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

function extract_wasm_instance_address(text) {
    const re = /-\s*Wasm instance:\s*(0x[0-9a-fA-F]+)/;
    const m = re.exec(text);
    return m ? m[1] : null;
}

function extract_wasm_idx(text) {
  const re = /-\s*Wasm function index:\s*(\d+)/;
  const m = re.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

function extract_exports_addr(text) {
  const re = /-\s*exports_object:\s*(0x[0-9a-fA-F]+)/;
  const m = re.exec(text);
  return m ? m[1] : null;
}

function check_bingo(obj, jsname) {
	var res
    var fqn
	var idx
	var raw
    var wasm_instance_address

	fqn = jsname
	console.log(`CHECK BINGO: ${jsname}`)
	raw = v8.job(obj)
	idxstr = extract_wasm_idx(raw)
    if (idxstr === null) {
        // fqn2failed[jsname] = 'FAILED_GETCB'
        return
    } else {
        ident = v8.jid(obj)
        foreign_ids.add(ident)
		idx = parseInt(idxstr)
	    fqn2idx[fqn] = idx
		wasm_instance_address = parseInt(extract_wasm_instance_address(raw))
		fqn2wasminstance[jsname] = wasm_instance_address
		if (!(wasm_instance_address in wasmobject2jsnames)) {
			raw = v8.job_addr(wasm_instance_address)
			exports_addr = parseInt(extract_exports_addr(raw))
			raw = v8.job_addr(exports_addr)
			jsnames = extract_jsnames_from_export(raw)
			wasminstance2jsnames[wasm_instance_address] = jsnames
		}
    }
}

function recursive_inspect(obj, jsname) {
	var jobstr
    pending = [[obj, jsname]]
    // console.log(`pending = ${pending}`)
    seen = new Set()

    // XXX: BFS. Use queue: insert using .push(),
    //      get head using .shift
    while (pending.length > 0) {
        [obj, jsname] = pending.shift()
        console.log(`jsname = ${jsname}`)

        if (!(obj instanceof(Object)) && (typeof obj != "object")) {
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
            objects_examined += 1
            // if (typeof v == 'undefined' || !(!(obj instanceof(Object)) && (typeof obj != "object"))) {
            //     continue
            // }

            if (typeof(obj) == 'function')
                callable_objects += 1

            ident = v8.jid(v)
			jobstr = v8.job(v)
		    if (seen.has(ident) && !((jobstr ?? '').includes('wasm'))) {
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

function analyze_wasm(wasm_file) {
	var res
	var idx2cfunc
	var idx2jsnames
	var alljsnames
	res = parseWasmFuncExports(wasm_file)
	idx2cfunc = res.idx2cfunc
	idx2jsnames = res.idx2jsnames
	alljsnames = res.allJsNames


	wasm_file_idx2cfunc[wasm_file] = idx2cfunc
	wasm_file_idx2jsnames[wasm_file] = idx2jsnames
	wasm_file_jsnames[wasm_file] = alljsnames
}

function main() {
    var start = Date.now()
    const args = parse_args();
    var output_file = args.output

    console.log(`Package root = ${args.root}`)

    js_files = locate_js_modules(args.root)
	wasm_files = locate_wasm_files(args.root)
    // so_files = deduplicate_paths(so_files)
    console.log(`WASM files :\n${wasm_files.join('\n')}`)

    for (const wasm_file of wasm_files) {
	  analyze_wasm(wasm_file)
    }

	console.log(`WASM ANALYSIS`)
	console.log(`WASM FILE idx2jsnames: ${JSON.stringify(wasm_file_idx2jsnames, null, 2)}`)
	console.log(`WASM FILE idx2cfunc: ${JSON.stringify(wasm_file_idx2cfunc, null, 2)}`)
	console.log(`WASM FILE jsnames: ${JSON.stringify(wasm_file_jsnames, null, 2)}`)

    for (const js_file of js_files) {
      analyze_single(js_file, args.root);
      final_result['modules'].push(js_file)
    }
    var end = Date.now()

    var duration_sec = Math.round((end - start) / 1000)
    final_result['duration_sec'] = duration_sec
    final_result['objects_examined'] = objects_examined
    final_result['callable_objects'] = callable_objects
    final_result['foreign_callable_objects'] = final_result['bridges'].lengt
    final_result['count'] = final_result['bridges'].length

    final_result['failed'] = fqn2failed
    if (output_file !== undefined) {
	    fs.writeFileSync(output_file, JSON.stringify(final_result, null, 2));
        console.log(`Wrote bridges to ${output_file}`)
    }
    else {
        console.log(JSON.stringify(final_result, null, 2))
    }
}


main()
