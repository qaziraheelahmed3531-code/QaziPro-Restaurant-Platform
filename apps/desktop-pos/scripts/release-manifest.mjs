// Local staging export only. No upload, updater publication or invented URL.
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const runtime = JSON.parse(await readFile(new URL('dist/desktop-runtime.json', root), 'utf8'));
assert.equal(runtime.channel, 'staging');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const artifacts = [];
for (const [kind, file] of [['nsis', `${pkg.build.productName} Setup ${pkg.version}.exe`], ['portable', `${pkg.build.productName} ${pkg.version}.exe`]]) {
  const url = new URL(`release-staging/${file}`, root);
  artifacts.push({kind, file, bytes:(await stat(url)).size, sha256:createHash('sha256').update(await readFile(url)).digest('hex'), downloadUrl:null});
}
const manifest = {schemaVersion:1, app:pkg.name, version:pkg.version, channel:'staging', platform:'win32', architecture:'x64', generatedAt:new Date().toISOString(), publishedAt:null, signing:'NOT_CONFIGURED', artifacts};
await writeFile(new URL('release-staging/release-manifest.json', root), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
