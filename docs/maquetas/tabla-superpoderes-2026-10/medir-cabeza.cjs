// Mide que, al desplazar rápido la tabla con la cabecera pegada, ninguna fila ni el vidrio de la tabla asome encima de ella,
// y saca fotos de las esquinas a doble resolución. Corre en un Chrome sin ventana (el panel del navegador, oculto, no anima).
// Uso: node medir-cabeza.cjs <ruta a playwright> <carpeta de fotos>   (con la config «maquetas» sirviendo docs/maquetas en :8791)
const { chromium } = require(process.argv[2]);
(async () => {
  const b = await chromium.launch();
  const out = [];
  for (const tema of ['claro', 'oscuro']) for (const modo of ['globo', 'fila']) for (const grande of [false, true]) {
    const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
    await p.goto('http://localhost:8791/tabla-superpoderes-2026-10/index.html?x=' + Date.now());
    await p.evaluate(([tema, modo, grande]) => {
      const c = (k, v) => document.querySelector(`[data-ctl="${k}"] [data-v="${v}"]`).click();
      c('tema', tema); c('sp', modo);
      const l = document.querySelector('[data-letra]'); if ((l.getAttribute('aria-checked') === 'true') !== grande) l.click();
      document.querySelector('#disp').scrollIntoView();
    }, [tema, modo, grande]);
    await p.waitForTimeout(1500);
    const box = await p.evaluate(() => { const r = document.querySelector('#cont').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
    // desplazamientos: suaves y de golpe (rueda grande), midiendo en el mismo cuadro
    let malasTot = 0, n = 0;
    for (const delta of [120, 200, 900, 1500, -700, 2500, -2500, 600]) {
      await p.mouse.move(box.x + box.w / 2, box.y + 400);
      await p.mouse.wheel(0, delta);
      await p.waitForTimeout(16);
      for (let k = 0; k < 6; k++) {
        const r = await p.evaluate(() => {
          const c = document.querySelector('#cont'), cr = c.getBoundingClientRect(), h = document.querySelector('.t-cabeza').getBoundingClientRect();
          const hb = h.bottom - cr.top, ht = h.top - cr.top;
          const pegada = Math.abs(ht - 72) < 0.6;
          const filas = [...document.querySelectorAll('.t-fila,.t-pie')].map((x) => { const r = x.getBoundingClientRect(); const m = getComputedStyle(x).clipPath.match(/inset\(([\d.]+)%/); return { top: r.top - cr.top, bot: r.bottom - cr.top, desde: r.top - cr.top + (m ? (+m[1] / 100) * r.height : 0) }; });
          const f = document.querySelector('.t-fondo'), fr = f.getBoundingClientRect(), fm = getComputedStyle(f).clipPath.match(/inset\(([\d.]+)%/);
          const fondoDesde = fr.top - cr.top + (fm ? (+fm[1] / 100) * fr.height : 0);
          const malas = pegada ? filas.filter((f) => f.top < hb - 0.5 && f.desde < Math.min(hb, f.bot) - 1).length + (fondoDesde < hb - 1 && fr.bottom - cr.top > hb ? 1 : 0) : 0;
          return { malas, pegada };
        });
        malasTot += r.malas; n++;
        await p.waitForTimeout(16);
      }
    }
    // foto de la cabecera pegada, con sus esquinas
    await p.evaluate(() => { document.querySelector('#cont').scrollTop = 420; });
    await p.waitForTimeout(300);
    const h = await p.evaluate(() => { const r = document.querySelector('.t-cabeza').getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; });
    if (!h.w) { out.push('sin cabeza visible: ' + JSON.stringify(h)); await p.close(); continue; }
    const nombre = `${tema}-${modo}${grande ? '-grande' : ''}`;
    await p.screenshot({ fullPage: true, path: `${process.argv[3]}/esq-izq-${nombre}.png`, clip: { x: h.x - 20, y: h.y - 40, width: 140, height: h.h + 60 } });
    await p.screenshot({ fullPage: true, path: `${process.argv[3]}/esq-der-${nombre}.png`, clip: { x: h.x + h.w - 120, y: h.y - 40, width: 140, height: h.h + 60 } });
    out.push(`${nombre}: ${n} mediciones durante desplazamientos rápidos, filas o vidrio asomando sobre la cabecera = ${malasTot}`);
    await p.close();
  }
  console.log(out.join('\n'));
  await b.close();
})();
