import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'rumoca-dir': { type: 'string' },
  destination: { type: 'string' },
} });
if (values['rumoca-dir'] === '') throw new Error('--rumoca-dir requires a package directory');
// Only --rumoca-dir installs an unpinned local package. RUMOCA_WASM_PACKAGE names a copy of the pinned package
// (as for npm ci), so it is checked against the pin like the default install.
const local = values['rumoca-dir'];
const copy = process.env.RUMOCA_WASM_PACKAGE || undefined;
const source = resolve(local ?? copy ?? 'node_modules/@cognipilot/rumoca');
const destination = resolve(values.destination ?? 'public/vendor/rumoca');
const names = ['rumoca_bind_wasm.js', 'rumoca_bind_wasm_bg.wasm'];
// Load and validate the complete pair before replacing any existing assets.
// Never combine a branch WASM module with the packaged release's generated JS.
const files = await Promise.all(names.map(async name => ({
  name, bytes: await readFile(join(source, name)),
})));
const pin=local?undefined:JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url),'utf8'));
if(pin)for(const {name,bytes} of files){
  if(createHash('sha256').update(bytes).digest('hex')!==pin.files[name])throw new Error(copy
    ?`RUMOCA_WASM_PACKAGE is not the pinned Rumoca ${pin.version?'release':'main'} package (${name} differs); use --rumoca-dir for an unpinned local package.`
    :`Run npm ci to install the pinned Rumoca package (${name} differs).`);
}
if (!WebAssembly.validate(files[1].bytes)) throw new Error('Invalid Rumoca WASM module');
if (!files[0].bytes.toString('utf8').includes('rumoca_bind_wasm_bg.wasm')) {
  throw new Error('Rumoca JavaScript glue does not reference its WASM module');
}
const manifest = {
  schemaVersion: 1,
  source: local ? 'explicit-local-package' : (pin.version?'pinned-release-package':'pinned-main-package'),
  ...(pin?{revision:pin.revision,runId:pin.runId,...(pin.version?{version:pin.version}:{})}:{}),
  files: files.map(({ name, bytes }) => ({
    file: name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })),
};
await mkdir(destination, { recursive: true });
for (const { name, bytes } of files) await writeFile(join(destination, name), bytes);
await writeFile(join(destination, 'compiler-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Rumoca static assets ready (${manifest.source}).`);
