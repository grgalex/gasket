#! /usr/bin/env node

const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const v8 = require('v8')
const { execSync, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

const {SimplePropertyRetriever} = require('gasket-tools/ffdir');

if (process.env.GASKET_ROOT) {
  RESOLVE_SCRIPT_PATH = path.join(process.env.GASKET_ROOT, 'scripts/resolve_syms.py')
} else {
  RESOLVE_SCRIPT_PATH = 'resolve-syms'
}

objects_examined = 0
callable_objects = 0
foreign_callable_objects = 0

cur_file = 'none'

fqn2failed = {}
fqn2mod = {}
fqn2obj = {}
fqn2overloadsaddr = {}
fqn2overloads = {}
fqn2cbaddr = {}
fqn2cbaddr2 = {}
fqn2cb = {}
fqn2cb2 = {}
fqn2cfunc = {}
fqn2cfuncaddr = {}

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
    return yargs(process.argv.slice(2))
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

function demangle_cpp(mangled) {
    const cmd = `c++filt '${mangled}'`;
    try {
      const out = execSync(cmd, { encoding: 'utf-8', shell: true });
      return out.trim();
    } catch (err) {
      console.error(err);
      throw err;
    }
}

function dir(obj) {
    return SimplePropertyRetriever.getOwnAndPrototypeEnumAndNonEnumProps(obj);
}

function gdb_resolve(addresses) {
    const tmp_dir = os.tmpdir();
    const addr_file = path.join(tmp_dir, `addr_${randomUUID()}.json`);
    const res_file = path.join(tmp_dir, `res_${randomUUID()}.json`);

    pid = process.pid

	fs.writeFileSync(addr_file, JSON.stringify(addresses, null, 2));

    args = [RESOLVE_SCRIPT_PATH,
            '-p', String(pid),
            '-i', addr_file,
            '-o', res_file]

	var result = spawnSync('python3', args, { encoding: 'utf-8' });

	const raw = fs.readFileSync(res_file, 'utf-8');
	result = JSON.parse(raw);

	return result
}

function extract_fcb_invoke(fqn) {
    obj = fqn2obj[fqn]
	res = v8.extract_fcb_invoke(v8.jid(obj))
    if (res == 'NONE') {
        fqn2failed[fqn] = 'EXTRACT_FCB_INOKE'
    } else { /* res = address of cb2 */
        fqn2type[fqn] = 'fcb'
        fqn2cbaddr2[fqn] = res
	}
}

function extract_napi(fqn) {
    obj = fqn2obj[fqn]
	res = v8.extract_napi(v8.jid(obj))
    if (res == 'NONE') {
        fqn2failed[fqn] = 'EXTRACT_NAPI'
    } else {
        fqn2type[fqn] = 'napi'
        fqn2cfuncaddr[fqn] = res
	}
}

function extract_nan(fqn) {
    obj = fqn2obj[fqn]
	res = v8.extract_nan(v8.jid(obj))
    if (res == 'NONE') {
        fqn2failed[fqn] = 'EXTRACT_NAN'
    } else {
        fqn2type[fqn] = 'nan'
        fqn2cfuncaddr[fqn] = res
	}
}

function extract_cfunc(fqn) {
	cb = fqn2cb[fqn]

	if (cb.includes('v8impl')
            && cb.includes('FunctionCallbackWrapper6Invoke')) {
		extract_fcb_invoke(fqn)
	}
    else if (cb.includes('Nan') && cb.includes('imp')) {
        extract_nan(fqn)
    }
    else {
        fqn2cfuncaddr[fqn] = fqn2cbaddr[fqn]
    }
}

function extract_cfunc_2(fqn) {
	cb = fqn2cb2[fqn]

    if (cb.includes('Napi') && cb.includes('ObjectWrap') && cb.includes('ConstructorCallbackWrapper')) {
        var dem = demangle_cpp(cb)
        var cls = dem.match(/<([^>]*)>/)[1];
        var fn = cls + "::" + cls.split("::").pop();
        console.log(`fn = ${fn}`)
        var lib = addr2sym[fqn2cbaddr2[fqn]].library
        b = {
             'jsname': fqn,
             'cfunc': fn,
             'library': lib
             }

        console.log(b)
        final_result['bridges'].push(b)
        if (!(final_result['jump_libs'].includes(lib)))
            final_result['jump_libs'].push(lib)
    }

	else if ((cb.includes('Napi') && cb.includes('CallbackData') && cb.includes('Wrapper'))
           || ((cb.includes('Napi') && cb.includes('InstanceWrap')))
           || ((cb.includes('Napi') && cb.includes('ObjectWrap')))) {

		extract_napi(fqn)
	}

    else if (cb.includes('neon') && cb.includes('sys')) {
        var name = v8.extract_neon(fqn2obj[fqn])
        if (name !== 'NONE') {
            const match = name.match(/#([^>]+)>/);
            if (match) {
                fn = match[1];
            } else { /* failed regex */
                fqn2failed[fqn] = 'NEON_FAIL'
                return;
            }
            lib = cur_file
            b = {
                 'jsname': fqn,
                 'cfunc': fn,
                 'library': lib
                 }
            final_result['bridges'].push(b)
            if (!(final_result['jump_libs'].includes(lib)))
                final_result['jump_libs'].push(lib)
        }
    }
    else if (cb.includes('_napi_internal_register')) {
        var fn = demangle_cpp(cb)
        console.log(`fn = ${fn}`)
        var lib = addr2sym[fqn2cbaddr2[fqn]].library
        b = {
             'jsname': fqn,
             'cfunc': fn,
             'library': lib
             }

        console.log(b)
        final_result['bridges'].push(b)
        if (!(final_result['jump_libs'].includes(lib)))
            final_result['jump_libs'].push(lib)
    }

    else if (cb.includes('napi_')) {
        var fn = demangle_cpp(cb)
        console.log(`fn = ${fn}`)
        var lib = addr2sym[fqn2cbaddr2[fqn]].library
        b = {
             'jsname': fqn,
             'cfunc': fn,
             'library': lib
             }

        console.log(b)
        final_result['bridges'].push(b)
        if (!(final_result['jump_libs'].includes(lib)))
            final_result['jump_libs'].push(lib)
    }

    else {
        fqn2cfuncaddr[fqn] = fqn2cbaddr2[fqn]
    }
}

function clear_dicts() {
    fqn2mod = {}
    fqn2obj = {}
    fqn2overloadsaddr = {}
    fqn2overloads = {}
    fqn2cbaddr = {}
    fqn2cbaddr2 = {}
    fqn2cb = {}
    fqn2cb2 = {}
    fqn2cfunc = {}
    fqn2cfuncaddr = {}

    fqn2type = {}

    addr2sym = {}

    cbs_set = new Set()
    cbs = []
}

function analyze_single(mod_file, pkg_root) {
	clear_dicts()
    cur_file = mod_file
    try {
        obj = require(mod_file)
    } catch(error) {
        return
    }
    jsname = get_mod_fqn(mod_file, pkg_root)
    fqn2mod[jsname] = obj
    console.log(`${mod_file}: jsname = ${jsname}`)
    recursive_inspect(obj, jsname)
	cbs = Array.from(cbs_set)
    var resolve_addresses = new Set(cbs)

    for (let key in fqn2overloadsaddr) {
        fqn2overloadsaddr[key].forEach(item => resolve_addresses.add(item))
    }

	if (resolve_addresses.size > 0) {
		var res1 = gdb_resolve(Array.from(resolve_addresses))
		for (let addr in res1) {
		  addr2sym[addr] = res1[addr]
		}
	}

    for (let fqn in fqn2overloadsaddr) {
        for (let addr of fqn2overloadsaddr[fqn]) {
            try {
                lib = addr2sym[addr].library
            } catch (error){
                console.log(`Error: ${error}`)
                fqn2failed[fqn] = 'OVERLOAD_RESOLUTION'
                continue
            }
            b = {
                 'jsname': fqn,
                 'cfunc': addr2sym[addr].cfunc,
                 'library': lib
                 }
            final_result['bridges'].push(b)
            if (!(final_result['jump_libs'].includes(lib)))
                final_result['jump_libs'].push(lib)
        }
    }

    for (let fqn in fqn2cbaddr) {
        addr = fqn2cbaddr[fqn]
        cb = addr2sym[addr].cfunc
        fqn2cb[fqn] = cb
    }

    for (let fqn in fqn2cbaddr) {
        extract_cfunc(fqn)
    }

    resolve_addresses.clear()
    for (let fqn in fqn2cbaddr2) {
        addr = fqn2cbaddr2[fqn]
        resolve_addresses.add(addr)
    }


	if (resolve_addresses.size > 0) {
		var res2 = gdb_resolve(Array.from(resolve_addresses))
		for (let addr in res2) {
			addr_dec = String(Number(addr))
			addr2sym[addr_dec] = res2[addr]
		}
	}

    for (let fqn in fqn2cbaddr2) {
        addr = fqn2cbaddr2[fqn]
        try {
            cb = addr2sym[addr].cfunc
        } catch (error) {
        }
            fqn2cb2[fqn] = cb
    }

    for (let fqn in fqn2cb2) {
        extract_cfunc_2(fqn)
    }


    resolve_addresses.clear()
    for (let fqn in fqn2cfuncaddr) {
        addr_dec = String(Number(fqn2cfuncaddr[fqn]))
        fqn2cfuncaddr[fqn] = addr_dec
        resolve_addresses.add(addr_dec)
    }

	if (resolve_addresses.size > 0) {
		var res3 = gdb_resolve(Array.from(resolve_addresses))
		for (let addr in res3) {
		  addr_dec = String(Number(addr))
		  addr2sym[addr_dec] = res3[addr]
		}
	}

    for (let fqn in fqn2cfuncaddr) {
        addr = fqn2cfuncaddr[fqn]
        try {
            lib = addr2sym[addr].library
        } catch (error) {
            console.log(`Key = ${addr} not found`)
            fqn2failed[fqn] = 'CFUNC_ADDRESS_RESOLUTION'
            continue
        }
        b = {
             'jsname': fqn,
             'cfunc': demangle_cpp(addr2sym[addr].cfunc),
             'library': lib
             }
        final_result['bridges'].push(b)
        if (!(final_result['jump_libs'].includes(lib)))
            final_result['jump_libs'].push(lib)
    }
}

function locate_so_modules(packagePath) {
    const soFiles = [];

    function walkDir(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                walkDir(fullPath);
            } else if (file.endsWith('.node')) {
                soFiles.push(path.resolve(fullPath));
            }
        });
    }

    walkDir(packagePath);
    return soFiles;
}

