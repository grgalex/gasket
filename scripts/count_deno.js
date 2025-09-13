import {SimplePropertyRetriever} from './ffdir.js'
import yargz from 'npm:yargs';
import { hideBin } from 'npm:yargs/helpers'
import * as fs from 'node:fs'
import * as path from 'node:path'

const yargs = yargz(hideBin(process.argv))

self.mod = {}
// process.dlopen(mod, '/home/george.alexopoulos/jsxray/prv-jsxray/jid-1/build/Debug/native.node', 0)
process.dlopen(mod, '/home/george.alexopoulos/jsxray/prv-jsxray/jid-artifact/build/Debug/native.node', 0)

self.objects_examined = 0
self.callable_objects = 0
self.foreign_callable_objects = 0

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


self.final_result = {
    'objects_examined': 0,
    'callable_objects': 0,
    'foreign_callable_objects': 0,
    'duration_sec': 0,
    'modules': []
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
            self.objects_examined += 1
            if (typeof v == 'undefined' || !(v instanceof(Object))) {
                continue
            }

            if (typeof(obj) == 'function')
                self.callable_objects += 1

            ident = self.mod.exports.id(v)
            console.log(ident)
            if (seen.has(ident)) {
                console.log('ALREADY SEEN')
                continue
            } else {
                seen.add(ident)
            }

            pending.push([v, jsname + '.' + k])
        }
        seen.add(self.mod.exports.id(obj))
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
            } else if (file.endsWith('ts')) {
                soFiles.push(path.resolve(fullPath)); // Add .so files to the list
            }
        });
    }

    walkDir(packagePath);
    return soFiles;
}

function analyze_single(mod_file, pkg_root) {
    var cur_file = mod_file
    var obj = import(mod_file)

    var jsname = 'foo' 
    console.log(`${mod_file}: jsname = ${jsname}`)
    recursive_inspect(obj, jsname)
}

export function foo() {
    console.log('started!')
    var start = Date.now()
    const args = parse_args();
    var output_file = args.output

    console.log(`Package root = ${args.root}`)

    var so_files = locate_js_modules(args.root)

    console.log(`FILES = ${so_files}`)

    for (const so_file of so_files) {
      try {
          analyze_single(so_file, args.root);
          self.final_result['modules'].push(so_file)
      } catch(error){
          console.log(`ERROR WHILE INSPECTING ${so_file}: ${error}`)
      }
    }

    var end = Date.now()

    var duration_sec = Math.round((end - start) / 1000)
    self.final_result['duration_sec'] = duration_sec
    self.final_result['objects_examined'] = objects_examined
    self.final_result['callable_objects'] = callable_objects
    self.final_result['foreign_callable_objects'] = foreign_callable_objects

    if (output_file !== undefined) {
	    fs.writeFileSync(output_file, JSON.stringify(self.final_result, null, 2));
        console.log(`Wrote bridges to ${output_file}`)
    }
    else {
        console.log(JSON.stringify(self.final_result, null, 2))
    }
}

foo()
