// Set, which calls dbx_create_string
var mg_dbx = require('mg-dbx')
var db = new mg_dbx.dbx()
d = new mg_dbx.mclass(db, 'foo')
d.reset('a'.repeat(512))
