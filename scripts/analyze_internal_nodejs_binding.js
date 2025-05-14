const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {SimplePropertyRetriever} = require('./ffdir');
const v8 = require('v8')
const { execSync, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

RESOLVE_SCRIPT_PATH = '/home/george.alexopoulos/jsxray/prv-jsxray/scripts/resolve_syms.py'

BUILTIN_BINDING_NAMES_ALL = [
    'async_context_frame',
    'async_wrap',
    'blob',
    'block_list',
    'buffer',
    'builtins',
    'cares_wrap',
    'config',
    'constants',
    'contextify',
    'credentials',
    'encoding_binding',
    'errors',
    'fs',
    'fs_dir',
    'fs_event_wrap',
    'heap_utils',
    'http2',
    'http_parser',
    'inspector',
    'internal_only_v8',
    'js_stream',
    'js_udp_wrap',
    'messaging',
    'modules',
    'module_wrap',
    'mksnapshot',
    'options',
    'os',
    'performance',
    'permission',
    'pipe_wrap',
    'process_wrap',
    'process_methods',
    'report',
    'sea',
    'serdes',
    'signal_wrap',
    'spawn_sync',
    'sqlite',
    'stream_pipe',
    'stream_wrap',
    'string_decoder',
    'symbols',
    'task_queue',
    'tcp_wrap',
    'timers',
    'trace_events',
    'tty_wrap',
    'types',
    'udp_wrap',
    'url',
    'util',
    'uv',
    'v8',
    'wasi',
    'wasm_web_api',
    'watchdog',
    'webstorage',
    'worker',
    'zlib'
]

BUILTIN_BINDING_NAMES = ['fs']

objects_examined = 0
callable_objects = 0
foreign_callable_objects = 0


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
    'failed': {},
    'bridges': [],
}

function sleepSync(seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end);
}

function parse_args() {
    return yargs
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
    // console.log(`dir(): ${obj}`)
    return SimplePropertyRetriever.getOwnAndPrototypeEnumAndNonEnumProps(obj);
}

function gdb_resolve(addresses) {
    const tmp_dir = os.tmpdir();
    const addr_file = path.join(tmp_dir, `addr_${randomUUID()}.json`);
    const res_file = path.join(tmp_dir, `res_${randomUUID()}.json`);

    console.log('GDB ADDRESSES FED')
    console.log(addresses)

    pid = process.pid

	fs.writeFileSync(addr_file, JSON.stringify(addresses, null, 2));

	// var cmd = `bash -c 'python3 ${RESOLVE_SCRIPT_PATH} -p ${pid} -i ${addr_file} -o ${res_file}'`
    args = [RESOLVE_SCRIPT_PATH,
            '-p', String(pid),
            '-i', addr_file,
            '-o', res_file]
	// console.log(`CMD = python3 ${args}`)

	var result = spawnSync('python3', args, { encoding: 'utf-8' });
	const out = result.stdout
	// console.log('OUT:')
	// console.log(out)
	const err = result.stderr
	// console.log('ERR:')
	// console.log(err)

	const raw = fs.readFileSync(res_file, 'utf-8');
	result = JSON.parse(raw);
	console.log('GDB RESULT:')
	console.log(result)

	return result
}

function extract_fcb_invoke(fqn) {
    obj = fqn2obj[fqn]
	res = v8.extract_fcb_invoke(obj)
    if (res == 'NONE') {
        fqn2cfunc[fqn] = 'FAILED'
    } else { /* res = address of cb2 */
		// console.log(res)
        if (res == 'NONE') {
            fqn2cfunc[fqn] = 'FAILED'
        } else {
            fqn2type[fqn] = 'fcb'
            fqn2cbaddr2[fqn] = res
        }
	}
}

function extract_napi(fqn) {
    console.log(`Extract napi called: ${fqn}`)
    obj = fqn2obj[fqn]
	res = v8.extract_napi(obj)
    if (res == 'NONE') {
        fqn2cfunc[fqn] = 'FAILED'
    } else { /* res = address of cb2 */
        res = res
		console.log(`v8.extract_napi(${fqn}) = ${res}`)
        if (res == 'NONE') {
            fqn2cfunc[fqn] = 'FAILED'
        } else {
            fqn2type[fqn] = 'napi'
            fqn2cfuncaddr[fqn] = res
        }
	}
}

function extract_cfunc(fqn) {
	cb = fqn2cb[fqn]

	if (cb.includes('FunctionCallbackWrapper6Invoke')) {
		extract_fcb_invoke(fqn)
	}
    else {
        fqn2cfuncaddr[fqn] = fqn2cbaddr[fqn]
    }
}

