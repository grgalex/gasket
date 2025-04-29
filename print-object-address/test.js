const addon = require('./build/Release/object_address');

const obj1 = { x: 42 };
const obj2 = { x: 43 };
addon.printObjectAddress(obj1);
addon.printObjectAddress(obj2);
// process.kill(process.pid, 'SIGUSR1');
