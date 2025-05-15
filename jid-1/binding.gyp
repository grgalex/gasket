{
  "targets": [
    {
      "target_name": "native",
      "sources": [ "native.cc" ],
      "include_dirs": [
        "/home/george.alexopoulos/jsxray/tinkers/node_modules/node-addon-api/"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags_cc!": [ "-fno-exceptions" ],
      # "cflags_cc": [ "-fsanitize=address" ],
      # 'link_settings': {
      #   'libraries': [
      #     "-fsanitize=address",
      #     # '-lnode',
      #    ],
      #   # 'library_dirs': [
      #   #   '/home/george.alexopoulos/jsxray/prv-node/out/Debug',
      #   # ],
      # },
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      },
      "defines": [ "NAPI_CPP_EXCEPTIONS" ]
    }
  ]
}

