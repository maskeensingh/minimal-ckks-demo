import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import SEAL from './static/vendor/seal.mjs';
import {createClient} from './static/client.mjs';
// Execute the actual browser WASM bundle in a Node integration harness.
globalThis.window = {crypto: globalThis.crypto};
const seal = await SEAL();
const client = createClient(seal);
const url = 'http://127.0.0.1:8094';
async function post(payload) {
  return fetch(url+'/calculate',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify(payload)});
}
const cases=[];
try {
  for (const [a,b] of [[[1.5,2,-3],[4,-1,.5]],[[0],[0]],[[1000,-1000],[1000,1000]],[Array(16).fill(.25),Array(16).fill(-2)]]) {
    const payload=client.encrypt(a,b);
    assert.deepEqual(Object.keys(payload).sort(),['cipher_a','cipher_b','relin_keys']);
    const response=await post(payload);assert.equal(response.status,200);
    const encrypted=await response.json();
    assert.deepEqual(Object.keys(encrypted).sort(),['product_cipher','sum_cipher']);
    const result=client.decrypt(encrypted,a.length);
    result.sum.forEach((x,i)=>assert(Math.abs(x-(a[i]+b[i]))<1e-5*Math.max(1,Math.abs(a[i]+b[i]))));
    result.product.forEach((x,i)=>assert(Math.abs(x-a[i]*b[i])<1e-5*Math.max(1,Math.abs(a[i]*b[i]))));
    cases.push({a,b,...result});
  }
  assert.notEqual(client.encrypt([1],[2]).cipher_a,client.encrypt([1],[2]).cipher_a);
  assert.throws(()=>client.encrypt([1,2],[3]));
  assert.throws(()=>client.encrypt([NaN],[3]));
  assert.equal((await post({a:[1],b:[2]})).status,400);
  const payload=client.encrypt([1],[2]);
  assert.equal((await post({...payload,secret_key:'forbidden'})).status,400);
  assert.equal((await post({...payload,cipher_a:'invalid'})).status,400);
  const second=createClient(seal);
  try {
    const response=await post(second.encrypt([3],[4]));
    assert(Math.abs(second.decrypt(await response.json(),1).product[0]-12)<1e-5);
  } finally {second.dispose();}
  // Exercise the actual dashboard submit function without simulating encryption.
  const nodes={}; const document={getElementById(id){return nodes[id]||(nodes[id]={value:''});}};
  const sandbox={document,window:{addEventListener(){}},SEAL:async()=>seal,createClient,
    fetch:(path,options)=>fetch(url+path,{...options,headers:{...options.headers,Origin:url}})};
  vm.createContext(sandbox);
  const js=fs.readFileSync('static/dashboard.mjs','utf8').replace(/^import .*;\n/gm,'').replace(/initialize\(\);\s*$/,'');
  vm.runInContext(js,sandbox);
  await vm.runInContext('initialize()',sandbox);
  document.getElementById('a').value='1.5, 2, -3'; document.getElementById('b').value='4, -1, 0.5';
  await nodes.form.onsubmit({preventDefault(){}});
  assert.equal(nodes.results.hidden,false);
  assert.match(nodes.status.textContent,/Done/);
  for(const name of ['cipher_a','cipher_b','relin_keys','sum_cipher','product_cipher']) assert(nodes[name].value.length>1000);
  assert(Math.abs(JSON.parse(nodes.sum.textContent)[0]-5.5)<1e-5);
  nodes.a.value='bad, 2, 3';await nodes.form.onsubmit({preventDefault(){}});
  assert.equal(nodes.results.hidden,true);assert.match(nodes.status.textContent,/finite numbers/);
  vm.runInContext('client.dispose()',sandbox);
  for(const path of ['/','/dashboard.mjs','/client.mjs','/style.css','/vendor/seal.mjs']) assert.equal((await fetch(url+path)).status,200);
  assert.equal((await fetch(url+'/main.cpp')).status,404);
  assert(!/\b(KeyGenerator|Decryptor|SecretKey|Encryptor|CKKSEncoder)\b/.test(fs.readFileSync('main.cpp','utf8')));
  fs.writeFileSync('test_results.json',JSON.stringify({passed:true,date:new Date().toISOString(),
    checks:['actual browser WASM/native interoperability','numeric examples','ciphertext-only request/response',
      'randomized encryption','separate client keys','invalid input rejection','dashboard submit/error and full ciphertext display'],
    visual_browser_test:'Not performed; DOM harness only',cases},null,2));
  console.log('PASS: encryption, native arithmetic, client decryption, request validation and simple dashboard logic.');
} finally {client.dispose();}
