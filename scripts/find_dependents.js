import { fetchEcosystemDependents } from '/usr/local/lib/node_modules/list-dependents/index.js';
// import { fetchEcosystemDependents } from 'list-dependents';
import * as fs from 'fs';

var output_file = 'deps-mapbox-node-pre-gyp.json'
var final_result = []
var res

function sleepSync(seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end);
}

var result = fetchEcosystemDependents('@mapbox/node-pre-gyp');

for await (const { downloads, name, pkg, ...rest } of result) {
  res = {'name': name, 'downloads': downloads}
  sleepSync(0.5)
  final_result.push(res)
  console.log(JSON.stringify(res, null, 2))

  if (final_result.length % 100)
    fs.writeFileSync(output_file, JSON.stringify(final_result, null, 2));
}

// for await (const { downloads, name, pkg } of fetchEcosystemDependents('npm-run-all2')) {
//   console.log(downloads, name, pkg.description);
// }
