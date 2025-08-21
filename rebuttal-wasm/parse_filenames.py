from collections import defaultdict
import json

packages = set()
pkg2files = defaultdict(set)
filepath2full = {}

OUTFILE = 'out.json'

results = {}

with open("wasm_files.txt") as f:
    for line in f:
        parts = line.strip().split("/")
        # Find all indices of "node_modules"
        indices = [i for i, p in enumerate(parts) if p == "node_modules"]
        if indices:
            idx = indices[-1]  # rightmost occurrence
            # Extract package name
            filepath_start_index = idx + 2
            package = parts[idx + 1]
            if package.startswith("@") and idx + 2 < len(parts):
                package += "/" + parts[idx + 2]
                filepath_start_index = idx + 3
            filepath = '/'.join(parts[filepath_start_index:])
            fullpath = line.strip()
            pkg2files[package].add(filepath)
            if filepath not in filepath2full.keys():
                filepath2full[filepath] = line.strip()
            packages.add(package)

print(packages)
print(pkg2files)

num_more_than_one = 0
more_than_one = []

for p, files in pkg2files.items():
    if len(files) > 1:
        num_more_than_one += 1
        more_than_one.append(p)

pkg2fullpath = defaultdict(list)

for p, files in pkg2files.items():
    for f in files:
        pkg2fullpath[p].append(filepath2full[f])

print(f"PACKAGES: {packages}")
print(f"MORE_THAN_ONE: {more_than_one}")
print(f"NUM_PACKAGES: {len(packages)}")
print(f"NUM_MORE_THAN_ONE: {len(more_than_one)}")

results['num_packages'] = len(packages)
results['num_packages_more_than_one'] = len(more_than_one)
results['packages'] = list(packages)
results['more_than_one'] = list(more_than_one)
results['pkg2files'] = {k: list(v) for k, v in pkg2files.items()}
results['pkg2fullpath'] = pkg2fullpath

with open(OUTFILE, 'w') as outfile:
    outfile.write(json.dumps(results, indent=2))
