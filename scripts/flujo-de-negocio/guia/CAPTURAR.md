# Cómo se capturan las pantallas reales para la guía

La guía web reproduce el ERP con **su HTML y su CSS reales**, capturados estado por estado. Esta es la receta, con las trampas que ya costaron tiempo.
Se corre **tras `/actualizar-flujo`** (o cuando cambie una pantalla), con el ERP local levantado sobre la foto de `main` y la base en el «Estado inicial» del caso.

## Antes de empezar
1. `espejo.mjs verificar` en verde; base preparada (`estado.mjs`, ver la skill); servidor propio (`cayla-retail-dev-3070`, nunca el puerto de otro worktree).
2. El navegador del panel con el viewport en **1280×800** (`resize_window`). La app lo borra al terminar cada turno: hay que repetirlo. A ese ancho el ERP usa el diseño de escritorio (ticket como columna fija a la derecha; «Cobro» reemplaza al ticket en el mismo lugar, no es una ventana).
3. Receptor local: `node scripts/flujo-de-negocio/guia/receptor.mjs <caso> 8977` (en segundo plano). Solo escucha en 127.0.0.1 y escribe en `.flujo-de-negocio/capturas/<caso>/`. Se apaga al terminar.

## Trampas que ya costaron
- **Los clics de la herramienta del panel fallan con el viewport simulado**: las coordenadas son las de la captura (800×500), no las de la página. Para capturar estados se hacen los clics **desde dentro de la página** (`javascript_tool`, `elemento.click()`). Es solo para medir el ERP; la práctica real la hace una persona con el mouse.
- **Un clic antes de que la página termine de hidratar no hace nada** (el botón existe en el HTML pero sin su comportamiento). Esperar ~3 s tras cada navegación, y comprobar el efecto.
- **Usar `textContent`, no `innerText`**, para comprobar qué hay en pantalla: `innerText` depende de que el panel esté dibujando (y se oculta solo).
- **Navegar a otra ruta pierde el estado** (el ticket vive en React). Dentro de la app se navega con clics en los enlaces del menú.
- **Las animaciones no avanzan con el panel oculto**: esperar 1.5–2 s y no fiarse de una captura de pantalla a media animación.
- **El menú «Ventas» ya viene desplegado** a 1280 px, desde el primer momento. Por eso el Inicio «de primera vez» es `inicio_ventas`.
- Los textos de los medios de pago están en minúscula en el HTML (la mayúscula la pone el CSS): buscar con `toLowerCase()`.
- **Los medios de pago se SUMAN: cada clic agrega una línea, no reemplaza la anterior.** Para capturar «solo Yape» hay que deseleccionar el medio (clic otra vez) antes de pasar al siguiente, y comprobar que `button[aria-pressed=true]` de los medios quede vacío. La primera captura acumuló los cinco medios y dio estados falsos.
- **Una pestaña en segundo plano no hidrata la página**: los clics se pierden. La pestaña del ERP tiene que estar al frente (`tabs_select`) mientras se captura. Si hay otra pestaña delante (la de la guía), la del ERP no responde.
- **`fuentes: 0` al generar** casi siempre es esta causa: el archivo guardado no es una fuente (mirar sus primeros bytes: debe decir `wOF2`).

## Qué se captura (el guion y la réplica los esperan por nombre)
| Captura | Cómo se llega |
|---|---|
| `estilos.css`, `fuentes.json` + `fuente-N.woff2`, `documento.json` | una vez, desde cualquier pantalla (script de activos, abajo) |
| `inicio_ventas` | Inicio |
| `vender_vacio` | Punto de Venta, ticket vacío (esperar 3 s de hidratación) |
| `vender_blusa` | clic en la talla L de «Blusa Emma» (`aria-label="Agregar Blusa Emma Beige talla L"`) |
| `vender_blusa_2` | clic en «Aumentar cantidad» |
| `vender_casaca` | clic en la M de «Casaca Luciana» (quitar la prenda después) |
| `cobro_base` | clic en «Cobrar» |
| `cobro_<medio>_<comprobante>` (15) | en «Cobro»: por cada medio (botones `F1`…`F5`) y cada comprobante (Boleta / Factura / Nota de venta) |
| `ayuda_dni` | clic en el «!» junto al DNI (`aria-label="Qué es Consulta de DNI"`): de aquí solo se usa el globo `.anim-globo` y las clases del botón |
| `registrada` | con Yape + Boleta, clic en «Confirmar cobro» (**escribe una venta real**: restaurar la base después) |
| `vender_post` | clic en «Sin imprimir» (pantalla tras la venta) |

