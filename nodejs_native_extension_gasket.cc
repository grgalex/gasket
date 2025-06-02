// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
#include "node_v8.h"
#include "aliased_buffer-inl.h"
#include "base_object-inl.h"
#include "env-inl.h"
#include "memory_tracker-inl.h"
#include "node.h"
#include "node_external_reference.h"
#include "util-inl.h"
#include "v8.h"

#include <regex>
#include <vector>
#include <sstream>

// XXX: CallbackBundle. For fcb_invoke extraction
#include <node_api.h>
class CallbackBundle {
 public:
  static v8::Local<v8::Value> New(napi_env env, napi_callback cb, void* data);
  static CallbackBundle* FromCallbackData(v8::Local<v8::Value> data);

  napi_env env;
  void* cb_data;
  napi_callback cb;

 private:
  static void Delete(napi_env env, void* data, void* hint);
};

/*
 * Pseudo-declaration adapted from napi-inl.h from node-addon-api:
 *
template <typename Callable, typename Return>
struct CallbackData {
  static inline napi_value Wrapper(napi_env env, napi_callback_info info) {
    return details::WrapCallback(env, [&] {
      CallbackInfo callbackInfo(env, info);
      CallbackData* callbackData =
          static_cast<CallbackData*>(callbackInfo.Data());
      callbackInfo.SetData(callbackData->data);
      return callbackData->callback(callbackInfo);
    });
  }

  Callable callback;
  void* data;
};
*/
typedef struct {
	void *callback;
	void *data;
} Napi_CallbackData;


extern std::string _v8_internal_Print_Object_To_String(void* object);

