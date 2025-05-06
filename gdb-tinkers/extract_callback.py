import gdb

def addr2cb(address):
    try:
        gdb_address = gdb.parse_and_eval(f'({address})')

        # Use GDB's `info symbol` to get the symbol at the address
        set_x = gdb.execute(f"set $x = *('v8::internal::JSObject' *){gdb_address}", to_string=True).strip()
        print(f'Result of set x : {set_x}')

        x_printed = gdb.execute(f"print $x", to_string=True).strip()
        print(f'Result of print x : {x_printed}')

        job_x = gdb.execute(f"set $y =  _v8_internal_Print_Object_To_String((void*)($x))", to_string=True).strip()
        y_printed = gdb.execute(f"print $y", to_string=True).strip()
        print(f'Result of print y : {y_printed}')
        # job_x = gdb.execute(f"job $x", to_string=True)
        print(job_x)
        # print(f'Result of print job : {job_x}')

        print('AFTER JOB')

        # if symbol_info:
        #     print(f'___ADDRESS___{address}___ADDRESS______FUNC___{symbol_info}___FUNC___')
        # else:
        #     print(f'___ADDRESS___{address}___ADDRESS______FUNC___NOTFOUND___FUNC___')
    except gdb.error as e:
        print(f'Error {e}')

gdb.execute('set print demangle off')
addr2cb(140725615296656)
# gdb.execute('quit')
