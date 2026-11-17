"""Ciphertext-only HTTP bridge. Numeric inputs and secret keys stay in the browser."""
import base64
import binascii
import json
import struct
import subprocess
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = Path(__file__).resolve().parent
MAX_BODY = 8 * 1024 * 1024
FIELDS = {'cipher_a', 'cipher_b', 'relin_keys'}
GATE = threading.BoundedSemaphore(2)
ASSETS = {
    '/': ('static/index.html', 'text/html; charset=utf-8'),
    '/dashboard.mjs': ('static/dashboard.mjs', 'text/javascript'),
    '/client.mjs': ('static/client.mjs', 'text/javascript'),
    '/style.css': ('static/style.css', 'text/css'),
    '/vendor/seal.mjs': ('static/vendor/seal.mjs', 'text/javascript'),
}

def decode_object(value):
    if not isinstance(value, str):
        raise ValueError('Expected a serialized ciphertext/key')
    data = base64.b64decode(value, validate=True)
    # Fixed SEAL 3.6, uncompressed serialization only: reject compressed bombs.
    if not 16 <= len(data) <= 4 * 1024 * 1024:
        raise ValueError('Invalid object length')
    if data[:6] != bytes([0x5e, 0xa1, 16, 3, 6, 0]):
        raise ValueError('Expected uncompressed SEAL 3.6 object')
    if struct.unpack_from('<Q', data, 8)[0] != len(data):
        raise ValueError('Truncated or trailing data')
    return data

def unpack_frames(data):
    frames = []
    for _ in range(2):
        if len(data) < 4:
            raise RuntimeError('Invalid engine output')
        size = struct.unpack_from('<I', data)[0]
        if size > len(data)-4:
            raise RuntimeError('Invalid engine output')
        frames.append(data[4:4+size])
        data = data[4+size:]
    if data:
        raise RuntimeError('Extra engine output')
    return frames

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass # Do not log ciphertext requests or client diagnostics.

    def reply(self, status, data, kind='application/json'):
        body = json.dumps(data).encode() if kind == 'application/json' else data
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self'; connect-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path not in ASSETS:
            return self.reply(404, {'error': 'Not found'})
        path, kind = ASSETS[self.path]
        self.reply(200, (ROOT / path).read_bytes(), kind)

    def do_POST(self):
        if self.path != '/calculate':
            return self.reply(404, {'error': 'Not found'})
        print('[SERVER · app.py → Handler.do_POST] POST /calculate received.', flush=True)
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= MAX_BODY:
                raise ValueError('Invalid request size')
            body = self.rfile.read(size)
            if self.headers.get('Origin') not in ('http://127.0.0.1:8094', 'http://localhost:8094'):
                return self.reply(403, {'error': 'Local browser origin required'})
            payload = json.loads(body)
            if not isinstance(payload, dict) or set(payload) != FIELDS:
                raise ValueError('Only cipher_a, cipher_b and relin_keys are accepted')
            objects = [decode_object(payload[k]) for k in ('cipher_a', 'cipher_b', 'relin_keys')]
            wire = b''.join(struct.pack('<I', len(x)) + x for x in objects)
        except (ValueError, TypeError, binascii.Error):
            return self.reply(400, {'error': 'Expected exactly two serialized ciphertexts and a relinearization key; plaintext input is not accepted.'})
        if not GATE.acquire(blocking=False):
            return self.reply(503, {'error': 'Evaluator busy. Try again.'})
        try:
            print('\n[SERVER · app.py → Handler.do_POST] Request validated: cipher_a, cipher_b, relin_keys.', flush=True)
            print('[SERVER · app.py → subprocess.run] Calling build/ckks_demo with encrypted binary objects.', flush=True)
            completed = subprocess.run([str(ROOT / 'build/ckks_demo')], input=wire,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
            print(completed.stderr.decode(errors='replace').strip(), flush=True)
            if completed.returncode:
                return self.reply(400, {'error': 'Invalid encrypted objects or incompatible parameters. No plaintext fallback.'})
            summed, product = unpack_frames(completed.stdout)
            print('[SERVER · app.py → Handler.reply] Returning HTTP 200 with sum_cipher and product_cipher.', flush=True)
            self.reply(200, {'sum_cipher': base64.b64encode(summed).decode(),
                             'product_cipher': base64.b64encode(product).decode()})
        except subprocess.TimeoutExpired:
            self.reply(504, {'error': 'Encrypted evaluation timed out. No plaintext fallback.'})
        except Exception:
            self.reply(500, {'error': 'Encrypted evaluation failed. No plaintext fallback.'})
        finally:
            GATE.release()

if __name__ == '__main__':
    print('SERVER SIDE — keep this terminal visible during the demonstration.\nUSER SIDE — open http://127.0.0.1:8094 in your browser.', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8094), Handler).serve_forever()