namespace node {
namespace v8_utils {
using v8::Array;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::HandleScope;
using v8::HeapCodeStatistics;
using v8::HeapSpaceStatistics;
using v8::HeapStatistics;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::ScriptCompiler;
using v8::String;
using v8::Uint32;
using v8::V8;
using v8::Value;

#define HEAP_STATISTICS_PROPERTIES(V)                                          \
  V(0, total_heap_size, kTotalHeapSizeIndex)                                   \
  V(1, total_heap_size_executable, kTotalHeapSizeExecutableIndex)              \
  V(2, total_physical_size, kTotalPhysicalSizeIndex)                           \
  V(3, total_available_size, kTotalAvailableSize)                              \
  V(4, used_heap_size, kUsedHeapSizeIndex)                                     \
  V(5, heap_size_limit, kHeapSizeLimitIndex)                                   \
  V(6, malloced_memory, kMallocedMemoryIndex)                                  \
  V(7, peak_malloced_memory, kPeakMallocedMemoryIndex)                         \
  V(8, does_zap_garbage, kDoesZapGarbageIndex)                                 \
  V(9, number_of_native_contexts, kNumberOfNativeContextsIndex)                \
  V(10, number_of_detached_contexts, kNumberOfDetachedContextsIndex)           \
  V(11, total_global_handles_size, kTotalGlobalHandlesSizeIndex)               \
  V(12, used_global_handles_size, kUsedGlobalHandlesSizeIndex)                 \
  V(13, external_memory, kExternalMemoryIndex)

#define V(a, b, c) +1
static constexpr size_t kHeapStatisticsPropertiesCount =
    HEAP_STATISTICS_PROPERTIES(V);
#undef V

#define HEAP_SPACE_STATISTICS_PROPERTIES(V)                                   \
  V(0, space_size, kSpaceSizeIndex)                                           \
  V(1, space_used_size, kSpaceUsedSizeIndex)                                  \
  V(2, space_available_size, kSpaceAvailableSizeIndex)                        \
  V(3, physical_space_size, kPhysicalSpaceSizeIndex)

#define V(a, b, c) +1
static constexpr size_t kHeapSpaceStatisticsPropertiesCount =
    HEAP_SPACE_STATISTICS_PROPERTIES(V);
#undef V

#define HEAP_CODE_STATISTICS_PROPERTIES(V)                                     \
  V(0, code_and_metadata_size, kCodeAndMetadataSizeIndex)                      \
  V(1, bytecode_and_metadata_size, kBytecodeAndMetadataSizeIndex)              \
  V(2, external_script_source_size, kExternalScriptSourceSizeIndex)            \
  V(3, cpu_profiler_metadata_size, kCPUProfilerMetaDataSizeIndex)

#define V(a, b, c) +1
static const size_t kHeapCodeStatisticsPropertiesCount =
    HEAP_CODE_STATISTICS_PROPERTIES(V);
#undef V

BindingData::BindingData(Realm* realm,
                         Local<Object> obj,
                         InternalFieldInfo* info)
    : SnapshotableObject(realm, obj, type_int),
      heap_statistics_buffer(realm->isolate(),
                             kHeapStatisticsPropertiesCount,
                             MAYBE_FIELD_PTR(info, heap_statistics_buffer)),
      heap_space_statistics_buffer(
          realm->isolate(),
          kHeapSpaceStatisticsPropertiesCount,
          MAYBE_FIELD_PTR(info, heap_space_statistics_buffer)),
      heap_code_statistics_buffer(
          realm->isolate(),
          kHeapCodeStatisticsPropertiesCount,
          MAYBE_FIELD_PTR(info, heap_code_statistics_buffer)) {
  Local<Context> context = realm->context();
  if (info == nullptr) {
    obj->Set(context,
             FIXED_ONE_BYTE_STRING(realm->isolate(), "heapStatisticsBuffer"),
             heap_statistics_buffer.GetJSArray())
        .Check();
    obj->Set(
           context,
           FIXED_ONE_BYTE_STRING(realm->isolate(), "heapCodeStatisticsBuffer"),
           heap_code_statistics_buffer.GetJSArray())
        .Check();
    obj->Set(
           context,
           FIXED_ONE_BYTE_STRING(realm->isolate(), "heapSpaceStatisticsBuffer"),
           heap_space_statistics_buffer.GetJSArray())
        .Check();
  } else {
    heap_statistics_buffer.Deserialize(realm->context());
    heap_code_statistics_buffer.Deserialize(realm->context());
    heap_space_statistics_buffer.Deserialize(realm->context());
  }
  heap_statistics_buffer.MakeWeak();
  heap_space_statistics_buffer.MakeWeak();
  heap_code_statistics_buffer.MakeWeak();
}

bool BindingData::PrepareForSerialization(Local<Context> context,
                                          v8::SnapshotCreator* creator) {
  DCHECK_NULL(internal_field_info_);
  internal_field_info_ = InternalFieldInfoBase::New<InternalFieldInfo>(type());
  internal_field_info_->heap_statistics_buffer =
      heap_statistics_buffer.Serialize(context, creator);
  internal_field_info_->heap_space_statistics_buffer =
      heap_space_statistics_buffer.Serialize(context, creator);
  internal_field_info_->heap_code_statistics_buffer =
      heap_code_statistics_buffer.Serialize(context, creator);
  // Return true because we need to maintain the reference to the binding from
  // JS land.
  return true;
}

void BindingData::Deserialize(Local<Context> context,
                              Local<Object> holder,
                              int index,
                              InternalFieldInfoBase* info) {
  DCHECK_IS_SNAPSHOT_SLOT(index);
  HandleScope scope(context->GetIsolate());
  Realm* realm = Realm::GetCurrent(context);
  // Recreate the buffer in the constructor.
  InternalFieldInfo* casted_info = static_cast<InternalFieldInfo*>(info);
  BindingData* binding =
      realm->AddBindingData<BindingData>(holder, casted_info);
  CHECK_NOT_NULL(binding);
}

InternalFieldInfoBase* BindingData::Serialize(int index) {
  DCHECK_IS_SNAPSHOT_SLOT(index);
  InternalFieldInfo* info = internal_field_info_;
  internal_field_info_ = nullptr;
  return info;
}

void BindingData::MemoryInfo(MemoryTracker* tracker) const {
  tracker->TrackField("heap_statistics_buffer", heap_statistics_buffer);
  tracker->TrackField("heap_space_statistics_buffer",
                      heap_space_statistics_buffer);
  tracker->TrackField("heap_code_statistics_buffer",
                      heap_code_statistics_buffer);
}

void CachedDataVersionTag(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Local<Integer> result =
      Integer::NewFromUnsigned(env->isolate(),
                               ScriptCompiler::CachedDataVersionTag());
  args.GetReturnValue().Set(result);
}

void SetHeapSnapshotNearHeapLimit(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsUint32());
  Environment* env = Environment::GetCurrent(args);
  uint32_t limit = args[0].As<v8::Uint32>()->Value();
  CHECK_GT(limit, 0);
  env->AddHeapSnapshotNearHeapLimitCallback();
  env->set_heap_snapshot_near_heap_limit(limit);
}

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

std::vector<std::string> extract_foreign_data_addresses(const std::vector<void*>& overloads) {
  std::vector<std::string> results;
  std::regex address_regex(R"(foreign address\s*:\s*(0x[0-9a-fA-F]+))");

  for (void* ptr : overloads) {
    std::string output = _v8_internal_Print_Object_To_String(ptr);

    std::smatch match;
    if (std::regex_search(output, match, address_regex)) {
      results.push_back(match[1].str());
    } else {
      results.push_back("UNKNOWN");
    }
  }

  return results;
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

void* extract_callback_data_from_sfi(const std::string& input) {

    // Match callback_data
    std::regex callback_regex(R"(___CALLBACK_DATA___(.*?)___CALLBACK_DATA___)");
    std::smatch callback_match;
    if (std::regex_search(input, callback_match, callback_regex)) {
        std::string hex_str = callback_match[1].str();
        std::uintptr_t address = std::stoull(hex_str, nullptr, 16);
        return reinterpret_cast<void*>(address);
    }

    return nullptr;
}

void* extract_external_value_from_js_external_object(const std::string& input) {
    // XXX: external value
    std::regex callback_regex(R"(___EXTERNAL_VALUE___(.*?)___EXTERNAL_VALUE___)");
    std::smatch callback_match;
    if (std::regex_search(input, callback_match, callback_regex)) {
        std::string hex_str = callback_match[1].str();
        std::uintptr_t address = std::stoull(hex_str, nullptr, 16);
        return reinterpret_cast<void*>(address);
    }

    return nullptr;
}

void* extract_js_external_object_from_api_object(const std::string& input) {
    // XXX: external value
	std::regex callback_regex(R"(0x[0-9a-fA-F]+(?=\s+<JSExternalObject>))");
    std::smatch callback_match;
    if (std::regex_search(input, callback_match, callback_regex)) {
        std::string hex_str = callback_match[0].str();
        std::uintptr_t address = std::stoull(hex_str, nullptr, 16);
        return reinterpret_cast<void*>(address);
    }

    return nullptr;
}

std::string extract_name_from_jsfunction(const std::string& input) {
    // XXX: external value
    std::regex callback_regex(R"(___NAME___(.*?)___NAME___)");
    std::smatch callback_match;
    if (std::regex_search(input, callback_match, callback_regex)) {
        std::string name = callback_match[1].str();
        return name;
    }

    return "NONE";
}


void getcb(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    void *address;
    void *jsfunc_addr;
    void *sfi_addr;
    void *fti_addr;
    std::string msg;

    if (!args[0]->IsObject()) {
      std::cerr << "Argument is not an object" << std::endl;
      return;
    }

    Local<Object> obj = args[0].As<Object>();

    // Get raw pointer address
    address = *obj;
    std::cout << "V8 Object Address: " << address << std::endl;

    jsfunc_addr = *(void**)address;
    // std::cout << "V8 Object Address: " << jsfunc_addr << std::endl;

    if (!jsfunc_addr)
        goto out_with_null;

    msg = _v8_internal_Print_Object_To_String(jsfunc_addr);

    sfi_addr = extract_sfi_pointer(msg);

    if (!sfi_addr)
        goto out_with_null;

    msg = _v8_internal_Print_Object_To_String(sfi_addr);

    fti_addr = extract_fti_pointer(msg);

    if (!fti_addr)
        goto out_with_null;

    msg = _v8_internal_Print_Object_To_String(fti_addr);

    msg = extract_callback_and_overloads_json(msg);

    // std::string msg = std::to_string(reinterpret_cast<uintptr_t>(address));
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                  msg.data(),
                                                  v8::NewStringType::kNormal,
                                                  msg.size())
                                  .ToLocalChecked());
    goto out;

out_with_null:
    msg = "NONE";
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                msg.data(),
                                                v8::NewStringType::kNormal,
                                                msg.size())
                                .ToLocalChecked());
