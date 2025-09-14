const v8 = require('v8')

// const sqlite3 = require('/home/george.alexopoulos/jsxray/data/RQ1/t22/node_modules/sqlite3/build/Release/node_sqlite3.node')
const foo = require('/home/george.alexopoulos/jsxray/data/t99/node_modules/ivm-inspect/build/Debug/binding.node')

x = v8.get_objects()
y = JSON.parse(x)

for (const i of y) {
	z = v8.job_addr(i)
	if (z.includes("JSFunction")) {
		console.log(z)
	}
}
