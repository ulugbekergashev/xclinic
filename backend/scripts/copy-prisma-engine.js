// @prisma/client is external to the ncc bundle (see package.json "bundle" script),
// so ncc no longer copies the query engine binary into dist-bundle/client/ on its own.
// This makes that copy explicit and deterministic instead of relying on a leftover
// file from a previous build.
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');
const destDir = path.join(__dirname, '..', 'dist-bundle', 'client');

fs.mkdirSync(destDir, { recursive: true });

const engineFile = fs.readdirSync(srcDir).find(f => f.startsWith('query_engine-windows') && f.endsWith('.dll.node'));
if (!engineFile) {
    console.error('❌ Could not find query_engine-windows*.dll.node in', srcDir);
    process.exit(1);
}

fs.copyFileSync(path.join(srcDir, engineFile), path.join(destDir, 'query_engine-windows.dll.node'));
fs.copyFileSync(path.join(srcDir, 'schema.prisma'), path.join(__dirname, '..', 'dist-bundle', 'schema.prisma'));
console.log(`✅ Copied ${engineFile} -> dist-bundle/client/query_engine-windows.dll.node`);