out:
  return;
}

void extract_fcb_invoke(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    void *address;
    void *jsfunc_addr;
    void *sfi_addr;
	void *callback_data_addr;
	void *external_value_addr;
	void *cfunc_addr;
	CallbackBundle bundle;
    std::string msg;

    if (!args[0]->IsObject()) {
      std::cerr << "Argument is not an object" << std::endl;
      return;
    }

    Local<Object> obj = args[0].As<Object>();

    // Get raw pointer address
    address = *obj;
    jsfunc_addr = *(void**)address;

    if (!jsfunc_addr)
        goto out_with_null;

	// job JSFunction
    msg = _v8_internal_Print_Object_To_String(jsfunc_addr);

    sfi_addr = extract_sfi_pointer(msg);

    if (!sfi_addr)
        goto out_with_null;

	// job SFI
    msg = _v8_internal_Print_Object_To_String(sfi_addr);

	// Get callback data from job SFI. ___CALLBACK_DATA___
    callback_data_addr = extract_callback_data_from_sfi(msg);

    if (!callback_data_addr)
        goto out_with_null;

	// job callback_data
    msg = _v8_internal_Print_Object_To_String(callback_data_addr);

    external_value_addr = extract_external_value_from_js_external_object(msg);

	if (!external_value_addr)
		goto out_with_null;

	bundle = *(CallbackBundle *)external_value_addr;
	cfunc_addr = (void *)bundle.cb;
    msg = std::to_string(reinterpret_cast<uintptr_t>(cfunc_addr));

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                  msg.data(),
                                                  v8::NewStringType::kNormal,
                                                  msg.size())
                                  .ToLocalChecked());
    goto out;

