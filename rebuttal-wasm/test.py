import os
import argparse

def find_node_modules_children(root_dir):
    result = {}
    for dirpath, dirnames, _ in os.walk(root_dir):
        if os.path.basename(dirpath) == "node_modules":
            children = []
            for name in os.listdir(dirpath):
                full_path = os.path.join(dirpath, name)
                if os.path.isdir(full_path):
                    if name.startswith("@"):  # scoped packages
                        for scoped_name in os.listdir(full_path):
                            scoped_path = os.path.join(name, scoped_name)
                            children.append(scoped_path)
                    else:
                        children.append(name)
            result[dirpath] = children
    return result

def parse_args():
    p = argparse.ArgumentParser(description='backward edges')
    p.add_argument(
        "-l",
        "--log",
        default="info",
        help=("Provide logging level. Example --log debug"),
    )
    p.add_argument(
        "-r",
        "--root",
        default=None,
        help=("root."),
    )
    p.add_argument(
        "-o",
        "--output",
        default=False,
        help=("Output file."),
    )
    return p.parse_args()

# Example usage:
if __name__ == "__main__":
    args = parse_args()
    unique_packages = set()
    root = args.root
    nm_children = find_node_modules_children(root)
    for nm_dir, children in nm_children.items():
        for child in children:
            unique_packages.add(child)
            print(f"  {child}")
    print(unique_packages)
    print(len(unique_packages))
    with open('uniq.txt', 'w') as outfile:
        outfile.write(str(len(unique_packages)))
