import time
import json
import argparse

import utils


def parse_args():
    p = argparse.ArgumentParser(description='Get latest versions of npm packages in a given csv')
    p.add_argument(
        "-i",
        "--input",
        default=None,
        help=("Input file"),
    )
    p.add_argument(
        "-o",
        "--output",
        default=None,
        help=("Output file"),
    )
    return p.parse_args()


def main():
    args = parse_args()
    if args.input is None:
        print("Must provide input CSV file")
        sys.exit(1)
    package_names = utils.load_csv(args.input)
    pkg2ver = {}
    final = []

    for pkg in package_names:
        time.sleep(0.5)
        cmd = ['npm', 'show', pkg, 'version']
        try:
            ret, out, err = utils.run_cmd(cmd)
        except Exception as e:
            print(e)
            continue
        ver = out.strip()
        pkg2ver[pkg] =
        print(f"{pkg}:{ver}")

    for pkg, ver in pkg2ver.items():
        pkgver = pkg + ':' + ver
        final.append(pkgver)
    if args.output is not None:
        with open(args.output, 'w') as outfile:
            for pkgver in final:
                outfile.write(f"{pkgver}\n")
    else:
        console.log(json.dumps(final, indent=2))

if __name__ == "__main__":
    main()

