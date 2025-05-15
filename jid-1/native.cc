#include <napi.h>
#include <iostream>
#include <v8.h>
namespace node {
	namespace v8_utils {
		void deno_jid(void *obj);
	}
}
Napi::Value jid2(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	std::string ret;
	// auto x = *(info._argv);
	// y = *(void **)x;
	// ret = node::v8_utils::deno_jid(y);
	ret = "hello";
	return Napi::String::New(env, ret);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("id", Napi::Function::New(env, jid2));
  return exports;
}

NODE_API_MODULE(native, Init)