function get_mod_fqn(fullPath, packageRoot) {
    const packageName = path.basename(packageRoot);
    const relativePath = path.relative(packageRoot, fullPath);
    const noExt = relativePath.replace(/\.[^/.]+$/, '');
    return `${packageName}/${noExt}`;
}

function check_bingo(obj, jsname) {
    res = v8.getcb(v8.jid(obj))
    if (res == 'NONE') {
        return
    } else {
        foreign_callable_objects += 1
        jres = JSON.parse(res)
        cb = jres['callback']
        overloads = jres['overloads']
        console.log(`FQN = ${jsname}`)
        console.log(`cb = ${cb}`)
        if (cb == '0') {
            fqn2failed[jsname] = 'NULL_CB'
            return
        }
        cbs_set.add(cb)
        fqn2cbaddr[jsname] = cb
        fqn2overloadsaddr[jsname] = overloads
        fqn2obj[jsname] = obj
    }
}

function recursive_inspect(obj, jsname) {
    pending = [[obj, jsname]]
    seen = new Set()

    // XXX: BFS. Use queue: insert using .push(),
    //      get head using .shift
    while (pending.length > 0) {
        [obj, jsname] = pending.shift()

        if (!(obj instanceof(Object))) {
            continue
        }
        desc_names = Object.getOwnPropertyNames(obj)
        for (const name of Object.getOwnPropertyNames(obj)) {
          desc = Object.getOwnPropertyDescriptor(obj, name);
          descname = jsname + '.' + name
          getter = desc['get']
          setter = desc['set']
          if (typeof(getter) == 'function') {
              check_bingo(getter, descname + '.' + 'GET')
          }
          if (typeof(setter) == 'function') {
              check_bingo(setter, descname + '.' + 'SET')
          }
        }
        if (typeof(obj) == 'function') {
            check_bingo(obj, jsname)
        }

        for (const k of dir(obj)) {
            try {
              v = obj[k]
            } catch(error) {
              continue
            }
            objects_examined += 1
            if (typeof v == 'undefined' || !(v instanceof(Object))) {
                continue
            }

            if (typeof(obj) == 'function')
                callable_objects += 1

            ident = v8.jid(v)
            if (seen.has(ident)) {
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
    var start = Date.now()
    const args = parse_args();
    var output_file = args.output

    console.log(`Package root = ${args.root}`)

    so_files = locate_so_modules(args.root)
    console.log(`Native extension files :\n${so_files.join('\n')}`)


    for (const so_file of so_files) {
      analyze_single(so_file, args.root);
      final_result['modules'].push(so_file)
    }

    var end = Date.now()

    var duration_sec = Math.round((end - start) / 1000)
    final_result['duration_sec'] = duration_sec
    final_result['objects_examined'] = objects_examined
    final_result['callable_objects'] = callable_objects
    final_result['foreign_callable_objects'] = foreign_callable_objects
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