function extract_cfunc_2(fqn) {
	cb = fqn2cb2[fqn]

    // Napi::ObjectWrap::ConstructorCallbackWrapper
    if (cb.includes('Napi') && cb.includes('ObjectWrap') && cb.includes('ConstructorCallbackWrapper')) {
        var dem = demangle_cpp(cb)
        var cls = dem.match(/<([^>]*)>/)[1];
        var fn = cls + "::" + cls.split("::").pop();
        console.log(`fn = ${fn}`)
        // XXX: Spaghettoni
        var lib = addr2sym[fqn2cbaddr2[fqn]].library
        b = {
             'jsname': fqn,
             'cfunc': fn,
             'library': lib
             }
        final_result['bridges'].push(b)
        if (!(final_result['jump_libs'].includes(lib)))
            final_result['jump_libs'].push(lib)
    }

    // Generic Napi
	else if ((cb.includes('Napi') && cb.includes('CallbackData') && cb.includes('Wrapper'))
           || ((cb.includes('Napi') && cb.includes('InstanceWrap')))
           || ((cb.includes('Napi') && cb.includes('ObjectWrap')))) {

		extract_napi(fqn)
	}

    else {
        fqn2cfuncaddr[fqn] = fqn2cbaddr2[fqn]
    }
}

function analyze_single(mod_name) {
    obj = process.binding(mod_name)
    jsname = mod_name
    fqn2mod[jsname] = obj
    recursive_inspect(obj, jsname)
	cbs = Array.from(cbs_set)

    // XXX: Initialize Set with CBS!
    var resolve_addresses = new Set(cbs)

    // for (let key in fqn2overloadsaddr) {
    //     new_addrs = []
    //     for (let addr of fqn2overloadsaddr[key]) {
    //         console.log(addr)
    //         dec_addr = String(Number(addr))
    //         console.log(dec_addr)
    //         new_addrs.push(dec_addr)
    //     }
    //     fqn2overloadsaddr[key] = new_addrs
    // }

    for (let key in fqn2overloadsaddr) {
        fqn2overloadsaddr[key].forEach(item => resolve_addresses.add(item))
    }

    console.log(`FQN2OVERLOADSADDR = ${JSON.stringify(fqn2overloadsaddr, null, 2)}`)

	var res1 = gdb_resolve(Array.from(resolve_addresses))
    for (let addr in res1) {
      addr2sym[addr] = res1[addr]
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

    // console.log(`FQN2CB = ${JSON.stringify(fqn2cb, null, 2)}`)
    // console.log(`FQN2OVERLOADS = ${JSON.stringify(fqn2overloads, null, 2)}`)
    // console.log('FQN2OBJ: (next line)')
    // console.log(fqn2obj)

    for (let fqn in fqn2cbaddr) {
        extract_cfunc(fqn)
    }

    console.log(`FQN2CBADDR2 = ${JSON.stringify(fqn2cbaddr2, null, 2)}`)

    // sleepSync(1000)

    resolve_addresses.clear()
    for (let fqn in fqn2cbaddr2) {
        addr = fqn2cbaddr2[fqn]
        resolve_addresses.add(addr)
    }
	var res2 = gdb_resolve(Array.from(resolve_addresses))
    console.log('RES2:')
    console.log(res2)
    for (let addr in res2) {
        addr_dec = String(Number(addr))
        addr2sym[addr_dec] = res2[addr]
    }

    console.log(addr2sym)

    for (let fqn in fqn2cbaddr2) {
        addr = fqn2cbaddr2[fqn]
        cb = addr2sym[addr].cfunc
        fqn2cb2[fqn] = cb
    }

    for (let fqn in fqn2cb2) {
        extract_cfunc_2(fqn)
    }

    console.log('FQN2CFUNCADDR')
    console.log(fqn2cfuncaddr)

    resolve_addresses.clear()
    for (let fqn in fqn2cfuncaddr) {
        addr_dec = String(Number(fqn2cfuncaddr[fqn]))
        fqn2cfuncaddr[fqn] = addr_dec
        resolve_addresses.add(addr_dec)
    }
    console.log('RESOLVE_ADDRESSES FOR FINAL CFUNCS')
    console.log(resolve_addresses)
	var res3 = gdb_resolve(Array.from(resolve_addresses))
    for (let addr in res3) {
      addr_dec = String(Number(addr))
      addr2sym[addr_dec] = res3[addr]
    }

    console.log('ADDR2SYM')
    console.log(addr2sym)

    console.log('FQN2CFUNCADDR')
    console.log(fqn2cfuncaddr)

    // for (let fqn in fqn2cfunc) {
    //     cfunc = fqn2cfunc[fqn]
    //     b = {
    //          'jsname': fqn,
    //          'status': cfunc
    //          }
    //     final_result['bridges'].push(b)
    // }

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
        // fqn2failed[jsname] = 'FAILED_GETCB'
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
        // console.log('CBS = (next line)')
        // console.log(cbs_set)
        fqn2cbaddr[jsname] = cb
        fqn2overloadsaddr[jsname] = overloads
        fqn2obj[jsname] = obj
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
            objects_examined += 1
            if (typeof v == 'undefined' || !(v instanceof(Object))) {
                continue
            }

            if (typeof(obj) == 'function')
                callable_objects += 1

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
    var start = Date.now()
    args = parse_args();
    output_file = args.output

    for (const builtin_name of BUILTIN_BINDING_NAMES) {
      analyze_single(builtin_name);
      final_result['modules'].push(builtin_name)
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
