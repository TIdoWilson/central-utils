const express = require('express');
const { createDimobService } = require('../../services/dimob.service');

const dimobService = createDimobService();

module.exports = function createDimobRoutes(deps) {
  const {
    requireCsrf,
    uploadDimob,
    resolveWPath = dimobService.resolveWPath,
    dimobStoreNetworkFile = dimobService.dimobStoreNetworkFile,
    dimobOnlyDigits = dimobService.dimobOnlyDigits,
    dimobParseSpedFileOnce = dimobService.dimobParseSpedFileOnce,
    dimobParsePreviousDimobLocatarios = dimobService.dimobParsePreviousDimobLocatarios,
    dimobGetNetworkFile = dimobService.dimobGetNetworkFile,
    auditLog,
    dimobSetYearInHeader = dimobService.dimobSetYearInHeader,
    dimobSetYearInLine = dimobService.dimobSetYearInLine,
    dimobSetSlice = dimobService.dimobSetSlice,
    dimobUpdateR01UsingCnpj = dimobService.dimobUpdateR01UsingCnpj,
    dimobSanitizeAscii = dimobService.dimobSanitizeAscii,
    dimobLoadLayout = dimobService.dimobLoadLayout,
    dimobApplyF525ToR02 = dimobService.dimobApplyF525ToR02,
    dimobExtractLocatarioFromR02 = dimobService.dimobExtractLocatarioFromR02,
    dimobSanitizeField = dimobService.dimobSanitizeField,
    dimobFormatMoneyFixed = dimobService.dimobFormatMoneyFixed,
    dimobGetMunicipioCode = dimobService.dimobGetMunicipioCode,
    dimobNormalizeText = dimobService.dimobNormalizeText,
    dimobSanitizeText = dimobService.dimobSanitizeText,
    fs,
    path,
  } = deps;

  const router = express.Router();

  router.get('/previous-file', async (req, res) => {
    try {
      const cnpj = String(req.query?.cnpj || '').replace(/\D+/g, '');
      const year = Number(req.query?.year);
      const debug = String(req.query?.debug || '') === '1';

      if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ found: false, error: 'CNPJ inválido (14 dígitos).' });
      if (!Number.isFinite(year) || year < 2015) return res.status(400).json({ found: false, error: 'Ano inválido.' });

      const prevYear = year - 1;

      const baseDirRaw = process.env.DIMOB_NETWORK_BASE_DIR || 'W:\\DECLARAÇÕES\\DIMOB';
      const baseDir = resolveWPath(baseDirRaw);
      const dir = path.join(baseDir, String(prevYear), '1-GRAVADAS');


      const dbg = {
        yearReceived: year,
        prevYear,
        baseDir,
        dir,
        existsDir: fs.existsSync(dir),
      };

      if (!dbg.existsDir) {
        return res.json({
          found: false,
          error: `Diretório não encontrado: ${dir}`,
          ...(debug ? { debug: dbg } : {})
        });
      }

      const all = fs.readdirSync(dir).filter(f => /\.dec$/i.test(f));
      dbg.filesFound = all.length;

      const re = new RegExp(`^${cnpj}-DIMOB-${prevYear}-(ORIGI|RETIF)\\.DEC$`, 'i');

      const candidates = all
        .filter(f => re.test(f))
        .map(f => {
          const full = path.join(dir, f);
          const st = fs.statSync(full);
          const up = f.toUpperCase();
          const kind = up.endsWith('-RETIF.DEC') ? 'RETIF' : (up.endsWith('-ORIGI.DEC') ? 'ORIGI' : 'OUTRO');
          return { f, full, kind, mtimeMs: st.mtimeMs, size: st.size };
        });

      dbg.candidates = candidates.map(x => ({ f: x.f, kind: x.kind, mtimeMs: x.mtimeMs }));

      if (!candidates.length) {
        return res.json({
          found: false,
          error: `Nenhum arquivo encontrado com padrão ${cnpj}-DIMOB-${prevYear}-ORIGI.DEC/RETIF.DEC em ${dir}`,
          ...(debug ? { debug: dbg } : {})
        });
      }

      const retifs = candidates.filter(x => x.kind === 'RETIF').sort((a, b) => b.mtimeMs - a.mtimeMs);
      const origis = candidates.filter(x => x.kind === 'ORIGI').sort((a, b) => b.mtimeMs - a.mtimeMs);
      const chosen = retifs[0] || origis[0] || candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

      dbg.chosen = { f: chosen.f, kind: chosen.kind, mtimeMs: chosen.mtimeMs, size: chosen.size };

      const fileId = dimobStoreNetworkFile(chosen.full);

      return res.json({
        found: true,
        fileId,
        fileName: chosen.f,
        mtime: new Date(chosen.mtimeMs).toISOString(),
        size: chosen.size,
        ...(debug ? { debug: dbg } : {})
      });
    } catch (e) {
      return res.status(500).json({ found: false, error: 'Erro ao buscar arquivo na rede.', details: e.message });
    }
  });

  router.post(
    '/parse-sped',
    requireCsrf,
    uploadDimob.fields([
      { name: 'spedFiles', maxCount: 40 },
      { name: 'previousDimob', maxCount: 1 },
    ]),
    async (req, res) => {
      const cleanupPaths = [];
      try {
        const cnpj = dimobOnlyDigits(req.body?.cnpj);
        const yearSelected = Number(req.body?.year);
        const debugEnabled = String(req.query?.debug || '') === '1';

        if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ error: 'CNPJ inválido (14 dígitos).' });
        if (!Number.isFinite(yearSelected) || yearSelected < 2015) return res.status(400).json({ error: 'Ano inválido.' });

        const spedFiles = (req.files?.spedFiles || []);
        if (!spedFiles.length) return res.status(400).json({ error: 'Anexe pelo menos um SPED.' });

        const warnings = [];
        const debug = debugEnabled ? { filesParsed: [], monthChosen: [] } : null;

        const spedStats = spedFiles.map(f => {
          cleanupPaths.push(f.path);
          const st = fs.statSync(f.path);
          return { ...f, mtimeMs: st.mtimeMs, size: st.size };
        });

        const parsedPerFile = [];
        for (const f of spedStats) {
          const r = await dimobParseSpedFileOnce(f.path);

          if (debugEnabled) {
            debug.filesParsed.push({
              originalname: f.originalname,
              size: f.size,
              mtimeMs: f.mtimeMs,
              encoding: r.encoding,
              dtIni: r.dtIni,
              dtFim: r.dtFim,
              detectedMonth: r.month,
              detectedYear: r.year,
              f525Parsed: r.f525Parsed,
              f525Skipped: r.f525Skipped,
              f200Parsed: r.f200Parsed,
              f200Skipped: r.f200Skipped,
              sampleF525: r.sampleF525,
              sampleF200: r.sampleF200
            });
          }

          if (!r.year || !r.month) {
            warnings.push(`Arquivo ${f.originalname}: não identifiquei DT_INI/DT_FIN no 0000 (campos 06/07). Ignorado.`);
            continue;
          }

          if (r.year !== yearSelected) {
            warnings.push(`Arquivo ${f.originalname}: ano do 0000 = ${r.year} (esperado ${yearSelected}). Ignorado.`);
            continue;
          }

          if (r.f525Parsed === 0 && r.f200Parsed === 0) {
            warnings.push(`Arquivo ${f.originalname}: não possui F525 nem F200. Mês ${String(r.month).padStart(2, '0')} ficará zerado.`);
          }

          parsedPerFile.push({
            file: f,
            month: r.month,
            year: r.year,
            dtIni: r.dtIni,
            dtFim: r.dtFim,
            aggF525: r.aggF525,
            opsF200: r.opsF200,
            f525Parsed: r.f525Parsed,
            f525Skipped: r.f525Skipped,
            f200Parsed: r.f200Parsed,
            f200Skipped: r.f200Skipped
          });
        }

        if (!parsedPerFile.length) {
          return res.status(400).json({
            error: 'Nenhum SPED válido foi processado (verifique o registro 0000 e o ano selecionado).',
            warnings,
            ...(debugEnabled ? { debug } : {})
          });
        }

        const byMonth = new Map();
        for (const item of parsedPerFile) {
          const m = Number(item.month);
          if (!Number.isFinite(m) || m < 1 || m > 12) continue;
          const key = String(m);
          const cur = byMonth.get(key);
          if (!cur || item.file.mtimeMs > cur.file.mtimeMs) byMonth.set(key, item);
        }

        const monthsSorted = Array.from(byMonth.keys()).map(Number).sort((a, b) => a - b);

        if (debugEnabled) {
          debug.monthChosen = monthsSorted.map(m => {
            const it = byMonth.get(String(m));
            return {
              month: m,
              originalname: it?.file?.originalname,
              mtimeMs: it?.file?.mtimeMs,
              dtIni: it?.dtIni,
              dtFim: it?.dtFim,
              f525Parsed: it?.f525Parsed || 0,
              f200Parsed: it?.f200Parsed || 0,
              docsF525: it?.aggF525?.size || 0,
              opsF200: it?.opsF200?.length || 0
            };
          });
        }

        const finalF525 = new Map();
        const firstMonthByDoc = new Map();

        let parsedF525Lines = 0;
        let skippedF525Lines = 0;

        const atividadeImobiliaria = [];
        let parsedF200Lines = 0;
        let skippedF200Lines = 0;

        for (const m of monthsSorted) {
          const it = byMonth.get(String(m));
          if (!it) continue;

          parsedF525Lines += Number(it?.f525Parsed || 0);
          skippedF525Lines += Number(it?.f525Skipped || 0);

          parsedF200Lines += Number(it?.f200Parsed || 0);
          skippedF200Lines += Number(it?.f200Skipped || 0);

          for (const [doc, sum] of it.aggF525.entries()) {
            if (!finalF525.has(doc)) finalF525.set(doc, new Map());
            finalF525.get(doc).set(String(m), sum);

            if (sum > 0 && !firstMonthByDoc.has(doc)) firstMonthByDoc.set(doc, m);
          }

          for (const op of (it.opsF200 || [])) {
            atividadeImobiliaria.push({ ...op, mesDetectado: m });
          }
        }

        let previousSet = null;

        const previousFileId = String(req.body?.previousFileId || '').trim();
        const prevUpload = (req.files?.previousDimob || [])[0];

        if (prevUpload?.path) {
          cleanupPaths.push(prevUpload.path);
          let txt = '';
          try { txt = fs.readFileSync(prevUpload.path, 'utf-8'); }
          catch { txt = fs.readFileSync(prevUpload.path, 'latin1'); }
          previousSet = dimobParsePreviousDimobLocatarios(txt);
        } else if (previousFileId) {
          const p = dimobGetNetworkFile(previousFileId);
          if (p && fs.existsSync(p)) {
            let txt = '';
            try { txt = fs.readFileSync(p, 'utf-8'); }
            catch { txt = fs.readFileSync(p, 'latin1'); }
            previousSet = dimobParsePreviousDimobLocatarios(txt);
          }
        }

        const byParticipant = [];
        const totalsByMonth = {};
        let grandTotal = 0;

        const docs = Array.from(finalF525.keys()).sort();
        for (const doc of docs) {
          const monthMap = finalF525.get(doc);
          const monthsObj = {};
          let total = 0;

          for (let mm = 1; mm <= 12; mm++) {
            const key = String(mm);
            const v = Number(monthMap?.get(key) || 0);
            monthsObj[key] = v;
            totalsByMonth[key] = Number(totalsByMonth[key] || 0) + v;
            total += v;
          }

          grandTotal += total;
          byParticipant.push({ participantDoc: doc, months: monthsObj, total });
        }

        const newParticipants = [];
        if (previousSet) {
          for (const doc of docs) {
            if (previousSet.has(doc)) continue;

            const monthMap = finalF525.get(doc);

            let firstMonth = null;
            for (let mm = 1; mm <= 12; mm++) {
              const v = Number(monthMap?.get(String(mm)) || 0);
              if (v > 0) { firstMonth = mm; break; }
            }

            const obs = firstMonth
              ? `Primeira ocorrência no SPED: ${String(firstMonth).padStart(2, '0')}/${yearSelected}`
              : '';

            newParticipants.push({
              participantDoc: doc,
              firstMonthDetected: firstMonth,
              observacao: obs
            });
          }
        }


        await auditLog(req, 'dimob_parse_sped', 'ok', {
          cnpj,
          year: yearSelected,
          spedFiles: spedFiles.length,
          monthsUsed: monthsSorted,
          parsedF525Lines,
          skippedF525Lines,
          parsedF200Lines,
          skippedF200Lines,
          warningsCount: warnings.length,
          usedPrevious: Boolean(previousSet)
        });

        return res.json({
          cnpj,
          year: yearSelected,
          warnings,

          parsedLines: parsedF525Lines,
          skippedLines: skippedF525Lines,
          byParticipant,
          totalsByMonth,
          grandTotal,
          newParticipants,

          atividadeImobiliaria,
          parsedF200Lines,
          skippedF200Lines,

          ...(debugEnabled ? { debug } : {})
        });
      } catch (e) {
        console.error('dimob parse-sped error:', e);
        await auditLog(req, 'dimob_parse_sped', 'error', { error: e?.message || String(e) });
        return res.status(500).json({ error: 'Erro ao processar SPED.' });
      } finally {
        for (const p of cleanupPaths) {
          try { fs.unlinkSync(p); } catch { }
        }
      }
    }
  );

  router.post('/generate-file', requireCsrf, async (req, res) => {
    let cnpj = '';
    let year = NaN;
    let previousFileId = '';
    let byParticipant = [];
    let newLocatarios = [];
    let prevPath = '';

    const traceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    function send500(e) {
      const msg = e?.message || String(e);
      const stack = String(e?.stack || '');
      console.error(`[DIMOB][${traceId}] generate-file ERROR:`, e);
      return res.status(500).json({
        error: 'Erro ao gerar arquivo DIMOB.',
        traceId,
        detail: msg,
        stack: stack.split('\n').slice(0, 12).join('\n')
      });
    }

    function normalizeDocKey(d) {
      d = String(d || '').replace(/\D/g, '');
      d = d.replace(/^0+(?=\d{11,14}$)/, '');
      return d;
    }

    try {
      cnpj = String(req.body?.cnpj || '').replace(/\D/g, '');
      year = Number(req.body?.year);
      previousFileId = String(req.body?.previousFileId || '').trim();
      byParticipant = Array.isArray(req.body?.byParticipant) ? req.body.byParticipant : [];
      newLocatarios = Array.isArray(req.body?.newLocatarios) ? req.body.newLocatarios : [];

      if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ error: 'CNPJ inválido.' });
      if (!Number.isFinite(year) || year < 2015) return res.status(400).json({ error: 'Ano inválido.' });
      if (!previousFileId) return res.status(400).json({ error: 'previousFileId não informado.' });

      prevPath = dimobGetNetworkFile(previousFileId);
      if (!prevPath || !fs.existsSync(prevPath)) {
        return res.status(400).json({ error: 'Arquivo DIMOB anterior não encontrado no servidor.' });
      }

      let raw = '';
      try { raw = fs.readFileSync(prevPath, 'utf-8'); }
      catch { raw = fs.readFileSync(prevPath, 'latin1'); }

      const eol = raw.includes('\r\n') ? '\r\n' : '\n';
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return res.status(400).json({ error: 'Arquivo DIMOB anterior está vazio ou inválido.' });

      const spedMap = new Map();
      for (const it of byParticipant) {
        const docKey = normalizeDocKey(it.participantDoc);
        if (!docKey) continue;
        spedMap.set(docKey, it.months || {});
      }

      const header = lines[0] || '';
      const newHeader = dimobSetYearInHeader(header, year);

      const r01Old = lines.find(l => l.startsWith('R01'));
      if (!r01Old) return res.status(400).json({ error: 'Arquivo anterior não possui registro R01.' });

      let r01New = r01Old;
      r01New = dimobSetYearInLine(r01New, year);
      r01New = dimobSetSlice(r01New, 22, 22, '0', '0', 'right');
      r01New = dimobSetSlice(r01New, 23, 34, '000000000000', '0', 'right');
      r01New = await dimobUpdateR01UsingCnpj(r01New, cnpj);

      const locadorDoc14 = cnpj;
      const locadorNome60 = dimobSanitizeAscii(r01New.slice(44 - 1, 103).trim()).slice(0, 60);

      const layout = dimobLoadLayout();
      const r02Fields = layout?.records?.R02?.fields || [];

      const pos = (key) => {
        const f = r02Fields.find(x => x.key === key);
        if (!f) return null;
        return { ...f, start: f.start, end: f.end, len: f.len || (f.end - f.start + 1) };
      };

      const r02Lines = lines.filter(l => l.startsWith('R02'));
      const tailLines = lines.filter(l => l.startsWith('T9'));

      const r02Out = [];

      for (const ln of r02Lines) {
        const { doc14, nameStart, nameEnd, contratoIndex } = dimobExtractLocatarioFromR02(ln);
        if (!doc14) {
          r02Out.push(ln);
          continue;
        }

        const docKey = normalizeDocKey(doc14);

        let newLine = ln;
        newLine = dimobSetYearInLine(newLine, year);

        if (nameStart !== null && nameEnd !== null && nameEnd > nameStart) {
          const rawName = newLine.slice(nameStart, nameEnd);
          const name = dimobSanitizeField(rawName, 60);
          newLine = newLine.slice(0, nameStart) + name.padEnd(nameEnd - nameStart, ' ') + newLine.slice(nameEnd);
        }

        const isNew = Array.isArray(newLocatarios) && newLocatarios.some(n => normalizeDocKey(n.participantDoc) === docKey);

        if (isNew) {
          const it = newLocatarios.find(n => normalizeDocKey(n.participantDoc) === docKey) || {};
          const docRaw = String(it.participantDoc || '').replace(/\D/g, '');
          const doc14 = docRaw.padStart(14, '0').slice(-14);
          const doc11 = docRaw.padStart(11, '0').slice(-11);

          const isCpf = docRaw.length <= 11;

          const nome60 = dimobSanitizeField(it.nome || '', 60);
          const endereco = dimobSanitizeField(it.endereco || '', 60);
          const municipio = dimobSanitizeField(it.municipio || '', 20);
          const uf = dimobSanitizeField(it.uf || '', 2);
          const cod = dimobGetMunicipioCode(uf, municipio);

          newLine = dimobSetSlice(newLine, 2, 3, '02', '0', 'right');
          newLine = dimobSetSlice(newLine, 4, 4, isCpf ? '1' : '2', '0', 'right');
          newLine = dimobSetSlice(newLine, 5, 18, isCpf ? doc11.padStart(14, '0') : doc14, '0', 'right');
          newLine = dimobSetSlice(newLine, 19, 78, nome60, ' ', 'left');
          newLine = dimobSetSlice(newLine, 79, 138, endereco, ' ', 'left');
          newLine = dimobSetSlice(newLine, 139, 140, uf, ' ', 'left');
          if (cod) newLine = dimobSetSlice(newLine, 141, 144, String(cod).padStart(4, '0'), '0', 'right');
          newLine = dimobSetSlice(newLine, 145, 164, municipio, ' ', 'left');
        }

        newLine = dimobApplyF525ToR02(newLine, spedMap.get(docKey));

        if (contratoIndex >= 0) {
          const contrato = newLine.slice(contratoIndex, contratoIndex + 6);
          const ini = newLine.slice(contratoIndex + 6, contratoIndex + 14);
          const fim = newLine.slice(contratoIndex + 14, contratoIndex + 22);

          const iniFmt = ini ? ini : `0101${year}`;
          const fimFmt = fim ? fim : `3112${year}`;
          const contratoFmt = contrato || '000000';

          newLine = newLine.slice(0, contratoIndex)
            + contratoFmt
            + iniFmt
            + fimFmt
            + newLine.slice(contratoIndex + 22);
        }

        const docLocador = locadorDoc14 || '';
        const nomeLocador = locadorNome60 || '';
        const docLen = pos('cpf_cnpj_do_locador');
        const nomeLen = pos('nome_do_locador');
        if (docLen) newLine = dimobSetSlice(newLine, docLen.start, docLen.end, docLocador.padStart(docLen.len, '0'), '0', 'right');
        if (nomeLen) newLine = dimobSetSlice(newLine, nomeLen.start, nomeLen.end, nomeLocador.padEnd(nomeLen.len, ' '), ' ', 'left');

        r02Out.push(newLine);
      }

      const tailOut = [];
      for (const tl of tailLines) {
        let ln = tl;
        if (ln.startsWith('T9')) {
          ln = dimobSetSlice(ln, 17, 20, String(year).padStart(4, '0'), '0', 'right');
          ln = dimobSetSlice(ln, 21, 28, String(r02Out.length + 3).padStart(8, '0'), '0', 'right');
        }
        tailOut.push(ln);
      }

      const outLines = [newHeader, r01New, ...r02Out, ...tailOut];
      const outText = outLines.join(eol) + eol;

      const fileName = `${cnpj}-DIMOB-${year}-ORIGI.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=latin1');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(Buffer.from(outText, 'latin1'));

    } catch (e) {
      return send500(e);
    }
  });

  return router;
};
