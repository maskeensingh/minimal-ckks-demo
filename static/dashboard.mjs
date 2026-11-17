import SEAL from './vendor/seal.mjs';
import {createClient} from './client.mjs';

// Get an HTML element by its id; $('a').value reads the input text.
const $ = id => document.getElementById(id);
// Format the answer to nine decimal places for display.
const format = values => '[' + values.map(x => x.toFixed(9)).join(', ') + ']';
let client; // Holds the object returned by createClient(seal).

// Read comma-separated input and return an array of numbers.
function parse(id) {
  const parts = $(id).value.split(',');
  if (parts.some(x => !x.trim())) throw Error('Do not leave empty elements.');
  return parts.map(Number);
}

$('form').onsubmit = async event => {
  event.preventDefault();
  // Prevent a second click and clear the previous result while calculating.
  $('run').disabled = true;
  $('results').hidden = true;
  try {
    const a = parse('a'), b = parse('b');
    $('status').textContent = 'Encrypting in your browser…';
    const payload = client.encrypt(a, b);

    // POST sends only encrypted vectors and a relinearization key to /calculate.
    $('status').textContent = 'Server is calculating on ciphertexts…';
    console.info('[BROWSER · dashboard.mjs → form.onsubmit] Sending POST /calculate. Fields:', Object.keys(payload));
    const response = await fetch('/calculate', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const answer = await response.json();
    console.info('[BROWSER · dashboard.mjs → form.onsubmit] Server response received. HTTP status:', response.status, 'Fields:', Object.keys(answer));
    if (!response.ok) throw Error(answer.error || 'Encrypted calculation failed.');

    // Decrypt the server's encrypted answers locally using the browser's key.
    const result = client.decrypt(answer, a.length);
    for (const name of ['cipher_a','cipher_b','relin_keys']) $(name).value = payload[name];
    $('sum_cipher').value = answer.sum_cipher;
    $('product_cipher').value = answer.product_cipher;
    $('sum').textContent = format(result.sum);
    $('product').textContent = format(result.product);
    $('results').hidden = false;
    $('status').textContent = 'Done. Encryption and decryption happened in your browser.';
  } catch(error) {
    $('status').textContent = error.message || 'Calculation failed. No plaintext fallback.';
  } finally { $('run').disabled = !client; }
};

async function initialize() {
  try {
    $('run').disabled = true;
    $('status').textContent = 'Preparing browser encryption…';
    client = createClient(await SEAL());
    $('run').disabled = false;
    $('status').textContent = 'Ready.';
  } catch(error) { $('status').textContent = 'Could not load encryption: ' + error.message; }
}
window.addEventListener('pagehide', () => { client?.dispose(); client = null; });
window.addEventListener('pageshow', event => { if (event.persisted) initialize(); });
initialize();
