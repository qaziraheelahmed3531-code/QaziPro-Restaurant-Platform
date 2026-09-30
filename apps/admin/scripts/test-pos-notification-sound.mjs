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
