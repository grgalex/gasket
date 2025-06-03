import json
import requests

FILE = 'node-lmdb.json'

def get_weekly_downloads(package_name):
    url = f"https://api.npmjs.org/downloads/point/last-week/{package_name}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        return data.get("downloads", 0)
    except Exception as e:
        print(f"Error retrieving {package_name}: {e}")
        return 0

def sort_packages_by_downloads(package_names):
    download_data = [
        (pkg, get_weekly_downloads(pkg)) for pkg in package_names
    ]
    return sorted(download_data, key=lambda x: x[1], reverse=True)

# Example usage:

with open(FILE, 'r') as infile:
    dat = json.loads(infile.read())

pkgs_with_versions = dat['call_vuln']
pkgs = []
for p in pkgs_with_versions:
    second_at_index = p.find('@', 1)  # Find the second '@'
    if second_at_index != -1:
        result = p[:second_at_index]
    else:
        result = result.split('@')[0]  # Only one '@' present, take the whole string
    pkgs.append(result)

sorted_downloads = sort_packages_by_downloads(pkgs)

for name, count in sorted_downloads:
    print(f"{name}: {count:,} downloads last week")
