cmake_minimum_required(VERSION 3.16)
project(luma_codecs C CXX)
set(CMAKE_CXX_STANDARD 17)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(UHDR_BUILD_DEPS ON CACHE BOOL "" FORCE)
set(UHDR_ENABLE_INTRINSICS OFF CACHE BOOL "" FORCE)
set(UHDR_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
set(UHDR_WRITE_XMP ON CACHE BOOL "" FORCE)
set(UHDR_WRITE_ISO ON CACHE BOOL "" FORCE)
add_subdirectory("${DEPS_DIR}/libultrahdr" uhdr)
file(GLOB JXR_SOURCES "${DEPS_DIR}/jxrlib/image/sys/*.c" "${DEPS_DIR}/jxrlib/image/decode/*.c" "${DEPS_DIR}/jxrlib/image/encode/*.c" "${DEPS_DIR}/jxrlib/jxrgluelib/*.c")
add_library(jxr STATIC ${JXR_SOURCES})
target_include_directories(jxr PUBLIC "${DEPS_DIR}/jxrlib/common/include" "${DEPS_DIR}/jxrlib/image/sys" "${DEPS_DIR}/jxrlib/jxrgluelib")
target_compile_definitions(jxr PUBLIC __ANSI__ DISABLE_PERF_MEASUREMENT)
target_compile_options(jxr PRIVATE -Wno-error=implicit-function-declaration -Wno-shift-negative-value)
add_executable(codecs jxr.c hdr.cpp)
target_link_libraries(codecs PRIVATE jxr uhdr)
target_include_directories(codecs PRIVATE "${DEPS_DIR}/libultrahdr" "${DEPS_DIR}/libultrahdr/lib/include" "${DEPS_DIR}/libultrahdr/third_party/turbojpeg" "${CMAKE_BINARY_DIR}/uhdr/turbojpeg/src/turbojpeg-build")
set_target_properties(codecs PROPERTIES SUFFIX ".mjs")
target_link_options(codecs PRIVATE
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,worker,node"
  "-sALLOW_MEMORY_GROWTH=1" "-sMAXIMUM_MEMORY=2147483648" "-sINITIAL_MEMORY=33554432"
  "-sSTACK_SIZE=1048576" "-sFILESYSTEM=1" "-sASSERTIONS=0"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free']"
  "-sEXPORTED_RUNTIME_METHODS=['FS','HEAPU8','HEAPF32','UTF8ToString']"
  "--no-entry")
