import json

INFILE = 'all_bridges.json'
OUTFILE = 'new_all_bridges.json'

with open(INFILE, 'r') as infile:
    raw = json.loads(infile.read())

bridges = raw['all_bridges']

cnt = 0

for pkg_name in bridges.keys():
    gasket_bridges = bridges[pkg_name]['Gasket']
    charon_bridges = bridges[pkg_name]['Charon']
    for b in charon_bridges:
        jsname = b.split(',')[0].removeprefix('(')
        cfunc = b.split(',')[1].removesuffix(')')
        if 'Getter' in cfunc or 'Setter' in cfunc:
            if b not in gasket_bridges:
                print(f"package = {pkg_name}, adding bridge {b}")
                cnt += 1
                gasket_bridges.append(f"({jsname},{cfunc})")
    bridges[pkg_name]['Gasket'] = gasket_bridges

raw['all_bridges'] = bridges

print(f"TOTAL: {cnt}")

with open(OUTFILE, 'w') as outfile:
    outfile.write(json.dumps(raw, indent=2))


