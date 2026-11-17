# Show the two sides

User side means the browser in this application. Server side means Python plus the C++ evaluator. They run in separate processes on the same laptop for this demonstration.

1. Run `./run.sh` in Terminal. Keep the terminal on the right of the screen.
2. Open http://127.0.0.1:8094 in the browser on the left.
3. Explain: “The browser holds the original inputs and secret key. The server receives ciphertexts and a relinearization key.”
4. Enter A = `1.5, 2, -3` and B = `4, -1, 0.5`. Click Encrypt & calculate.
5. Show the browser's encrypted request fields. For direct transport evidence, open browser Developer Tools → Network → calculate → Payload. Only cipher_a, cipher_b and relin_keys are sent.
6. Point to the terminal. The native evaluator logs each completed arithmetic operation; Python displays those messages after the subprocess finishes. These messages contain no vectors or keys.
7. Show Network → calculate → Response: only sum_cipher and product_cipher. Then show the decoded browser answers, approximately [5.5, 1, -2.5] and [6, -2, -1.5]. The decrypted answers are never returned by the server.
8. Repeat once: encryption is randomized, while decoded answers remain approximately equal.

## Code to show

- Browser: static/client.mjs — key generation, encryptVector(), decryptVector().
- Browser: static/dashboard.mjs — encrypt, fetch, then decrypt.
- Server: app.py — accepts encrypted fields and launches C++.
- Server: main.cpp — add, multiply, relinearize, rescale; no secret key or decryptor.

The browser's server-operation text is explanatory; the terminal messages come from actual execution. This is a local two-process demonstration, not two physically separate computers. It assumes trusted browser JavaScript; a server that maliciously changes the delivered JavaScript could steal inputs before encryption.
