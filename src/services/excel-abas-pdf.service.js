const fs = require('fs');
const archiver = require('archiver');

async function criarZipComPdfs(pastaPdfs, destinoZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destinoZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(pastaPdfs, false);
    archive.finalize();
  });
}

module.exports = { criarZipComPdfs };
