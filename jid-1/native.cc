#include <dlfcn.h>
#include <napi.h>
#include <iostream>
#include <v8.h>

// namespace node {
// 	namespace v8_utils {
// 		std::string deno_jid(void *obj);
//         void jid(const v8::FunctionCallbackInfo<v8::Value>& args);
// 	}
// }

// class CallbackInfoPublic {
// public:
//       CallbackInfoPublic(napi_env env, napi_callback_info info);
//       ~CallbackInfoPublic();
// 
//       Napi::Env Env() const;
//       Napi::Value NewTarget() const;
//       bool IsConstructCall() const;
//       size_t Length() const;
//       const Napi::Value operator[](size_t index) const;
//       Napi::Value This() const;
//       void* Data() const;
//       void SetData(void* data);
//       explicit operator napi_callback_info() const;
// 
// public:  // everything below also public now
//       const size_t _staticArgCount = 6;
//       napi_env _env;
//       napi_callback_info _info;
//       napi_value _this;
//       size_t _argc;
//       napi_value* _argv;
//       napi_value _staticArgs[6]{};
//       napi_value* _dynamicArgs;
//       void* _data;
// };

// extern std::string _v8_internal_Print_Object_To_String(void* object);

// #define _v8_internal_Print_Object _Z25_v8_internal_Print_ObjectPv

// extern "C" {
//     extern void _v8_internal_Print_Object(void* object);
// }

// typedef void (*PrintObjectFn)(void*);
typedef std::string (*PrintObjectFn)(void*);

typedef struct {
      const size_t _staticArgCount = 6;
      napi_env _env;
      napi_callback_info _info;
      napi_value _this;
      size_t _argc;
      napi_value* _argv;
      napi_value _staticArgs[6]{};
      napi_value* _dynamicArgs;
      void* _data;
} CallbackInfoPublic;


Napi::Value jid2(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	std::string ret;
    void* handle = dlopen(NULL, RTLD_LAZY);
    PrintObjectFn print_fn;

    // PrintObjectFn print_fn = (PrintObjectFn)dlsym(handle, "_v8_internal_Print_Object");
	ret = "hello";

    // if (!print_fn)
    print_fn = (PrintObjectFn)dlsym(handle, "_Z35_v8_internal_Print_Object_To_StringPv");

    if (!print_fn) {
        ret = "NULL_DLSYM";
    }

    // PrintObjectFn print_fn = (PrintObjectFn)94265531894588;


    void *y;

    auto new_info = (CallbackInfoPublic&)(info);
	auto x = *(new_info._argv);
	y = *(void **)x;
    // z = *(void **)(x+sizeof(void *))

    // ret = _v8_internal_Print_Object_To_String(y);
    // _v8_internal_Print_Object(y);
    // if (print_fn)
    //     ret = print_fn(y);
	// ret = node::v8_utils::deno_jid(y);
	// node::v8_utils::jid(argz);
    ret = std::to_string(reinterpret_cast<uintptr_t>(y));
out:
	return Napi::String::New(env, ret);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("id", Napi::Function::New(env, jid2));
  return exports;
}

NODE_API_MODULE(native, Init)

