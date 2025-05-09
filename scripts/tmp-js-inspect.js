fqn2overloads = {}
fqn2cb = {}
fqn2cfuncs = {}

cbs = new Set()

function check_bingo(obj, jsname) {
    res = v8.getcb(obj)
    if (res == 'NONE') {
        return
    } else {
        jres = JSON.parse(res)
        cb = jres['callback']
        overloads = jres['overloads']
        cbs.add(cb)
        fqn2cb[jsname] = cbs
        fqn2overloads[jsname] = 
    }

}





function recursive_inspect(obj, jsname):
    pending = [[obj, jsname]]
    seen = new Set()

    # XXX: BFS. Use queue: insert using .append(), get head using .pop(0)
    while (pending.length > 0) {
        [obj, jsname] = pending.shift()

        if (!(obj instanceof(Object)) {
            continue
        }
        if (typeof(obj) == 'function') {
            check_bingo(obj, jsname)
        }

        for (const k of dir(obj)) {
            v = obj[k]
            if (typeof v == 'undefined' || !(v instanceof(Object))) {
                continue
            }

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
