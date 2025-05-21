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

    for pkg in package_names:
        cmd = ['npm', 'show', pkg, 'version']
        try:
            ret, out, err = utils.run_cmd(cmd)
        except Exception as e:
            print(e)
        ver = out
        print(f"{pkg}:{ver}")

if __name__ == "__main__":
    main()