out_with_null:
    msg = "NONE";
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                msg.data(),
                                                v8::NewStringType::kNormal,
                                                msg.size())
                                .ToLocalChecked());
out:
  return;
}

void extract_nan(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    void *address;
    void *jsfunc_addr;
    void *sfi_addr;
	void *callback_data_addr;
	void *external_value_addr;
	void *cfunc_addr;
	void *js_external_object_addr;
    std::string msg;

    if (!args[0]->IsObject()) {
      std::cerr << "Argument is not an object" << std::endl;
      return;
    }

    Local<Object> obj = args[0].As<Object>();

    // Get raw pointer address
    address = *obj;
    jsfunc_addr = *(void**)address;

    if (!jsfunc_addr)
        goto out_with_null;

	// job JSFunction
    msg = _v8_internal_Print_Object_To_String(jsfunc_addr);

    sfi_addr = extract_sfi_pointer(msg);

    if (!sfi_addr)
        goto out_with_null;

	// job SFI
    msg = _v8_internal_Print_Object_To_String(sfi_addr);

	// Get callback data from job SFI. ___CALLBACK_DATA___
    callback_data_addr = extract_callback_data_from_sfi(msg);

    if (!callback_data_addr)
        goto out_with_null;

	// job callback_data = [api object]
    msg = _v8_internal_Print_Object_To_String(callback_data_addr);
    js_external_object_addr = extract_js_external_object_from_api_object(msg);

	if (!js_external_object_addr)
		goto out_with_null;

	// Extract External Value from external object
    msg = _v8_internal_Print_Object_To_String(js_external_object_addr);
    external_value_addr = extract_external_value_from_js_external_object(msg);

	if (!external_value_addr)
		goto out_with_null;

	// cfuncaddr == external value addr
	cfunc_addr = external_value_addr;
    msg = std::to_string(reinterpret_cast<uintptr_t>(cfunc_addr));

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                  msg.data(),
                                                  v8::NewStringType::kNormal,
                                                  msg.size())
                                  .ToLocalChecked());
    goto out;

out_with_null:
    msg = "NONE";
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                msg.data(),
                                                v8::NewStringType::kNormal,
                                                msg.size())
                                .ToLocalChecked());
out:
  return;
}

