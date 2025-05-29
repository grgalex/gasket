// dbx::LogMessage
var mg_dbx = require('mg-dbx')
var db = new mg_dbx.dbx()
buf = Buffer.alloc(2 ** 27, 0xFF)
db.logmessage(buf)
