import assert from 'node:assert/strict';
const instances=[];
globalThis.window={};
globalThis.AudioContext=class{constructor(){throw Error('Blocking Web Audio initialization is forbidden')}};
globalThis.Audio=class{
  constructor(src){this.src=src;this.calls=0;this.paused=false;instances.push(this)}
  play(){this.calls++;return this.rejectAll||this.src==='https://fixture.invalid/broken.wav'?Promise.reject(Error('Playback denied')):Promise.resolve()}
  pause(){this.paused=true}
};
const {unlockOrderNotificationSound,playOrderNotificationSound}=await import('../lib/order-notification-sound.ts');
await Promise.all([unlockOrderNotificationSound(),unlockOrderNotificationSound()]);
assert.equal(instances.length,1);assert.equal(instances[0].calls,1);assert.equal(instances[0].volume,1);assert.equal(instances[0].paused,true);
const wav=Buffer.from(instances[0].src.split(',')[1],'base64');
assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(40),wav.length-44);
assert.equal(await playOrderNotificationSound(),true);
assert.equal(await playOrderNotificationSound('https://fixture.invalid/broken.wav'),true);
instances[0].rejectAll=true;assert.equal(await playOrderNotificationSound(),false);
assert.equal(instances.length,1);
console.log('PASS one asynchronous audio element, valid built-in WAV, fallback and truthful denied-playback result');

// Also decode/play the actual generated WAV in Chromium; no speakers are assumed.
const {build}=await import('esbuild');
const {chromium,expect}=await import('playwright/test');
const {createServer}=await import('node:http');
const {fileURLToPath}=await import('node:url');
const result=await build({tsconfig:fileURLToPath(new URL('../tsconfig.json',import.meta.url)),entryPoints:[fileURLToPath(new URL('../lib/order-notification-sound.ts',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'soundTest'});
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<button id="unlock">Enable</button><button id="play">Test chime</button><output id="result"></output><script>${result.outputFiles[0].text}</script><script>document.getElementById('unlock').onclick=async()=>{const started=performance.now();const pending=soundTest.unlockOrderNotificationSound();window.firstClickWork=performance.now()-started;await pending;document.getElementById('result').textContent='Enabled'};document.getElementById('play').onclick=async()=>{document.getElementById('result').textContent=await soundTest.playOrderNotificationSound()?'Playing':'Denied'}</script>`)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Enable',exact:true}).click();await expect(page.locator('output')).toHaveText('Enabled');
  await page.getByRole('button',{name:'Test chime',exact:true}).click();await expect(page.locator('output')).toHaveText('Playing');
  console.log(JSON.stringify({browserAudioDecode:'PASS',firstClickSynchronousMs:await page.evaluate(()=>window.firstClickWork),audibleHardware:'NOT TESTED'}));
}finally{await browser.close();server.close()}
