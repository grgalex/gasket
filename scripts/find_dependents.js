import { fetchEcosystemDependents } from 'list-dependents';
import * as fs from 'fs';

var output_file = 'nan.json'
var final_result = []
var res

var result = fetchEcosystemDependents('nan');

for await (const { downloads, name, pkg, ...rest } of result) {
  res = {'name': name, 'downloads': downloads}
  final_result.push(res)
  console.log(JSON.stringify(res, null, 2))

  if (final_result.length % 100)
    fs.writeFileSync(output_file, JSON.stringify(final_result, null, 2));
}

// for await (const { downloads, name, pkg } of fetchEcosystemDependents('npm-run-all2')) {
//   console.log(downloads, name, pkg.description);
// }
