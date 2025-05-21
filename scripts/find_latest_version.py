import utils

INPUT_FILE = 'npm_ne.csv'
OUTPUT_FILE = 'npm_versioned.csv'

package_names = utils.load_csv(INPUT_FILE)
pkg2ver = {}

for pkg in package_names:
    cmd = ['npm', 'show', pkg, 'version']
    try:
        ret, out, err = utils.run_cmd(cmd)
    except Exception as e:
        print(e)
    ver = out
    print(f"{pkg}:{ver}")
