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

NOMIT_ROOT = '/home/george.alexopoulos/jsxray/data/charon_nomit'


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
        "-o",
        "--output",
        default=None,
        help=("Output file"),
    )
    return p.parse_args()

class VulnFinder():
    def __init__(self, output_file):
        self.output_file = output_file
        self.files = [os.path.join(NOMIT_ROOT, f) for f in os.listdir(NOMIT_ROOT) if os.path.isfile(os.path.join(NOMIT_ROOT, f))]
        self.packages_dirty = []
        self.dirty2clean = {}
        for f in self.files:
            pkg_dirty = os.path.basename(f).rstrip('_nomit.txt')
            self.packages_dirty.append(pkg_dirty)
            self.f2d[f] = pkg_dirty
            self.d2c[pkg_dirty] = pkg_dirty.replace('~', '/')

        self.dirty2flows = defaultdict(defaultdict(int))


    def load_flows(self):
        for f in self.files:
            sources = []
            pkg_dirty = f2d[f]
            with open(f, 'r') as infile:
                for line in infile:
                    # Check if JS-style
                    if '.js' in line:
                        src = line.split(',')[0].lstrip('(')
                    else:
                        src = line.split(',')[3]

                    self.dirty2flows[dirty][src] += 1

    def process(self):

        load_flows()

        log.info(self.dirty2flows)

        return ret

def main():
    args = parse_args()
    setup_logging(args)

    vf = VulnFinder(args.output)
    vf.process()

if __name__ == "__main__":
    main()

