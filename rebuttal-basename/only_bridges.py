import os
import json

BRIDGES_DIR = '/home/george.alexopoulos/jsxray/data/jsxray_bridges'
OUTFILE = 'test.json'

def do_one(file_path):
    clashes = []
    funcs = set()
    with open(file_path, 'r') as infile:
        for line in infile:
            func = line.split(',')[0].removeprefix('(')
            if func in funcs:
                clashes.append(func)
            else:
                funcs.add(func)

    return clashes

total = {'packages_with_clash': [], 'all_clashes': 0}
results = {}

for root, dirs, files in os.walk(BRIDGES_DIR):
    for filename in files:
        pkg = filename.removesuffix('.txt')
        file_path = os.path.join(root, filename)
        print(f"Processing {filename}")
        clashes = do_one(file_path)
        results[pkg] = clashes
        if len(clashes) > 0:
            total['packages_with_clash'].append(pkg)
            total['all_clashes'] += len(clashes)
total['num_packages_with_clash'] = len(total['packages_with_clash'])
total['per_package'] = results
with open(OUTFILE, 'w') as outfile:
    outfile.write(json.dumps(total, indent=2))
