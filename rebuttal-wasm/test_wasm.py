import subprocess

wasm_file = "/home/george.alexopoulos/jsxray/data/install/@hirelofty~vue_deckgl_test___1.0.0/node_modules/draco3d/draco_decoder.wasm"

# Run wasm-objdump to get exports
result = subprocess.run(
    ["wasm-objdump", "-x", wasm_file],
    capture_output=True,
    text=True,
    check=True
)

# Parse export lines
exports = []
for line in result.stdout.splitlines():
    line = line.strip()
    if line.startswith("Export["):
        # Example line: Export[0] func[1] "add"
        parts = line.split()
        index = parts[0][len("Export["):-1]  # get the number inside brackets
        kind, kind_index = parts[1].split("[")
        kind_index = kind_index[:-1]  # remove closing bracket
        name = parts[2].strip('"')
        exports.append({"index": int(index), "kind": kind, "kind_index": int(kind_index), "name": name})

# Show results
for e in exports:
    print(e)
