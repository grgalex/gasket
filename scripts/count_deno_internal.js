import {SimplePropertyRetriever} from './ffdir.js'

var module = {}
process.dlopen(module, '/home/george.alexopoulos/jsxray/prv-jsxray/jid-1/build/Debug/native.node', 0)

var objects_examined = 0
var callable_objects = 0
var foreign_callable_objects = 0


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

function main() {
    var start = Date.now()
    recursive_inspect(Deno.internal_fs, 'foo')

    var end = Date.now()

    var duration_sec = Math.round((end - start) / 1000)
    final_result['duration_sec'] = duration_sec
    final_result['objects_examined'] = objects_examined
    final_result['callable_objects'] = callable_objects
    final_result['foreign_callable_objects'] = foreign_callable_objects
    console.log(JSON.stringify(final_result, null, 2))
}

main()
