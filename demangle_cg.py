import subprocess
import json

def demangle(symbol: str) -> str:
    try:
        result = subprocess.run(
            ["c++filt", symbol],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running c++filt: {e}")
        return symbol

INPUT_CG = 'binary_callgraph_node_g.json'
OUTPUT_CG = 'demangled_node_g.json'

with open(INPUT_CG, 'r') as infile:
    mcg = json.loads(infile.read())

dcg = mcg.copy()

for k, v in mcg['nodes'].items():
    oldname = v['name']
    newname = demangle(oldname)
    print(f'oldname = {oldname}')
    print(f'newname = {newname}')
    dcg['nodes'][k]['name'] = newname

with open(OUTPUT_CG, 'w') as outfile:
    outfile.write(json.dumps(dcg, indent=2))

