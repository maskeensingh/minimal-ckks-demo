// SERVER ONLY: load ciphertexts, evaluate, return ciphertexts. No secret key.
#include <seal/seal.h>
#include <cmath>
#include <iostream>
#include <sstream>
#include "wire.hpp"
using namespace seal;

int main() {
    try {
        // Must match the browser's public parameters exactly.
        EncryptionParameters parameters(scheme_type::ckks);
        parameters.set_poly_modulus_degree(8192);
        parameters.set_coeff_modulus(CoeffModulus::Create(8192, {60,40,40,60}));
        SEALContext context(parameters, true, sec_level_type::tc128);
        Evaluator evaluator(context);

        // The Python bridge forwards exactly three binary SEAL objects.
        Ciphertext a, b;
        RelinKeys relin_keys;
        load_frame(a, context);
        load_frame(b, context);
        load_frame(relin_keys, context);
        if (std::cin.peek() != EOF) throw std::runtime_error("Extra input");
        for (const auto *c : {&a, &b}) {
            if (c->parms_id() != context.first_parms_id() || c->size() != 2 ||
                !c->is_ntt_form() || c->scale() != std::pow(2.0,40))
                throw std::runtime_error("Unexpected ciphertext parameters");
        }

        // Real homomorphic arithmetic: no encode, encrypt, or decrypt calls.
        Ciphertext sum, product;
        evaluator.add(a, b, sum);
        std::cerr << "[SERVER · main.cpp → main] evaluator.add() completed.\n";
        evaluator.multiply(a, b, product);
        std::cerr << "[SERVER · main.cpp → main] evaluator.multiply() completed.\n";
        evaluator.relinearize_inplace(product, relin_keys);
        evaluator.rescale_to_next_inplace(product); // Scale near 2^40.
        std::cerr << "[SERVER · main.cpp → main] evaluator.relinearize_inplace() and rescale_to_next_inplace() completed.\n";

        // Return encrypted answers; only the browser can decrypt them.
        save_frame(sum);
        save_frame(product);
    } catch (const std::exception &) {
        // Do not log request contents or internals, and never fall back.
        std::cerr << "Encrypted evaluation failed\n";
        return 1;
    }
}