void extract_napi(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    void *address;
    void *jsfunc_addr;
    void *sfi_addr;
	void *callback_data_addr;
	void *external_value_addr;
	void *cfunc_addr;
	CallbackBundle bundle;
	// Napi_CallbackData napi_cb_data;
	void **napi_cb_data;
    std::string msg;

    if (!args[0]->IsObject()) {
      std::cerr << "Argument is not an object" << std::endl;
      return;
    }

    Local<Object> obj = args[0].As<Object>();

    // Get raw pointer address
    address = *obj;
    jsfunc_addr = *(void**)address;

    if (!jsfunc_addr)
        goto out_with_null;

	// job JSFunction
    msg = _v8_internal_Print_Object_To_String(jsfunc_addr);

    sfi_addr = extract_sfi_pointer(msg);

    if (!sfi_addr)
        goto out_with_null;

	// job SFI
    msg = _v8_internal_Print_Object_To_String(sfi_addr);

	// Get callback data from job SFI. ___CALLBACK_DATA___
    callback_data_addr = extract_callback_data_from_sfi(msg);

    if (!callback_data_addr)
        goto out_with_null;

	// job callback_data
    msg = _v8_internal_Print_Object_To_String(callback_data_addr);

    external_value_addr = extract_external_value_from_js_external_object(msg);

	if (!external_value_addr)
		goto out_with_null;

	bundle = *(CallbackBundle *)external_value_addr;
	napi_cb_data = (void **)bundle.cb_data;
	cfunc_addr = *napi_cb_data;
    msg = std::to_string(reinterpret_cast<uintptr_t>(cfunc_addr));

    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                  msg.data(),
                                                  v8::NewStringType::kNormal,
                                                  msg.size())
                                  .ToLocalChecked());
    goto out;

out_with_null:
    msg = "NONE";
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                msg.data(),
                                                v8::NewStringType::kNormal,
                                                msg.size())
                                .ToLocalChecked());
out:
  return;
}

void extract_neon(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    void *address;
    void *jsfunc_addr;
    std::string msg;

    if (!args[0]->IsObject()) {
      std::cerr << "Argument is not an object" << std::endl;
      return;
    }

    Local<Object> obj = args[0].As<Object>();

    // Get raw pointer address
    address = *obj;
    jsfunc_addr = *(void**)address;

    if (!jsfunc_addr)
        goto out_with_null;

	// job JSFunction
    msg = _v8_internal_Print_Object_To_String(jsfunc_addr);

    msg = extract_name_from_jsfunction(msg);


    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                  msg.data(),
                                                  v8::NewStringType::kNormal,
                                                  msg.size())
                                  .ToLocalChecked());
	goto out;
out_with_null:
    msg = "NONE";
    args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                msg.data(),
                                                v8::NewStringType::kNormal,
                                                msg.size())
                                .ToLocalChecked());
out:
  return;
}

std::string deno_jid (void *jsfunc_addr) {
  // Get raw pointer address
  std::string msg;

  std::cout << "V8 Object Address: " << jsfunc_addr << std::endl;
  // msg = std::to_string(reinterpret_cast<uintptr_t>(jsfunc_addr));
  msg = _v8_internal_Print_Object_To_String(jsfunc_addr);
  return msg;
}


void jid(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  void *address;
  void *jsfunc_addr;
  std::string msg;

  if (!args[0]->IsObject()) {
    std::cerr << "Argument is not an object" << std::endl;
    return;
  }

  Local<Object> obj = args[0].As<Object>();

  // Get raw pointer address
  address = *obj;
  // std::cout << "V8 Object Address: " << address << std::endl;

  jsfunc_addr = *(void**)address;
  std::cout << "V8 Object Address: " << jsfunc_addr << std::endl;
  msg = std::to_string(reinterpret_cast<uintptr_t>(jsfunc_addr));
  args.GetReturnValue().Set(String::NewFromUtf8(isolate,
                                                msg.data(),
                                                v8::NewStringType::kNormal,
                                                msg.size())
                                .ToLocalChecked());
  return;
}

void UpdateHeapStatisticsBuffer(const FunctionCallbackInfo<Value>& args) {
  BindingData* data = Realm::GetBindingData<BindingData>(args);
  HeapStatistics s;
  args.GetIsolate()->GetHeapStatistics(&s);
  AliasedFloat64Array& buffer = data->heap_statistics_buffer;
#define V(index, name, _) buffer[index] = static_cast<double>(s.name());
  HEAP_STATISTICS_PROPERTIES(V)
#undef V
}


