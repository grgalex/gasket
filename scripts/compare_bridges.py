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

import utils

log = logging.getLogger(__name__)

JSXRAY_ROOT = '/home/george.alexopoulos/jsxray'

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
        "-i",
        "--input",
        default=None,
        help=("Provide path to the CSV containing the user/repo pairs"),
    )
    return p.parse_args()

class BridgeComparator():
    def __init__(self, packages, output_file):
        self.packages = packages
        self.output_file = output_file
        self.jsxray_dir = os.path.join(JSXRAY_ROOT, 'data/jsxray_bridges')
        self.charon_dir = os.path.join(JSXRAY_ROOT, 'data/charon_bridges')
        self.num_packages = 0
        self.jsxray_total = 0
        self.charon_total = 0
        self.num_packages_jsxray_more = 0
        self.num_packages_charon_more = 0
        self.analyzed_packages = []
        self.differences = []
        self.final_stats = {'num_packages': None,
                            'jsxray_total': None,
                            'charon_total': None,
                            'num_packages_jsxray_more': None,
                            'num_packages_charon_more': None,
                            'num_packages_diff': None,
                            'packages': None,
                            'differences': None
                            }


    def compare_bridges(self):
        for pkg_dirty in self.packages:
            pkg = utils.sanitize_package_name(pkg_dirty)

            jsxray_file = os.path.join(self.jsxray_dir, pkg + '.csv')
            charon_file = os.path.join(self.charon_dir, pkg + '.csv')
            if os.path.exists(jsxray_file):
                self.num_packages += 1
                self.analyzed_packages.append(pkg_dirty)
                jsxray_bridges = utils.load_csv(jsxray_file)
                num_jsxray = len(jsxray_bridges)
                self.jsxray_total += num_jsxray
                if os.path.exists(charon_file):
                    charon_bridges = utils.load_csv(charon_file)
                    num_charon = len(charon_bridges)
                    self.charon_total += num_charon
                else:
                    num_charon = 0
                if num_jsxray > num_charon:
                    self.num_packages_jsxray_more += 1
                    d = {'package': pkg_dirty, 'jsxray': num_jsxray, 'charon': num_charon}
                    self.differences.append(d)
                else if num_charon > num_jsxray:
                    self.num_packages_charon_more += 1
                    d = {'package': pkg_dirty, 'jsxray': num_jsxray, 'charon': num_charon}
                    self.differences.append(d)


    def process(self):
        self.compare_bridges()

        self.final_stats = {'num_packages': self.num_packages,
                            'jsxray_total': self.jsxray_total,
                            'charon_total': self.charon_total,
                            'num_packages_jsxray_more': self.num_packages_jsxray_more,
                            'num_packages_charon_more': self.num_packages_charon_more,
                            'num_packages_diff': len(self.differences),
                            'packages': self.analyzed_packages,
                            'differences': self.differences
                            }

        if self.output_file is None:
            log.info(json.dumps(self.final_stats, indent=2))
        else:
            with open(self.output_file, 'w') as outfile:
                outfile.write(json.dumps(self.final_stats, indent=2))

        return ret

def main():
    args = parse_args()
    setup_logging(args)

    if args.input is None:
        log.error("Must provide input CSV file")
        sys.exit(1)

    package_names = utils.load_csv(args.input)

    # log.info(f"package_names = {package_names}")

    comparator = BridgeComparator(package_names, args.output)
    comparator.process()


if __name__ == "__main__":
    main()

