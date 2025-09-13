#include <dlfcn.h>
#include <napi.h>
#include <iostream>
#include <v8.h>

#include <regex>
#include <vector>
#include <sstream>

typedef std::string (*PrintObjectFn)(void*);
PrintObjectFn print_fn;


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


void* extract_sfi_pointer(const std::string& input) {
    std::regex pattern(R"(shared_info:\s*0x([0-9a-fA-F]+))");
    std::smatch match;

    if (std::regex_search(input, match, pattern) && match.size() > 1) {
        std::string hex_str = match[1].str();
        std::uintptr_t address = std::stoull(hex_str, nullptr, 16);
        return reinterpret_cast<void*>(address);
    }

    return nullptr; // Not found
}


void* extract_fti_pointer(const std::string& input) {
    std::regex pattern(R"(function_data:\s*0x([0-9a-fA-F]+)\s<FunctionTemplateInfo)");
    std::smatch match;

    if (std::regex_search(input, match, pattern) && match.size() > 1) {
        std::string hex_str = match[1].str();
        std::uintptr_t address = std::stoull(hex_str, nullptr, 16);
        return reinterpret_cast<void*>(address);
    }

    return nullptr; // Not found
}

std::string extract_callback_and_overloads_json(const std::string& input) {
    std::string callback = "NONE";
    std::vector<void*> overloads;

	// std::cout << "FTI string: " << input << std::endl;

    // Match callback
    std::regex callback_regex(R"(___CALLBACK___(.*?)___CALLBACK___)");
    std::smatch callback_match;
    if (std::regex_search(input, callback_match, callback_regex)) {
        callback = callback_match[1].str();
    }

    // Match overload block and extract addresses
    std::regex overload_block_regex(R"(___OVERLOADS___([\s\S]*?)___OVERLOADS___)");
    std::smatch overload_block_match;
    if (std::regex_search(input, overload_block_match, overload_block_regex)) {
        std::string block = overload_block_match[1].str();
  	    // std::cout << "overloads block: " << block << std::endl;

        std::regex addr_regex(R"(0x[0-9a-fA-F]+)");
        auto begin = std::sregex_iterator(block.begin(), block.end(), addr_regex);
        auto end = std::sregex_iterator();

        for (auto it = begin; it != end; ++it) {
		    std::string addr_str = it->str();
        	void* ptr = reinterpret_cast<void*>(std::stoull(addr_str, nullptr, 16));
            overloads.push_back(ptr);
        }
    }

    std::vector<std::string> overload_funcs;
	overload_funcs = extract_foreign_data_addresses(overloads);

    // Construct JSON string manually
    std::ostringstream oss;
    oss << "{\n";
    oss << "  \"callback\": \"" << callback << "\",\n";
    oss << "  \"overloads\": [";
    for (size_t i = 0; i < overload_funcs.size(); ++i) {
        oss << "\"" << overload_funcs[i] << "\"";
        if (i < overload_funcs.size() - 1) oss << ", ";
    }
    oss << "]\n}";
    return oss.str();
}


Napi::Value getcb(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	std::string msg;

    void *address;
    auto new_info = (CallbackInfoPublic&)(info);
	auto x = *(new_info._argv);
	address = *(void **)x;

    void *jsfunc_addr;
    void *sfi_addr;
    void *fti_addr;

    if (info.Length() < 1) {
		Napi::TypeError::New(env, "Expected 1 argument").ThrowAsJavaScriptException();
		return env.Null();
	}

    if (!info[0]->IsObject()) {
		Napi::TypeError::New(env, "Not an object").ThrowAsJavaScriptException();
		return env.Null();
    }

    std::cout << "V8 Object Address: " << address << std::endl;

    jsfunc_addr = *(void**)address;

    if (!jsfunc_addr)
        goto out_with_null;

    msg = print_fn(jsfunc_addr);

    sfi_addr = extract_sfi_pointer(msg);

    if (!sfi_addr)
        goto out_with_null;

    msg = print_fn(sfi_addr);

    fti_addr = extract_fti_pointer(msg);

    if (!fti_addr)
        goto out_with_null;

    msg = print_fn(fti_addr);

    msg = extract_callback_and_overloads_json(msg);

    goto out;

out_with_null:
    msg = "NONE";
	return Napi::String::New(env, msg);
out:
  return Napi::String::New(env, msg);
}


Napi::Value jid2(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();
	std::string ret;
    void* handle = dlopen(NULL, RTLD_LAZY);
    PrintObjectFn print_fn;
    void *y;
    auto new_info = (CallbackInfoPublic&)(info);
	auto x = *(new_info._argv);

    if (!print_fn)
		print_fn = (PrintObjectFn)dlsym(handle, "_Z35_v8_internal_Print_Object_To_StringPv");

	y = *(void **)x;
    ret = std::to_string(reinterpret_cast<uintptr_t>(y));

	return Napi::String::New(env, ret);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("id", Napi::Function::New(env, jid2));
  return exports;
}

NODE_API_MODULE(native, Init)