void UpdateHeapSpaceStatisticsBuffer(const FunctionCallbackInfo<Value>& args) {
  BindingData* data = Realm::GetBindingData<BindingData>(args);
  HeapSpaceStatistics s;
  Isolate* const isolate = args.GetIsolate();
  CHECK(args[0]->IsUint32());
  size_t space_index = static_cast<size_t>(args[0].As<v8::Uint32>()->Value());
  isolate->GetHeapSpaceStatistics(&s, space_index);

  AliasedFloat64Array& buffer = data->heap_space_statistics_buffer;

#define V(index, name, _) buffer[index] = static_cast<double>(s.name());
  HEAP_SPACE_STATISTICS_PROPERTIES(V)
#undef V
}

void UpdateHeapCodeStatisticsBuffer(const FunctionCallbackInfo<Value>& args) {
  BindingData* data = Realm::GetBindingData<BindingData>(args);
  HeapCodeStatistics s;
  args.GetIsolate()->GetHeapCodeAndMetadataStatistics(&s);
  AliasedFloat64Array& buffer = data->heap_code_statistics_buffer;

#define V(index, name, _) buffer[index] = static_cast<double>(s.name());
  HEAP_CODE_STATISTICS_PROPERTIES(V)
#undef V
}


void SetFlagsFromString(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsString());
  String::Utf8Value flags(args.GetIsolate(), args[0]);
  V8::SetFlagsFromString(*flags, static_cast<size_t>(flags.length()));
}

static const char* GetGCTypeName(v8::GCType gc_type) {
  switch (gc_type) {
    case v8::GCType::kGCTypeScavenge:
      return "Scavenge";
    case v8::GCType::kGCTypeMarkSweepCompact:
      return "MarkSweepCompact";
    case v8::GCType::kGCTypeIncrementalMarking:
      return "IncrementalMarking";
    case v8::GCType::kGCTypeProcessWeakCallbacks:
      return "ProcessWeakCallbacks";
    default:
      return "Unknown";
  }
}

static void SetHeapStatistics(JSONWriter* writer, Isolate* isolate) {
  HeapStatistics heap_statistics;
  isolate->GetHeapStatistics(&heap_statistics);
  writer->json_objectstart("heapStatistics");
  writer->json_keyvalue("totalHeapSize", heap_statistics.total_heap_size());
  writer->json_keyvalue("totalHeapSizeExecutable",
                        heap_statistics.total_heap_size_executable());
  writer->json_keyvalue("totalPhysicalSize",
                        heap_statistics.total_physical_size());
  writer->json_keyvalue("totalAvailableSize",
                        heap_statistics.total_available_size());
  writer->json_keyvalue("totalGlobalHandlesSize",
                        heap_statistics.total_global_handles_size());
  writer->json_keyvalue("usedGlobalHandlesSize",
                        heap_statistics.used_global_handles_size());
  writer->json_keyvalue("usedHeapSize", heap_statistics.used_heap_size());
  writer->json_keyvalue("heapSizeLimit", heap_statistics.heap_size_limit());
  writer->json_keyvalue("mallocedMemory", heap_statistics.malloced_memory());
  writer->json_keyvalue("externalMemory", heap_statistics.external_memory());
  writer->json_keyvalue("peakMallocedMemory",
                        heap_statistics.peak_malloced_memory());
  writer->json_objectend();

  int space_count = isolate->NumberOfHeapSpaces();
  writer->json_arraystart("heapSpaceStatistics");
  for (int i = 0; i < space_count; i++) {
    HeapSpaceStatistics heap_space_statistics;
    isolate->GetHeapSpaceStatistics(&heap_space_statistics, i);
    writer->json_start();
    writer->json_keyvalue("spaceName", heap_space_statistics.space_name());
    writer->json_keyvalue("spaceSize", heap_space_statistics.space_size());
    writer->json_keyvalue("spaceUsedSize",
                          heap_space_statistics.space_used_size());
    writer->json_keyvalue("spaceAvailableSize",
                          heap_space_statistics.space_available_size());
    writer->json_keyvalue("physicalSpaceSize",
                          heap_space_statistics.physical_space_size());
    writer->json_end();
  }
  writer->json_arrayend();
}

static void BeforeGCCallback(Isolate* isolate,
                             v8::GCType gc_type,
                             v8::GCCallbackFlags flags,
                             void* data) {
  GCProfiler* profiler = static_cast<GCProfiler*>(data);
  if (profiler->current_gc_type != 0) {
    return;
  }
  JSONWriter* writer = profiler->writer();
  writer->json_start();
  writer->json_keyvalue("gcType", GetGCTypeName(gc_type));
  writer->json_objectstart("beforeGC");
  SetHeapStatistics(writer, isolate);
  writer->json_objectend();
  profiler->current_gc_type = gc_type;
  profiler->start_time = uv_hrtime();
}

