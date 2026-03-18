// public/js/shared/erp-txt-layouts.js
(function () {
  const iobLoteNormal = Object.freeze({
    id: 'iob-lote-normal-v1',
    label: 'IOB Lote Normal',
    source: 'https://ajudaonline.iob.com.br/SGC/cscoutimpnorlay.htm',
    fields: Object.freeze({
      DTI: 2,
      DTF: 9,
      DBI: 10,
      DBF: 15,
      CRI: 16,
      CRF: 21,
      H3I: 22,
      H3F: 24,
      CPI: 25,
      CPF: 49,
      VLI: 50,
      VLF: 64,
      CDI: 68,
      CDF: 81,
      CCI: 82,
      CCF: 95,
      H4I: 533,
      H4F: 536,
      HEI: 2,
      HEF: 51,
      HTI: 11,
      HTF: 25,
    }),
  });

  const layouts = Object.freeze({
    iobLoteNormal,
  });

  function getLayout(key) {
    if (!key) return null;
    return layouts[String(key)] || null;
  }

  window.ErpTxtLayouts = Object.freeze({
    layouts,
    getLayout,
    IOB_LOTE_NORMAL: iobLoteNormal,
  });
})();
