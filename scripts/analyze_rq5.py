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

from collections import defaultdict

import utils

log = logging.getLogger(__name__)

VULNERABLE_VERSIONS_ROOT = '/home/george.alexopoulos/jsxray/prv-jsxray/rq5/vuln_versions'
VERSIONED_DEPENDENTS_ROOT = '/home/george.alexopoulos/jsxray/prv-jsxray/rq5/versioned_dependents'

TEMP_DIR_ROOT = '/home/george.alexopoulos/jsxray/data/tmp'

JELLY_PATH = '/home/george.alexopoulos/jsxray/prv-jelly/lib/main.js'
SEMVER_RESOLVE_PATH = '/home/george.alexopoulos/jsxray/prv-jsxray/scripts/semver_resolve.js'


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
    p = argparse.ArgumentParser(description='Produce Unified Stitch for a CSV containing user/repo pairs (from GitHub).')
    p.add_argument(
        "-l",
        "--log",
        default="info",
        help=("Provide logging level. Example --log debug"),
    )
    p.add_argument(
        "-p",
        "--package",
        default=None,
        help=("Vulnerable package name."),
    )
    p.add_argument(
        "-f",
        "--function",
        default=False,
        help=("Vulnerable function name."),
    )
    p.add_argument(
        "-o",
        "--output",
        default=False,
        help=("Output file."),
    )
    return p.parse_args()

def get_version_constraint(package, target):
    log.info(f"Getting version dependency constraint of {target} for {package}")
    cmd = f'npm view {package} dependencies --json'
    ret, out, err = utils.run_cmd(cmd, shell=True)
    dependencies_json = json.loads(out)
    constraint = dependencies_json[target]
    return constraint

def resolve_constraint(package, constraint):
    log.info(f"Resolving constraint {constraint} on package {package}...")
    cmd = [
        'node',
        SEMVER_RESOLVE_PATH,
        '-p', package,
        '-s', constraint
    ]
    ret, out, err = utils.run_cmd(cmd)
    resolved = json.loads(out)
    return resolved

class VulnerabilityAnalyzer():
    def __init__(self, package, function, output):
        self.output_file = output
        self.package = package
        self.sanitized_package = utils.sanitize_package_name(self.package)
        self.function = function
        self.vulnerable_versions_file_basename = self.sanitized_package + '_vuln_versions.json'
        self.vulnerable_versions_file = os.path.join(VULNERABLE_VERSIONS_ROOT, self.vulnerable_versions_file_basename)
        with open(self.vulnerable_versions_file, 'r') as infile:
            self.vulnerable_versions = json.loads(infile.read())
        log.info(f"VULNERABLE VERSIONS OF {package} = {self.vulnerable_versions}")
        self.versioned_dependents_dir = '/home/george.alexopoulos/jsxray/prv-jsxray/rq5/versioned_dependents'
        self.versioned_deps_file_basename = self.sanitized_package + '_dependents_versioned.csv'
        self.versioned_dependents_file = os.path.join(self.versioned_dependents_dir, self.versioned_deps_file_basename)
        self.versioned_dependents_raw = utils.load_csv(self.versioned_dependents_file)

        self.versioned_dependents = []
        # versioned_dependents are in the form of name@version
        for p in self.versioned_dependents_raw:
            self.versioned_dependents.append(p.replace(':', '@'))

        self.packages_depend_vuln = set()
        self.packages_no_depend_vuln = set()
        self.packages_call_vuln = set()

        self.packages_failed = set()

        self.found_lines = defaultdict(list)

    def is_reachable(self, src, target_package, target_function):
        with tempfile.TemporaryDirectory(dir=TEMP_DIR_ROOT) as temp_dir:
            code_directory = os.path.join(temp_dir, 'package')
            # 1. tarball in tempdir
            log.info(f"Unpacking source of {src} at {code_directory}")
            download_source_cmd = f'npm v {src} dist.tarball | xargs curl | tar -xz -C {temp_dir}'
            ret, out, err = utils.run_cmd(download_source_cmd, shell=True)

            # 2. run jelly --api, get stdout
            jelly_cmd = f'{JELLY_PATH} {code_directory} --api-usage'
            log.info(f"Running Jelly cmd: {jelly_cmd}")
            ret, out, err = utils.run_cmd(jelly_cmd, shell=True)

            found = False

            log.info(f"RET = {ret}")
            log.info(f"STDERR = {err}")
            log.info(f"STDOUT = {out}")

            # 3. check lines for 'call' and 'target_package' and 'target_function'
            log.info(f"Checking output lines...")
            lines = out.splitlines()
            for i, line in enumerate(lines):
                if 'call' in line and target_package in line and target_function in line:
                    found = True
                    log.info(f'REACHABLE: {src} {target_package} {target_function}')
                    if i + 1 < len(lines):
                        log.info(f'NEXT LINE: {lines[i+1]}')
                        pair = [lines[i], lines[i+1]]
                    else:
                        pair = [lines[i]]
                    self.found_lines[src].append(pair)

            if found:
                return True
            else:
                return False

    def do_one(self, dep):
        log.info(f"Analyzing dep {dep}...")
        try:
            constraint = get_version_constraint(dep, self.package)
            possible_versions = resolve_constraint(self.package, constraint)

            if len(possible_versions) == 0:
                raise RuntimeError(f"dep = {dep}: No versions at all match constraint {constraint}")

            

            log.info(f"POSSIBLE_VERSIONS = {possible_versions}")
            log.info(f"VULNERABLE_VERSIONS = {self.vulnerable_versions}")
            for v in possible_versions:
                if v in self.vulnerable_versions:
                    log.info(f"Package {dep} depends on VULNERABLE version {v} of {self.package}")
                    self.packages_depend_vuln.add(dep)

            if not dep in self.packages_depend_vuln:
                log.info(f"Package {dep}, constraint = {constraint} DOES NOT DEPEND ON ANY VULNERABLE VERSION of {self.package}")
                self.packages_no_depend_vuln.add(dep)
                return

            if self.is_reachable(dep, self.package, self.function):
                self.packages_call_vuln.add(dep)
                return

        except Exception as e:
            log.error(f"DEP = {dep}, EXCEPTION = {e}")
            self.packages_failed.add(dep)
            return

    def process(self):
        for versioned_dependent in self.versioned_dependents:
            self.do_one(versioned_dependent)

        result = {'vulnerable_package': self.package,
                  'vulnerable_function': self.function,
                  'num_dependents': len(self.versioned_dependents),
                  'num_dependents_failed_analysis': len(self.packages_failed),
                  'num_dep_vuln': len(self.packages_depend_vuln),
                  'num_call_vuln': len(self.packages_call_vuln),
                  'call_vuln': list(self.packages_call_vuln),
                  'found_lines_per_package': self.found_lines
            }

        log.info(result)
        log.info(json.dumps(result, indent=2))
        if self.output_file is not None:
            with open(self.output_file, 'w') as outfile:
                outfile.write(json.dumps(result, indent=2))

def main():
    args = parse_args()
    setup_logging(args)

    if args.package is None:
        log.error("Must provide vulnerable package name")
        sys.exit(1)

    if args.function is None:
        log.error("Must provide vulnerable function name")
        sys.exit(1)


    analyzer = VulnerabilityAnalyzer(args.package, args.function, args.output)
    analyzer.process()

if __name__ == "__main__":
    main()