static void AfterGCCallback(Isolate* isolate,
                            v8::GCType gc_type,
                            v8::GCCallbackFlags flags,
                            void* data) {
  GCProfiler* profiler = static_cast<GCProfiler*>(data);
  if (profiler->current_gc_type != gc_type) {
    return;
  }
  JSONWriter* writer = profiler->writer();
  profiler->current_gc_type = 0;
  writer->json_keyvalue("cost", (uv_hrtime() - profiler->start_time) / 1e3);
  profiler->start_time = 0;
  writer->json_objectstart("afterGC");
  SetHeapStatistics(writer, isolate);
  writer->json_objectend();
  writer->json_end();
}

GCProfiler::GCProfiler(Environment* env, Local<Object> object)
    : BaseObject(env, object),
      start_time(0),
      current_gc_type(0),
      state(GCProfilerState::kInitialized),
      writer_(out_stream_, false) {
  MakeWeak();
}

// This function will be called when
// 1. StartGCProfile and StopGCProfile are called and
//    JS land does not keep the object anymore.
// 2. StartGCProfile is called then the env exits before
//    StopGCProfile is called.
GCProfiler::~GCProfiler() {
  if (state != GCProfiler::GCProfilerState::kInitialized) {
    env()->isolate()->RemoveGCPrologueCallback(BeforeGCCallback, this);
    env()->isolate()->RemoveGCEpilogueCallback(AfterGCCallback, this);
  }
}

JSONWriter* GCProfiler::writer() {
  return &writer_;
}

std::ostringstream* GCProfiler::out_stream() {
  return &out_stream_;
}

void GCProfiler::New(const FunctionCallbackInfo<Value>& args) {
  CHECK(args.IsConstructCall());
  Environment* env = Environment::GetCurrent(args);
  new GCProfiler(env, args.This());
}

void GCProfiler::Start(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  GCProfiler* profiler;
  ASSIGN_OR_RETURN_UNWRAP(&profiler, args.This());
  if (profiler->state != GCProfiler::GCProfilerState::kInitialized) {
    return;
  }
  profiler->writer()->json_start();
  profiler->writer()->json_keyvalue("version", 1);

  uv_timeval64_t ts;
  if (uv_gettimeofday(&ts) == 0) {
    profiler->writer()->json_keyvalue("startTime",
                                      ts.tv_sec * 1000 + ts.tv_usec / 1000);
  } else {
    profiler->writer()->json_keyvalue("startTime", 0);
  }
  profiler->writer()->json_arraystart("statistics");
  env->isolate()->AddGCPrologueCallback(BeforeGCCallback,
                                        static_cast<void*>(profiler));
  env->isolate()->AddGCEpilogueCallback(AfterGCCallback,
                                        static_cast<void*>(profiler));
  profiler->state = GCProfiler::GCProfilerState::kStarted;
}

void GCProfiler::Stop(const FunctionCallbackInfo<v8::Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  GCProfiler* profiler;
  ASSIGN_OR_RETURN_UNWRAP(&profiler, args.This());
  if (profiler->state != GCProfiler::GCProfilerState::kStarted) {
    return;
  }
  profiler->writer()->json_arrayend();
  uv_timeval64_t ts;
  if (uv_gettimeofday(&ts) == 0) {
    profiler->writer()->json_keyvalue("endTime",
                                      ts.tv_sec * 1000 + ts.tv_usec / 1000);
  } else {
    profiler->writer()->json_keyvalue("endTime", 0);
  }
  profiler->writer()->json_end();
  profiler->state = GCProfiler::GCProfilerState::kStopped;
  auto string = profiler->out_stream()->str();
  args.GetReturnValue().Set(String::NewFromUtf8(env->isolate(),
                                                string.data(),
                                                v8::NewStringType::kNormal,
                                                string.size())
                                .ToLocalChecked());
}

