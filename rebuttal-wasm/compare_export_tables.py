import os
import re
import json
import random
import subprocess

from collections import defaultdict

import utils

INSTALL_ROOT_DIR = '/home/george.alexopoulos/jsxray/data'
DATA_FILE = '/home/george.alexopoulos/jsxray/prv-jsxray/rebuttal-wasm/out.json'

OUTFILE = 'potential_clashes.json'

def files_with_unique_content(file_list):
    unique_files = []

    for f in file_list:
        duplicate = False
        for u in unique_files:
            # Call diff -q quietly
            result = subprocess.run(["diff", "-q", f, u], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode == 0:  # files are identical
                duplicate = True
                break
        if not duplicate:
            unique_files.append(f)

    return unique_files

def get_export_count(f):
    print(f'get_export_count: {f}')
    filepath = os.path.join(INSTALL_ROOT_DIR, f) 
    cmd = f'wasm-objdump -x {filepath} | grep Export'
    ret, out, err = utils.run_cmd(cmd, shell=True)
    s = out
    try:
        cnt = int(re.search(r"\[(\d+)\]", s).group(1))
    except Exception as e:
        cnt = random.random()
    return cnt

with open(DATA_FILE, 'r') as infile:
    data = json.loads(infile.read())

packages = data['more_than_one']

clashes = {}
pkg2counts = defaultdict(dict)

for p in packages:
    files = data['pkg2fullpath'][p]
    uniq_files = files_with_unique_content(files)
    counts = []
    for f in uniq_files:
        c = get_export_count(f)
        counts.append(c)
        pkg2counts[p][f] = c
    print(counts)
    if len(counts) != len(set(counts)):
        print(f'CLASH for package {p}')
        print(f'FILES: {files}')
        print(f'COUNTS: {counts}')
        clashes[p] = uniq_files
results = {}
for p in clashes.keys():
    results[p] = pkg2counts[p] 
print(json.dumps(results, indent=2))
with open(OUTFILE, 'w') as outfile:
    outfile.write(json.dumps(results, indent=2))
# print(json.dumps(clashes, indent=2))
print(f'NUM_PKGS_CLASH = {len(clashes)}')
