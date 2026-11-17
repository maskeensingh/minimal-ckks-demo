// All key generation, encryption and decryption run in the browser.
export function createClient(seal) {
  const parameters = seal.EncryptionParameters(seal.SchemeType.ckks);
  parameters.setPolyModulusDegree(8192);
  const moduli = seal.CoeffModulus.Create(8192, Int32Array.from([60,40,40,60]));
  parameters.setCoeffModulus(moduli);
  const context = seal.Context(parameters, true, seal.SecurityLevel.tc128);
  const generator = seal.KeyGenerator(context);
  const secretKey = generator.secretKey(); // Never sent to the server.
  const publicKey = generator.createPublicKey();
  const relinKeys = generator.createRelinKeys();
  const encoder = seal.CKKSEncoder(context);
  const encryptor = seal.Encryptor(context, publicKey);
  const decryptor = seal.Decryptor(context, secretKey);

  function encryptVector(vector) {
    console.info('[BROWSER · client.mjs → encryptVector] Calling encoder.encode() locally.');
    const plain = encoder.encode(Float64Array.from(vector), 2**40);
    let cipher;
    try {
      cipher = encryptor.encrypt(plain);
      console.info('[BROWSER · client.mjs → encryptVector] encryptor.encrypt() completed. Ciphertext ready.');
      return cipher.save(seal.ComprModeType.none); // Base64-serialized ciphertext.
    } finally { cipher?.delete(); plain.delete(); }
  }

  function decryptVector(serialized, length) {
    const cipher = seal.CipherText();
    let plain;
    try {
      cipher.load(context, serialized);
      plain = decryptor.decrypt(cipher);
      console.info('[BROWSER · client.mjs → decryptVector] decryptor.decrypt() completed locally using the browser-held key.');
      const values = Array.from(encoder.decode(plain)).slice(0, length);
      if (!values.every(Number.isFinite)) throw Error('Invalid decrypted result.');
      return values;
    } finally { plain?.delete(); cipher.delete(); }
  }

  return {
    encrypt(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length < 1 || a.length > 16)
        throw Error('Enter equal-length vectors with 1–16 numbers.');
      if (![...a,...b].every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1000))
        throw Error('Use finite numbers between −1000 and 1000.');
      // This object is the entire request. No plaintext or secret key is included.
      return {cipher_a: encryptVector(a), cipher_b: encryptVector(b),
        relin_keys: relinKeys.save(seal.ComprModeType.none)};
    },
    decrypt(answer, length) {
      return {sum: decryptVector(answer.sum_cipher, length),
        product: decryptVector(answer.product_cipher, length)};
    },
    dispose() {
      [decryptor,encryptor,encoder,relinKeys,publicKey,secretKey,generator,context,moduli,parameters]
        .forEach(object => object.delete());
    }
  };
}
