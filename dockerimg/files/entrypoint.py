#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import grp
import pwd
import json
import subprocess

GROUP_NAME = "dev"
GROUP_SUDO = "sudo"
BASH_PATH = "/bin/bash"
SUDO_PATH = "/etc/sudoers.d/"


def set_user(user, uid, gid, home_dir):
    try:
        info = pwd.getpwnam(user)
    except KeyError:
        subprocess.run(["useradd", "--shell", BASH_PATH, "-u", str(uid),
                        "-o", "-c", "", "-m", "-g", str(gid), "-d", home_dir,
                        user], check=True)
    else:
        if info.pw_uid != uid:
            msg = ("User `%s' exists in `dev' but its id `%s' differs than"
                   " the expected `%s'" % (user, info.pw_uid, uid))
            raise RuntimeError(msg)
        if info.pw_gid != gid:
            msg = ("User `%s' exists in `dev' but its primary group id"
                   " `%s' differs than the expected `%s'"
                   % (user, info.pw_gid, gid))
            raise RuntimeError(msg)
        if info.pw_dir != home_dir:
            msg = ("User `%s' exists in `dev' but its home directory `%s'"
                   " differs than the expected `%s'"
                   % (user, info.pw_dir, home_dir))
            raise RuntimeError(msg)


def configure_sudo(user):
    subprocess.run(["usermod", "-aG", GROUP_SUDO, user], check=True)
    # Set the group GROUP_SUDO to be able to run sudo without authenticating
    with open(SUDO_PATH + user, "w") as f:
        f.write("%" + GROUP_SUDO + " ALL=(ALL) NOPASSWD:ALL\n")


def ensure_gid_exists(gid, group):
    try:
        group = grp.getgrgid(gid).gr_name
    except KeyError:
        subprocess.run(["groupadd", group, "-g", str(gid)], check=True)

    return group




def configure_ssh_auth_sock(gid):
    ssh_auth_sock = os.environ.get("SSH_AUTH_SOCK")
    if not ssh_auth_sock:
        msg = ("SSH_AUTH_SOCK env var is not set, skipping configuring access"
               " to the SSH agent\n")
        sys.stderr.write(msg)
        return

    subprocess.run(["chgrp", str(gid), ssh_auth_sock], check=True)
    subprocess.run(["chmod", "g+w", ssh_auth_sock], check=True)


def main():
    uid = int(os.environ["UID"])
    gid = int(os.environ["GID"])
    user = os.environ["USER"]
    home_dir = os.environ["HOME"]
    ensure_gid_exists(gid, GROUP_NAME)

    set_user(user, uid, gid, home_dir)

    configure_sudo(user)

    configure_ssh_auth_sock(gid)

    os.chdir(home_dir)
    exec_args = ["/usr/sbin/gosu", "/usr/sbin/gosu", user, BASH_PATH]
    os.execl(*exec_args)


if __name__ == "__main__":
    sys.exit(main())
