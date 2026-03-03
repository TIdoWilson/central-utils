// src/serpro-auth.js
const fs = require("fs");
const https = require("https");
const axios = require("axios");
const path = require("path");
const { resolveAppPath, resolveConfiguredPath } = require("./core/path-resolver");
require("dotenv").config({ path: resolveAppPath('.env') });

function resolveExistingCertPath(rawPath) {
  const configuredPath = resolveConfiguredPath(rawPath);
  if (!configuredPath) return '';
  if (fs.existsSync(configuredPath)) return configuredPath;

  const baseName = path.basename(configuredPath);
  const userProfile = process.env.USERPROFILE || '';
  const fallbackDirs = [
    path.join(userProfile, 'Documents'),
    path.join(userProfile, 'OneDrive', 'Documents'),
    path.join(userProfile, 'OneDrive', 'Documentos'),
  ].filter(Boolean);

  for (const dir of fallbackDirs) {
    const candidate = path.join(dir, baseName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return configuredPath;
}

async function autenticarSerpro() {
  // ⚠️ AGORA usando o endpoint CORRETO da documentação:
  // https://autenticacao.sapi.serpro.gov.br/authenticate
  const url = process.env.SERPRO_AUTH_URL;

  const consumerKey = process.env.CONSUMER_KEY;
  const consumerSecret = process.env.CONSUMER_SECRET;
  const roleType = process.env.ROLE_TYPE || "TERCEIROS";
  const timeoutMs = Number(process.env.SERPRO_AUTH_TIMEOUT_MS || 30000);
  const debugAuth = ["1", "true", "yes", "on"].includes(String(process.env.SERPRO_AUTH_DEBUG || "").toLowerCase());

  const certPath = resolveExistingCertPath(process.env.CERT_PFX_PATH || process.env.SERPRO_PFX_PATH);
  const certPassword = process.env.CERT_PFX_PASSWORD || process.env.SERPRO_PFX_PASSWORD;

  if (!url || !consumerKey || !consumerSecret || !certPath || !certPassword) {
    throw new Error("Faltam variáveis no .env (SERPRO_AUTH_URL, CONSUMER_KEY, CONSUMER_SECRET, CERT_PFX_PATH, CERT_PFX_PASSWORD)");
  }

  const missing = [];
  if (!url) missing.push('SERPRO_AUTH_URL');
  if (!consumerKey) missing.push('CONSUMER_KEY');
  if (!consumerSecret) missing.push('CONSUMER_SECRET');
  if (!certPath) missing.push('CERT_PFX_PATH/SERPRO_PFX_PATH');
  if (!certPassword) missing.push('CERT_PFX_PASSWORD/SERPRO_PFX_PASSWORD');
  if (missing.length) throw new Error('Faltam variáveis no .env: ' + missing.join(', '));
  if (!fs.existsSync(certPath)) throw new Error('Certificado não encontrado em: ' + certPath);

  if (debugAuth) {
    console.log('[SERPRO auth] certificado localizado.', {
      certPath,
      roleType,
    });
  }

  const certBuffer = fs.readFileSync(certPath);

  // Authorization: Basic base64(consumerKey:consumerSecret)
  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const httpsAgent = new https.Agent({
    pfx: certBuffer,
    passphrase: certPassword
  });

  const headers = {
    "Authorization": "Basic " + basic,
    "Role-Type": roleType,
    "Content-Type": "application/x-www-form-urlencoded"
  };

  const body = new URLSearchParams({ grant_type: "client_credentials" });

  try {
    const resp = await axios.post(url, body, { headers, httpsAgent, timeout: timeoutMs });
    if (debugAuth) {
      const expiresIn = resp?.data?.expires_in ?? null;
      console.log("[SERPRO auth] token recebido com sucesso.", { expires_in: expiresIn, roleType });
    }

    // AQUI, pela doc, devem vir:
    // access_token + jwt_token
    return resp.data;
  } catch (err) {
    const status = err?.response?.status || null;
    const rawData = err?.response?.data;
    const detail =
      typeof rawData === 'string'
        ? rawData
        : rawData
          ? JSON.stringify(rawData)
          : err?.message || 'Erro desconhecido';

    if (debugAuth) {
      console.error('[SERPRO auth] falha na autenticacao.', {
        status,
        detail,
        certPath,
        roleType,
      });
    }

    throw new Error(
      `Falha na autenticacao SERPRO${status ? ` (HTTP ${status})` : ''}: ${detail}`
    );
  }
}

module.exports = { autenticarSerpro };
