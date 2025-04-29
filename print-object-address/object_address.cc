#include <node.h>
#include <v8.h>
#include <iostream>

namespace demo {

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Value;

void PrintObjectAddress(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  if (!args[0]->IsObject()) {
    std::cerr << "Argument is not an object" << std::endl;
    return;
  }

  Local<Object> obj = args[0].As<Object>();

  // Get raw pointer address
  void* address = *obj;
  std::cout << "V8 Object Address: " << address << std::endl;
}

void Initialize(Local<Object> exports) {
  NODE_SET_METHOD(exports, "printObjectAddress", PrintObjectAddress);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)

}  // namespace demo

