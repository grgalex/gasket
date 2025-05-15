#include <napi.h>
#include <iostream>
#include <v8.h>

namespace node {
	namespace v8_utils {
		std::string deno_jid(void *obj);
        void jid(const v8::FunctionCallbackInfo<v8::Value>& args);
	}
}

class CallbackInfoPublic {
public:
      CallbackInfoPublic(napi_env env, napi_callback_info info);
      ~CallbackInfoPublic();

      Napi::Env Env() const;
      Napi::Value NewTarget() const;
      bool IsConstructCall() const;
      size_t Length() const;
      const Napi::Value operator[](size_t index) const;
      Napi::Value This() const;
      void* Data() const;
      void SetData(void* data);
      explicit operator napi_callback_info() const;

public:  // everything below also public now
      const size_t _staticArgCount = 6;
      napi_env _env;
      napi_callback_info _info;
      napi_value _this;
      size_t _argc;
      napi_value* _argv;
      napi_value _staticArgs[6]{};
      napi_value* _dynamicArgs;
      void* _data;
};

Napi::Value jid2(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	std::string ret;

    void *y;

    auto new_info = (CallbackInfoPublic&)(info);
	auto x = *(new_info._argv);
	y = *(void **)x;
	ret = node::v8_utils::deno_jid(y);
	// node::v8_utils::jid(argz);
	// ret = "hello";
	return Napi::String::New(env, ret);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("id", Napi::Function::New(env, jid2));
  return exports;
}

NODE_API_MODULE(native, Init)

