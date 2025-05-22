import os
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

PRV_PYHIDRA_ROOT = '/prv-pyhidra-cg'

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
    p.add_argument(
        "-A",
        "--always",
        default=False,
        action='store_true',
        help=("Always generate artifacts, never reuse existing stuff."),
    )
    return p.parse_args()

class JavascriptBridger():
    def __init__(self, package, always):
        self.always = always
        self.package = package
        self.sanitized_package = utils.sanitize_package_name(self.package)
        self.name = package.split(':')[0]
        self.sname = sanitized_package.split(':')[0]
        self.version = package.split(':')[1]
        self.sversion = sanitized_package.split(':')[0]

        self.n2cgpath = None

        self.namesnip = self.name[0] + '/' + self.sname + '/' + self.sversion

        self.tempinst_uuid = self.sname + '___' + self.sversion
        self.tmp_install_dir_root = os.path.join(JSXRAY_ROOT, 'data/install')
        self.tmp_install_dir = os.path.join(self.tmp_install_dir_root, self.tempinst_uuid)

        self.pkg_inner_dir = os.path.join(self.tmp_install_dir, 'node_modules', self.name)

        self.bridges_root = os.path.join(JSXRAY_ROOT, 'data/bridges')
        self.bridges_apps_root = os.path.join(JSXRAY_ROOT, 'data/bridges/npm')
        self.bridges_dir = os.path.join(self.bridges_apps_root, self.namesnip)
        self.bridges_path = os.path.join(self.bridges_dir, 'bridges.json')

        self.bridges_csv_dir = os.path.join(JSXRAY_ROOT, 'data/jsxray_bridges')
        utils.create_dir(self.bridges_csv_dir)
        self.bridges_csv_path = os.path.join(self.bridges_csv_dir, self.sname + '.csv')

        utils.create_dir(os.path.join(self.bridges_apps_root, self.namesnip))

    def install_package(self):
        log.info(f"Installing {self.package}")
        if os.path.exists(self.tmp_install_dir) and not self.always:
            log.info(f"Temp install dir for {self.package} already exists at {self.tmp_install_dir} - Skipping...")
            log.info(f"Use -A to force recreation.")
            return 0
        else:
            utils.create_dir(self.tmp_install_dir)
            cmd = [
                'npm',
                'install',
                '--prefix', self.tmp_install_dir,
                "{}@{}".format(self.name, self.version)
            ]
            log.info(cmd)
            try:
                ret, out, err = utils.run_cmd(cmd)
            except Exception as e:
                log.error(e)
                return -1
            if ret != 0:
                log.error(f"cmd {cmd} returned non-zero exit code {ret}")
                log.info(out)
                log.info(err)
                if os.path.exists(self.tmp_install_dir):
                    shutil.rmtree(self.tmp_install_dir)
                return ret
            return 0

    def find_bridges(self):
        log.info(f"Generating bridges for {self.package}")
        bridges_dir = self.bridges_dir
        if not os.path.exists(bridges_dir):
            utils.create_dir(bridges_dir)
        bridges_path = self.bridges_path
        cmd = [
            'node_g',
            'analyze_module.js',
            '-r', self.pkg_inner_dir,
            '-o', self.bridges_path
        ]
        log.info(cmd)
        try:
            ret, out, err = utils.run_cmd(cmd)
        except Exception as e:
            log.error(e)
            return -1
        if ret != 0:
            log.error(f"cmd {cmd} returned non-zero exit code {ret}")
            log.info(out)
            log.info(err)
            return ret

        return 0

    def generate_bridges_csv(self):
        log.info(f"Generating CSV bridges for {self.package}")
        bridges_json_path = self.bridges_path
        bridges_new = []
        with open(bridges_json_path, 'r') as infile:
            bridges_orig_raw = json.loads(infile.read())
        bridges_orig = bridges_oriw_raw['bridges']
        for b in bridges_orig:
            jsname = b['jsname']
            cfunc = b['cfunc']

            # XXX: Keep only basename
            new_jsname = jsname.split('.')[-1]
            # XXX: Keep only "last" function name.
            #      Obliterate namespaces ("::")
            #      Obliterate arg types ("(int...)")
            match = re.search(r"(?:\w+::)?(\w+)(?:\(|$)", cfunc)
            if match:
                new_cfunc = match.group(1)
            else:
                log.error(f"Couldn't exract new jsname/cfunc for bridge: {b}")
                return -1

            bridges_new.append({'jsname': new_jsname, 'cfunc': new_cfunc})

        with open(self.bridges_csv_path, 'w') as outfile:
            for bn in bridges_new:
                j = bn['jsname']
                c = bn['cfunc']
                outfile.write(f'({j},{c})\n')
            outfile.flush()

    def process(self):
        log.info(f"Processing 'package': {self.package}")

        ret = self.install_package()
        if ret != 0:
            return ret

        ret = self.find_bridges()
        if ret != 0:
            return ret

        ret = self.generate_bridges_csv()
        if ret != 0:
            return ret

        return ret

def do_single(p, always):
    log.info(f"Processing 'package' {p}")
    bridger = JavascriptBridger(p, always)
    bridger.process()

def main():
    args = parse_args()
    setup_logging(args)

    if args.input is None:
        log.error("Must provide input CSV file")
        sys.exit(1)

    package_names = utils.load_csv(args.input)
    # raw_package_names = []

    # for p in raw_package_names:
    #     sanitized = utils.sanitize_package_name(p)
    #     package_names.append(sanitized)

    log.info(f"package_names = {package_names}")

    for pkg in package_names:
        do_single(pkg, args.always)

    # with concurrent.futures.ProcessPoolExecutor(max_workers=20) as executor:
    #     for pkg in package_names:
    #         executor.submit(do_single, pkg, args.always, False, args.binary_always)

if __name__ == "__main__":
    main()

