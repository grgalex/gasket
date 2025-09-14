function extractWasmInstanceAddr(text) {
  const re = /-\s*Wasm instance:\s*(0x[0-9a-fA-F]+)/;
  const m = re.exec(text);
  return m ? m[1] : null;
}

// Example:
const text = `0x56e6992fa51: [Function] in OldSpace
 - map: 0x26477f447dc9 <Map[56](HOLEY_ELEMENTS)> [FastProperties]
 - prototype: 0x123f1c40ed89 <JSFunction (sfi = 0x1acde7b87a41)>
 - elements: 0x06239f880c31 <FixedArray[0]> [HOLEY_ELEMENTS]
 - function prototype: <no-prototype-slot>
 - shared_info: 0x056e6992fa11 <SharedFunctionInfo js-to-wasm:i:i>
 - name: ___NAME___0x03f3d29fdcd9 <String[2]: "10">___NAME___
 - builtin: JSToWasmWrapper
 - formal_parameter_count: 1
 - kind: NormalFunction
 - context: 0x123f1c401231 <NativeContext[287]>
 - code: 0x2c0639cb2021 <Code BUILTIN JSToWasmWrapper>
 - Wasm instance: 0x056e6992ee91 <Instance map = 0x20dd8ed63a91>
 - Wasm function index: 10
 - properties: 0x06239f880c31 <FixedArray[0]>
 - All own properties (excluding elements): {
    0x6239f8817c9: [String] in ReadOnlySpace: #length: 0x2532d84d10e1 <AccessorInfo name= 0x06239f8817c9 <String[6]: #length>, data= 0x06239f880069 <undefined
>> (const accessor descriptor), location: descriptor
    0x6239f881801: [String] in ReadOnlySpace: #name: 0x2532d84d10b1 <AccessorInfo name= 0x06239f881801 <String[4]: #name>, data= 0x06239f880069 <undefined>> (
const accessor descriptor), location: descriptor
    0x6239f886aa1: [String] in ReadOnlySpace: #arguments: 0x2532d84d1051 <AccessorInfo name= 0x06239f886aa1 <String[9]: #arguments>, data= 0x06239f880069 <und
efined>> (const accessor descriptor), location: descriptor
    0x6239f886dd1: [String] in ReadOnlySpace: #caller: 0x2532d84d1081 <AccessorInfo name= 0x06239f886dd1 <String[6]: #caller>, data= 0x06239f880069 <undefined
>> (const accessor descriptor), location: descriptor
 }
 - feedback vector: feedback metadata is not available in SFI

`;

console.log(extractWasmInstanceAddr(text)); // "0x056e6992ee91"
