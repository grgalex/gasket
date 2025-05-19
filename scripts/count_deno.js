import {SimplePropertyRetriever} from './ffdir.js'
import importSync from 'npm:import-sync';
import yargs from 'npm:yargs';

var module = {}
process.dlopen(module, '/home/george.alexopoulos/jsxray/prv-jsxray/jid-1/build/Debug/native.node', 0)

var objects_examined = 0
var callable_objects = 0
var foreign_callable_objects = 0

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


var final_result = {
    'objects_examined': 0,
    'callable_objects': 0,
    'foreign_callable_objects': 0,
    'duration_sec': 0,
}

function dir(obj) {
    // console.log(`dir(): ${obj}`)
    return SimplePropertyRetriever.getOwnAndPrototypeEnumAndNonEnumProps(obj);
}

function recursive_inspect(obj, jsname) {
    console.log('recursive_inspect')
    var pending = [[obj, jsname]]
    console.log(pending)
    var seen = new Set()
    var popped
    var v
    var ident

    // XXX: BFS. Use queue: insert using .push(),
    //      get head using .shift
    while (pending.length > 0) {
        console.log('fib')
        popped = pending.shift()
        obj = popped[0]
        jsname = popped[1]
        console.log(`jsname = ${jsname}`)

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

            ident = module.exports.id(v)
            if (seen.has(ident)) {
                console.log('ALREADY SEEN')
                continue
            } else {
                seen.add(ident)
            }

            pending.push([v, jsname + '.' + k])
        }
        seen.add(module.exports.id(obj))
    }
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
            } else if (file.endsWith('js') || (file.endsWith('ts'))) {
                soFiles.push(path.resolve(fullPath)); // Add .so files to the list
            }
        });
    }

    walkDir(packagePath);
    return soFiles;
}

function analyze_single(mod_file, pkg_root) {
	clear_dicts()
    cur_file = mod_file
        obj = importSync(mod_file)

    jsname = get_mod_fqn(mod_file, pkg_root)
    fqn2mod[jsname] = obj
    console.log(`${mod_file}: jsname = ${jsname}`)
    recursive_inspect(obj, jsname)
}

function main() {
    var start = Date.now()
    const args = parse_args();
    var output_file = args.output

    console.log(`Package root = ${args.root}`)

    so_files = locate_js_modules(args.root)

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

