#pragma once
#include <seal/seal.h>
#include <cstdint>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

// Internal subprocess protocol: uint32 little-endian length, then binary bytes.
inline std::string read_frame() {
    unsigned char header[4];
    if (!std::cin.read(reinterpret_cast<char *>(header),4)) throw std::runtime_error("Missing frame");
    uint32_t length=0;
    for (int i=0;i<4;++i) length |= uint32_t(header[i]) << (8*i);
    if (length<16 || length>4*1024*1024) throw std::runtime_error("Invalid frame size");
    std::string bytes(length,'\0');
    if (!std::cin.read(&bytes[0],length)) throw std::runtime_error("Truncated frame");
    return bytes;
}
inline void write_frame(const std::string &bytes) {
    uint32_t length=static_cast<uint32_t>(bytes.size());
    for(int i=0;i<4;++i) std::cout.put(static_cast<char>((length>>(8*i))&255));
    std::cout.write(bytes.data(),bytes.size());
}
template<class T> void load_frame(T &object,const seal::SEALContext &context) {
    std::istringstream input(read_frame(),std::ios::binary);
    object.load(context,input); // SEAL validates the object against the context.
    if(input.peek()!=EOF) throw std::runtime_error("Trailing object data");
}
template<class T> void save_frame(const T &object) {
    std::ostringstream output(std::ios::binary);
    object.save(output,seal::compr_mode_type::none);
    write_frame(output.str());
}
