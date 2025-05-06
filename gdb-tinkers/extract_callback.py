import gdb

def addr2cb(address):
    try:
        gdb_address = gdb.parse_and_eval(f'({address})')

        # Use GDB's `info symbol` to get the symbol at the address
        symbol_info = gdb.execute(f"set $x = *('v8::internal::JSObject' *){gdb_address}", to_string=True).strip()

        x_printed = gdb.execute(f"print $x", to_string=True).strip()
        print(x_printed)

        job_x = gdb.execute(f"job $x", to_string=True).strip()
        print(job_x)

        # if symbol_info:
        #     print(f'___ADDRESS___{address}___ADDRESS______FUNC___{symbol_info}___FUNC___')
        # else:
        #     print(f'___ADDRESS___{address}___ADDRESS______FUNC___NOTFOUND___FUNC___')
    except gdb.error as e:
        print(f'Error {e}')

gdb.execute('set print demangle off')
gdb.execute('addr2cb(140727662896912)')
gdb.execute('quit')