void Initialize(Local<Object> target,
                Local<Value> unused,
                Local<Context> context,
                void* priv) {
  Realm* realm = Realm::GetCurrent(context);
  Environment* env = realm->env();
  BindingData* const binding_data = realm->AddBindingData<BindingData>(target);
  if (binding_data == nullptr) return;

  SetMethodNoSideEffect(
      context, target, "cachedDataVersionTag", CachedDataVersionTag);
  SetMethodNoSideEffect(context,
                        target,
                        "setHeapSnapshotNearHeapLimit",
                        SetHeapSnapshotNearHeapLimit);
  SetMethodNoSideEffect(context,
                        target,
                        "jid",
                        jid);
  SetMethodNoSideEffect(context,
                        target,
                        "getcb",
                        getcb);
  SetMethodNoSideEffect(context,
                        target,
                        "extract_fcb_invoke",
                        extract_fcb_invoke);
  SetMethodNoSideEffect(context,
                        target,
                        "extract_napi",
                        extract_napi);
  SetMethodNoSideEffect(context,
                        target,
                        "extract_nan",
                        extract_nan);
  SetMethodNoSideEffect(context,
                        target,
                        "extract_neon",
                        extract_neon);
  SetMethod(context,
            target,
            "updateHeapStatisticsBuffer",
            UpdateHeapStatisticsBuffer);

  SetMethod(context,
            target,
            "updateHeapCodeStatisticsBuffer",
            UpdateHeapCodeStatisticsBuffer);

  size_t number_of_heap_spaces = env->isolate()->NumberOfHeapSpaces();

  // Heap space names are extracted once and exposed to JavaScript to
  // avoid excessive creation of heap space name Strings.
  HeapSpaceStatistics s;
  MaybeStackBuffer<Local<Value>, 16> heap_spaces(number_of_heap_spaces);
  for (size_t i = 0; i < number_of_heap_spaces; i++) {
    env->isolate()->GetHeapSpaceStatistics(&s, i);
    heap_spaces[i] = String::NewFromUtf8(env->isolate(), s.space_name())
                                             .ToLocalChecked();
  }
  target
      ->Set(
          context,
          FIXED_ONE_BYTE_STRING(env->isolate(), "kHeapSpaces"),
          Array::New(env->isolate(), heap_spaces.out(), number_of_heap_spaces))
      .Check();

  SetMethod(context,
            target,
            "updateHeapSpaceStatisticsBuffer",
            UpdateHeapSpaceStatisticsBuffer);

#define V(i, _, name)                                                          \
  target                                                                       \
      ->Set(context,                                                           \
            FIXED_ONE_BYTE_STRING(env->isolate(), #name),                      \
            Uint32::NewFromUnsigned(env->isolate(), i))                        \
      .Check();

  HEAP_STATISTICS_PROPERTIES(V)
  HEAP_CODE_STATISTICS_PROPERTIES(V)
  HEAP_SPACE_STATISTICS_PROPERTIES(V)
#undef V

  // Export symbols used by v8.setFlagsFromString()
  SetMethod(context, target, "setFlagsFromString", SetFlagsFromString);

  // GCProfiler
  Local<FunctionTemplate> t =
      NewFunctionTemplate(env->isolate(), GCProfiler::New);
  t->InstanceTemplate()->SetInternalFieldCount(BaseObject::kInternalFieldCount);
  SetProtoMethod(env->isolate(), t, "start", GCProfiler::Start);
  SetProtoMethod(env->isolate(), t, "stop", GCProfiler::Stop);
  SetConstructorFunction(context, target, "GCProfiler", t);
}

void RegisterExternalReferences(ExternalReferenceRegistry* registry) {
  registry->Register(CachedDataVersionTag);
  registry->Register(UpdateHeapStatisticsBuffer);
  registry->Register(UpdateHeapCodeStatisticsBuffer);
  registry->Register(UpdateHeapSpaceStatisticsBuffer);
  registry->Register(SetFlagsFromString);
  registry->Register(SetHeapSnapshotNearHeapLimit);
  registry->Register(jid);
  registry->Register(getcb);
  registry->Register(extract_fcb_invoke);
  registry->Register(extract_napi);
  registry->Register(extract_nan);
  registry->Register(extract_neon);
  registry->Register(GCProfiler::New);
  registry->Register(GCProfiler::Start);
  registry->Register(GCProfiler::Stop);
}

}  // namespace v8_utils
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(v8, node::v8_utils::Initialize)
NODE_BINDING_EXTERNAL_REFERENCE(v8, node::v8_utils::RegisterExternalReferences)
