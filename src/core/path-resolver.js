const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..', '..');

function isWindowsDrivePath(value) {
  return /^[A-Za-z]:[\\/]/.test(String(value || '').trim());
}

function isUncPath(value) {
  return /^\\\\/.test(String(value || '').trim());
}

function isAbsoluteLikePath(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return path.isAbsolute(normalized) || isWindowsDrivePath(normalized) || isUncPath(normalized);
}

function resolveAppPath(...segments) {
  return path.resolve(APP_ROOT, ...segments);
}

function resolveConfiguredPath(rawPath, options = {}) {
  const value = String(rawPath || '').trim();
  const baseDir = options.baseDir || APP_ROOT;
  if (!value) return '';
  if (isAbsoluteLikePath(value)) return value;
  return path.resolve(baseDir, value);
}

module.exports = {
  APP_ROOT,
  isAbsoluteLikePath,
  isUncPath,
  isWindowsDrivePath,
  resolveAppPath,
  resolveConfiguredPath,
};
