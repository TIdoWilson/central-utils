const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PDFA_DOWNLOAD_MAP = new Map();

function pdfaStoreFile(filePath) {
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  PDFA_DOWNLOAD_MAP.set(id, { path: filePath, expiresAt: Date.now() + 60 * 60 * 1000 });
  return id;
}

function pdfaGetFile(id) {
  const rec = PDFA_DOWNLOAD_MAP.get(id);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    PDFA_DOWNLOAD_MAP.delete(id);
    return null;
  }
  return rec.path;
}

function pdfaGetGhostscriptPath() {
  const envPath = process.env.GS_EXE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    'C:\\\\Program Files\\\\gs\\\\gs10.00.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.01.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.02.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.03.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.04.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.05.0\\\\bin\\\\gswin64c.exe',
    'C:\\\\Program Files\\\\gs\\\\gs10.06.0\\\\bin\\\\gswin64c.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'gswin64c.exe';
}

function pdfaGetLibreOfficePath() {
  const envPath = process.env.LIBREOFFICE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    'C:\\\\Program Files\\\\LibreOffice\\\\program\\\\soffice.exe',
    'C:\\\\Program Files (x86)\\\\LibreOffice\\\\program\\\\soffice.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function pdfaGetIccProfilePath() {
  const envPath = process.env.PDFA_ICC_PROFILE;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    'C:\\\\Windows\\\\System32\\\\spool\\\\drivers\\\\color\\\\sRGB Color Space Profile.icm',
    'C:\\\\Windows\\\\System32\\\\spool\\\\drivers\\\\color\\\\sRGB IEC61966-2.1.icm',
    'C:\\\\Program Files\\\\gs\\\\gs10.00.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.01.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.02.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.03.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.04.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.05.0\\\\iccprofiles\\\\sRGB.icc',
    'C:\\\\Program Files\\\\gs\\\\gs10.06.0\\\\iccprofiles\\\\sRGB.icc',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function pdfaRun(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => reject({ err, stdout, stderr }));
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      return reject({ code, stdout, stderr });
    });
  });
}

module.exports = {
  pdfaStoreFile,
  pdfaGetFile,
  pdfaGetGhostscriptPath,
  pdfaGetLibreOfficePath,
  pdfaGetIccProfilePath,
  pdfaRun,
};
