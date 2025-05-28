var ckmeans = require('./ckmeans.js')

// var arr = new Array(2 ** 32 - 1)
var arr = new Array(2 ** 20)
console.log(arr.length)
var nclusters = 2 ** 20

var result = ckmeans(arr, nclusters);
