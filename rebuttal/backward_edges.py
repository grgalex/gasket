import os
import re
import sys
import json
import argparse
import logging
from pathlib import Path
import shutil
import multiprocessing
import concurrent.futures
import tempfile
import subprocess

from concurrent.futures import ThreadPoolExecutor, as_completed

from collections import defaultdict

import utils

log = logging.getLogger(__name__)

TEMP_DIR_ROOT = '/home/george.alexopoulos/jsxray/data/tmp'


def setup_logging(args):
    levels = {
        "critical": logging.CRITICAL,
        "error": logging.ERROR,
        "warn": logging.WARNING,
        "warning": logging.WARNING,
        "info": logging.INFO,
        "debug": logging.DEBUG,
    }
    level = levels.get(args.log.lower())
    if level is None:
        raise ValueError(
            f"log level given: {args.log}"
            f" -- must be one of: {' | '.join(levels.keys())}"
        )

    fmt = "%(asctime)s "
    fmt += "%(module)s:%(lineno)s [%(levelname)s] "
    fmt += "%(message)s"
    # Use ISO 8601 format
    datefmt='%Y-%m-%dT%H:%M:%S'

    logging.basicConfig(level=level, format=fmt, datefmt=datefmt)

def parse_args():
    p = argparse.ArgumentParser(description='backward edges')
    p.add_argument(
        "-l",
        "--log",
        default="info",
        help=("Provide logging level. Example --log debug"),
    )
    p.add_argument(
        "-i",
        "--input",
        default=None,
        help=("Input CSV."),
    )
    p.add_argument(
        "-o",
        "--output",
        default=False,
        help=("Output file."),
    )
    return p.parse_args()

def search_directory(dir_path: str) -> int:
    """
    Uses grep -r to search for a string in a directory (excluding .lock files)

    Args:
        dir_path: Directory to search
        search_str: String pattern to find

    Returns:
        1 if found, 0 if not found, 2 if directory doesn't exist
    """
    dir_path = Path(dir_path)
    if not dir_path.is_dir():
        print(f"Error: Directory '{dir_path}' does not exist", file=sys.stderr)
        return 2

    try:
        # --include='*' ensures we only exclude .lock files (not directories)
        # -q makes grep quiet (we only care about the return code)
        # -I ignores binary files

        cmd = f"grep -rlF -e 'napi_call_threadsafe_function' -e 'napi_call_function' -e 'napi_make_callback' -e 'Call(' -e 'Nan::Callback' --include '*.c' --include '*.cc' --include '*.cpp' {dir_path}"
        result = subprocess.run(
            cmd,
            shell=True,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        log.info(f"OUT = {result.stdout}")
        log.info(f"ERR = {result.stderr}")
        # result = subprocess.run(
        #     ["grep", "-r", "-q", "-I", "-F", '-search_str, str(dir_path)],
        #     shell=True,
        #     check=False,
        #     stdout=subprocess.PIPE,
        #     stderr=subprocess.PIPE
        # )
        return 1 if result.returncode == 0 else 0
    except FileNotFoundError:
        print("Error: grep command not found", file=sys.stderr)
        return 2

class BackwardCounter():
    def __init__(self, package):
        self.package = package
        self.sanitized_package = utils.sanitize_package_name(self.package)
        self.count = 0

    def find_callbacks(self, src):
        with tempfile.TemporaryDirectory(dir=TEMP_DIR_ROOT) as temp_dir:
            code_directory = os.path.join(temp_dir, 'package')
            # 1. tarball in tempdir
            log.info(f"Unpacking source of {src} at {code_directory}")
            download_source_cmd = f'npm v {src} dist.tarball | xargs curl | tar -xz -C {temp_dir}'
            ret, out, err = utils.run_cmd(download_source_cmd, shell=True)

            ret = search_directory(temp_dir)
            if ret == 1:
                self.count = 1
            else:
                self.count = 0

    def process(self):
        self.find_callbacks(self.package)
        return self.count

def do_one(package):
    analyzer = BackwardCounter(package)
    count = analyzer.process()
    return (package, count)


def main():
    args = parse_args()
    setup_logging(args)

    if args.input is None:
        log.error("Must provide input CSV path")
        sys.exit(1)

    packages = utils.load_csv(args.input)

    total = {'num_packages': len(packages), 'yes_callback': 0, 'no_callback': 0}

    results = {}

    # for p in packages:
    #     pkg, count = do_one(p)
    #     results[pkg] = count

    futures = []
    with ThreadPoolExecutor(max_workers=16) as executor:
        for p in packages:
            futures.append(executor.submit(do_one, p))
    for future in as_completed(futures):
        p, cnt = future.result()
        results[p] = cnt

    for k in results.keys():
        if results[k] > 0:
            total['yes_callback'] += 1
        else:
            total['no_callback'] += 1

    total['per_package'] = results


    log.info(f"TOTAL: {total}")

    with open(args.output, 'w') as outfile:
        outfile.write(json.dumps(total, indent=2))

if __name__ == "__main__":
    main()