`sede_abierta` y `clienta_abierta` se capturaron una vez y **no se usan**: traían un ticket de 2 prendas de fondo. La réplica responde con un aviso de la práctica.

## El ayudante de captura (se pega en la página con `javascript_tool`)
```js
window.__cap = {
  R: 'http://127.0.0.1:8977/guardar?nombre=',
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  txt: (e) => e.textContent.replace(/\s+/g, ' ').trim(),
  html() { const c = document.body.cloneNode(true); c.querySelectorAll('script,noscript,template,next-route-announcer,nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog-overlay],link[rel=preload]').forEach((n) => n.remove()); return c.innerHTML; },
  async enviar(nombre, extra = {}) { const cuerpo = JSON.stringify({ nombre, url: location.pathname, ancho: innerWidth, alto: innerHeight, titulo: document.title, ...extra, html: this.html() });
    const r = await fetch(this.R + encodeURIComponent('estado-' + nombre + '.json'), { method: 'POST', body: cuerpo }); if (!r.ok) throw new Error(nombre + ' ' + r.status); const j = await r.json(); return nombre + ' ' + Math.round(j.bytes / 1024) + 'KB'; },
};
```

## El script de activos (CSS, fuentes, atributos del documento) — una vez
**Trampa que dio un archivo de fuente falso:** el CSS dice `url(../media/xxx.woff2)`, una ruta **relativa a la hoja de estilo**, no a la página. Resolverla contra la página (`/vender`) devuelve la página de error de Next (HTML, ~16 KB) y se guarda como «fuente». Por eso se prueba cada hoja como base y se exige que el archivo empiece con la firma `wOF2`.
```js
const R = 'http://127.0.0.1:8977/guardar?nombre=';
const post = async (nombre, cuerpo) => { const r = await fetch(R + encodeURIComponent(nombre), { method: 'POST', body: cuerpo }); if (!r.ok) throw new Error(nombre + ' ' + r.status); return r.json(); };
const hojas = [...document.querySelectorAll('link[rel="stylesheet"]')].map((n) => n.href);
const partes = [];
for (const n of document.querySelectorAll('link[rel="stylesheet"], style')) { if (n.tagName === 'LINK') partes.push('/* ' + n.getAttribute('href') + ' */\n' + await (await fetch(n.href)).text()); else partes.push(n.textContent); }
const css = partes.join('\n'); await post('estilos.css', css);
const bloques = css.match(/@font-face\s*{[^}]*}/g) || [], fuentes = [];
for (const [i, b] of bloques.entries()) {
  const url = (b.match(/url\(([^)]+)\)/) || [])[1]?.replace(/["']/g, ''); if (!url) continue;
  let buf = null;
  for (const base of [...hojas, location.href]) { try { const r = await fetch(new URL(url, base)); if (!r.ok) continue; const b2 = await r.arrayBuffer(); if (String.fromCharCode(...new Uint8Array(b2.slice(0, 4))) === 'wOF2') { buf = b2; break; } } catch (e) {} }
  if (!buf) continue; // sin fuente válida: no se guarda nada falso
  const archivo = 'fuente-' + i + '.woff2'; await post(archivo, buf);
  fuentes.push({ i, archivo, familia: (b.match(/font-family:\s*([^;]+);/) || [])[1], peso: (b.match(/font-weight:\s*([^;]+);/) || [])[1], estilo: (b.match(/font-style:\s*([^;]+);/) || [])[1], rango: (b.match(/unicode-range:\s*([^;]+);/) || [])[1], bytes: buf.byteLength });
}
await post('fuentes.json', JSON.stringify(fuentes));
await post('documento.json', JSON.stringify({ htmlClase: document.documentElement.className, bodyClase: document.body.className, titulo: document.title }));
```
(No hay imágenes que capturar: el logo es un SVG dentro del propio HTML.)

## Después
1. `node scripts/flujo-de-negocio/guia/generar-guia.mjs <flujo>/<caso> --guardar-capturas` → copia al repo (`docs/flujos/<flujo>/capturas/<caso>/`) solo lo que la guía usa (~2,3 MB). Con eso la guía se regenera sin el ERP. Cada recaptura suma ~2 MB al historial: rehacerla solo si cambió una pantalla.
2. `… --entregar` → `.flujo-de-negocio/guias/<caso>.html` y la carpeta para enviar en `~/Documents/CAYLA-flujos/<caso>/` (HTML + LEEME).
3. Apagar el receptor, restaurar la base al origen (`estado.mjs`) y volver el viewport a `desktop`.
