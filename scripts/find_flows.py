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
        self.file2dirty = {}
        self.dirty2clean = {}
        self.dirty2charonbridges = {}
        self.dirty2jsxraybridges = {}

        self.jsxray_no_bridges = []
        self.charon_yes_bridges = []
        self.jsxray_try_build_manually = []
        self.prioritize_manual = []
        self.super_prioritize_manual = []

        self.jsxrayonly = defaultdict(list)
        self.charononly = defaultdict(list)
        self.nobodyfound = defaultdict(list)

        self.charonflows = defaultdict(lambda: defaultdict(int))
        self.jsxrayflows = defaultdict(lambda: defaultdict(int))


        for f in self.files:
            pkg_dirty = os.path.basename(f).removesuffix('_nomit.txt')
            self.packages_dirty.append(pkg_dirty)
            self.file2dirty[f] = pkg_dirty
            self.dirty2clean[pkg_dirty] = pkg_dirty.replace('~', '/')

        self.dirty2flows = defaultdict(lambda: defaultdict(dict))


    def load_flows(self):
        for f in self.files:
            log.info(f"current file: {f}")
            sources = []
            dirty = self.file2dirty[f]
            log.info(dirty)
            with open(f, 'r') as infile:
                text = infile.read()
                matches = re.findall(r"\((.*?)\)", text)
                for line in matches:
                    log.info(line)
                    # Check if JS-style
                    kind = None
                    if '.js' in line:
                        src = line.split(',')[0].lstrip('(')
                        kind = 'JS'
                    else:
                        src = line.split(',')[3]
                        kind = 'CFUNC'

                    if kind == 'JS':
                        if src in self.dirty2flows[dirty]['js'].keys():
                            self.dirty2flows[dirty]['js'][src] += 1
                        else:
                            self.dirty2flows[dirty]['js'][src] = 1
                    elif kind == 'CFUNC':
                        if src in self.dirty2flows[dirty]['cfunc'].keys():
                            self.dirty2flows[dirty]['cfunc'][src] += 1
                        else:
                            self.dirty2flows[dirty]['cfunc'][src] = 1

    def load_bridges(self):
        for p in self.packages_dirty:
            charon_file = f"/home/george.alexopoulos/jsxray/data/charon_bridges/{p}.txt"
            jsxray_file = f"/home/george.alexopoulos/jsxray/data/jsxray_bridges/{p}.txt"

            cb = []
            if os.path.exists(charon_file):
                charon_bridges_raw = utils.load_csv(charon_file)
                self.charon_yes_bridges.append(self.dirty2clean[p])
                for raw in charon_bridges_raw:
                    jsname = raw.split(',')[0].lstrip('(')
                    cfunc = raw.split(',')[1].rstrip(')')
                    cb.append((jsname, cfunc))
            else:
                self.prioritize_manual.append(p)
            jb = []
            if os.path.exists(jsxray_file):
                jsxray_bridges_raw = utils.load_csv(jsxray_file)
                for raw in jsxray_bridges_raw:
                    jsname = raw.split(',')[0].lstrip('(')
                    cfunc = raw.split(',')[1].rstrip(')')
                    jb.append((jsname, cfunc))
            else:
                self.jsxray_no_bridges.append(self.dirty2clean[p])
                clean = self.dirty2clean[p]
                if clean in self.charon_yes_bridges:
                    self.jsxray_try_build_manually.append(clean)

            self.dirty2charonbridges[p] = cb
            self.dirty2jsxraybridges[p] = jb
    
    def assess_vulns(self):
       for p, flows in self.dirty2flows.items():
           cb = self.dirty2charonbridges[p]
           jb = self.dirty2jsxraybridges[p]

           if 'js' in flows.keys():
               for func, count in flows['js'].items():
                   charon_found = False
                   jsxray_found = False
                   if any(func in b[0] for b in cb):
                       self.charonflows[p][func] = count
                       charon_found = True
                   if any(func in b[0] for b in jb):
                       self.jsxrayflows[p][func] = count
                       jsxray_found = True

                   if jsxray_found and not charon_found:
                       self.jsxrayonly[p].append(func)
                   elif charon_found and not jsxray_found:
                       self.charononly[p].append(func)
                   elif not jsxray_found and not charon_found and self.dirty2clean[p] not in self.jsxray_no_bridges:
                       self.nobodyfound[p].append(func)

           if 'cfunc' in flows.keys():
               charon_found = False
               jsxray_found = False
               for func, count in flows['cfunc'].items():
                   if any(func in b[1] for b in cb):
                       self.charonflows[p][func] = count
                       charon_found = True
                   if any(func in b[1] for b in jb):
                       self.jsxrayflows[p][func] = count
                       jsxray_found = True

                   if jsxray_found and not charon_found:
                       self.jsxrayonly[p].append(func)
                   elif charon_found and not jsxray_found and self.dirty2clean[p] not in self.jsxray_no_bridges:
                       self.charononly[p].append(func)
                   elif not jsxray_found and not charon_found and self.dirty2clean[p] not in self.jsxray_no_bridges:
                       self.nobodyfound[p].append(func)

           if p not in self.charonflows.keys() and self.dirty2clean[p] in self.jsxray_no_bridges:
               self.super_prioritize_manual.append(p)

    def process(self):
        self.load_flows()

        # log.info(self.dirty2flows)
        self.load_bridges()

        log.info(f"NUM ALL: {len(self.packages_dirty)}")
        log.info(f"NUM JSXRAY NO BRIDGES: {len(self.jsxray_no_bridges)}")
        log.info(f"NUM CHARON YES BRIDGES: {len(self.charon_yes_bridges)}")
        log.info(f"NUM JSXRAY TRY BUILD: {len(self.jsxray_try_build_manually)}")
        log.info(f"NUM JSXRAY SUPER PRIORITIZE MANUAL: {len(self.super_prioritize_manual)}")
        log.info(f"NUM JSXRAY PRIORITIZE MANUAL: {len(self.prioritize_manual)}")

        self.assess_vulns()

        self.jsxray_results = {}
        self.charon_results = {}

        self.jsxray_results['num_packages'] = len(self.jsxrayflows.keys())
        self.jsxray_results['num_flows'] = 0

        for p in self.jsxrayflows.keys():
            for f in self.jsxrayflows[p].keys():
                self.jsxray_results['num_flows'] += self.jsxrayflows[p][f]
        
        self.charon_results['num_packages'] = 0
        self.charon_results['num_flows'] = 0

        for p in self.charonflows.keys():
            if self.dirty2clean[p] in self.jsxray_no_bridges:
                continue
            self.charon_results['num_packages'] += 1
            for f in self.charonflows[p].keys():
                self.charon_results['num_flows'] += self.charonflows[p][f]

        log.info(f"JSXRAY: {self.jsxray_results}")
        log.info(f"CHARON: {self.charon_results}")
        log.info(f"JSXRAY ONLY: {len(self.jsxrayonly.keys())}")

        self.results = {'packages_with_flows': len(self.packages_dirty),
                        'num_jsxray_missing_bridges_file': len(self.jsxray_no_bridges),
                        'num_jsxray_try_build': len(self.jsxray_try_build_manually),
                        'num_jsxray_super_prioritize': len(self.super_prioritize_manual),
                        'num_jsxray_prioritize': len(self.prioritize_manual),
                        'jsxray_results': self.jsxray_results,
                        'charon_results': self.charon_results,
                        'num_jsxray_only': len(self.jsxrayonly.keys()),
                        'num_charon_only': len(self.charononly.keys()),
                        'num_nobody_found': len(self.nobodyfound.keys()),
                        'jsxray_only': self.jsxrayonly,
                        'nobody_found': self.nobodyfound
        }

        if self.output_file is not None:
            with open(self.output_file, 'w') as outfile:
                outfile.write(json.dumps(self.results, indent=4))
        else:
            log.info(json.dumps(self.results, indent=2))


def main():
    args = parse_args()
    setup_logging(args)

    vf = VulnFinder(args.output)
    vf.process()

if __name__ == "__main__":
    main()

