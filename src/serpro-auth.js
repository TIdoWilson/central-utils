// src/serpro-auth.js
const fs = require("fs");
const https = require("https");
const axios = require("axios");
require("dotenv").config();

async function autenticarSerpro() {
  // ⚠️ AGORA usando o endpoint CORRETO da documentação:
  // https://autenticacao.sapi.serpro.gov.br/authenticate
  const url = process.env.SERPRO_AUTH_URL;

  const consumerKey = process.env.CONSUMER_KEY;
  const consumerSecret = process.env.CONSUMER_SECRET;

  const certPath = process.env.CERT_PFX_PATH || process.env.SERPRO_PFX_PATH;
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

  const certBuffer = fs.readFileSync(certPath);

  // Authorization: Basic base64(consumerKey:consumerSecret)
  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const httpsAgent = new https.Agent({
    pfx: certBuffer,
    passphrase: certPassword
  });

  const headers = {
    "Authorization": "Basic " + basic,
    "Role-Type": "TERCEIROS",
    "Content-Type": "application/x-www-form-urlencoded"
  };

  const body = new URLSearchParams({ grant_type: "client_credentials" });

  const resp = await axios.post(url, body, { headers, httpsAgent });

  console.log("Token recebido do SERPRO:", resp.data);

  // AQUI, pela doc, devem vir:
  // access_token + jwt_token
  return resp.data;
}

module.exports = { autenticarSerpro };
