// Ronda 18 de /unificar: el HTML de cada propuesta del «?» de la cabecera, para las demos vivas y para aplicarlo en vivo sobre la pantalla.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** El «?» y lo que abre, según la opción: P1 (baja en su lugar), P2 (globo), P3 (con palabra, baja en su lugar). */
export function partes(opcion, id, titulo, texto, abierto = false) {
  const exp = abierto ? "true" : "false";
  const oculto = abierto ? "" : " hidden";
  const etq = `Qué es ${esc(titulo)}`;
  if (/^V[123]$/.test(opcion)) {
    // Vuelta 2: P2 más fina. V3 dibuja su anillo con un círculo (r = 15.9 → perímetro ≈ 100, para el dasharray).
    const v = opcion.toLowerCase();
    const anillo = v === "v3" ? `<svg class="prop-anillo" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/></svg>` : "";
    return {
      boton: `<span class="prop-ancla"><button type="button" class="prop-q prop-fino ${v}" data-forma="globo" aria-expanded="${exp}" aria-controls="${id}" aria-label="${etq}">${anillo}<span class="prop-q-signo" aria-hidden="true">?</span></button><span id="${id}" class="prop-globo prop-fino ${v}${abierto ? " prop-entra" : ""}" role="note"${oculto}><span class="prop-pico" aria-hidden="true"></span><span class="prop-globo-et"><i aria-hidden="true"></i>${esc(titulo)}</span><span class="prop-globo-txt">${esc(texto)}</span></span></span>`,
      caja: "",
    };
  }
  if (opcion === "P2")
    return {
      boton: `<span class="prop-ancla"><button type="button" class="prop-q" data-forma="globo" aria-expanded="${exp}" aria-controls="${id}" aria-label="${etq}" title="Qué es esta pantalla">?</button><span id="${id}" class="prop-globo" role="note"${oculto}>${esc(texto)}</span></span>`,
      caja: "",
    };
  const boton =
    opcion === "P3"
      ? `<button type="button" class="prop-q prop-q-palabra" aria-expanded="${exp}" aria-controls="${id}"><span class="prop-q-signo" aria-hidden="true">?</span>Qué es esto</button>`
      : `<button type="button" class="prop-q" aria-expanded="${exp}" aria-controls="${id}" aria-label="${etq}" title="Qué es esta pantalla">?</button>`;
  return { boton, caja: `<p id="${id}" class="prop-explica"${oculto}>${esc(texto)}</p>` };
}

/** Una cabecera de ejemplo, viva, con la opción puesta (A = la de hoy). `dato` es una frase que dice un dato y no se esconde. */
export function demo(opcion, { id, sede, titulo, frase, dato }) {
  const arriba = `<p class="prop-sede"><i aria-hidden="true"></i>${esc(sede)} · viernes, 30 de octubre · 09:16</p>`;
  if (opcion === "A") return `<div class="prop-demo">${arriba}<h1>${esc(titulo)}</h1><p class="prop-frase-hoy">${esc(frase)}</p></div>`;
  const { boton, caja } = partes(opcion, `demo-${opcion}-${id}`, titulo, frase);
  return `<div class="prop-demo">${arriba}<h1>${esc(titulo)}${boton}</h1>${dato ? `<p class="prop-dato">${esc(dato)}</p>` : ""}${caja}</div>`;
}

/** La demo de la vuelta 2: la cabecera con cifras debajo, para ver cuánto deja pasar el globo. */
export function demoFino(opcion, { id, sede, titulo, frase }) {
  const arriba = `<p class="prop-sede"><i aria-hidden="true"></i>${esc(sede)} · viernes, 30 de octubre · 09:16</p>`;
  const { boton } = partes(opcion, `demo-${opcion}-${id}`, titulo, frase);
  const cifras = `<div class="prop-demo-cifras"><span>S/ 86<small>Gastado en octubre</small></span><span>11<small>Gastos</small></span><span>11<small>Sin comprobante</small></span></div>`;
  return `<div class="prop-demo prop-demo-fondo">${arriba}<h1 style="position:relative;z-index:2">${esc(titulo)}${boton}</h1>${cifras}</div>`;
}

/** Corre EN LA PÁGINA (Playwright `evaluate`): cambia la frase de la cabecera por la opción. Solo el dibujo; no guarda nada. */
export function aplicar([opcion, abierto, html]) {
  const cab = document.querySelector('header[data-voz="cabecera"]');
  if (!cab) throw new Error("sin cabecera");
  const h1 = cab.querySelector("h1");
  const frase = h1.nextElementSibling?.tagName === "P" ? h1.nextElementSibling : null;
  if (opcion === "A") return frase?.textContent ?? "";
  // El globo de P2 flota sobre lo que sigue (en la pieza real iría en la capa flotante, como el de <Ayuda>).
  if (opcion === "P2" || /^V[123]$/.test(opcion))
    for (let n = h1; n && n.tagName !== "MAIN" && n !== document.body; n = n.parentElement) Object.assign(n.style, { position: n === cab ? "relative" : n.style.position || "relative", zIndex: "40" });
  const t = document.createElement("div");
  t.innerHTML = html.boton;
  h1.appendChild(t.firstElementChild);
  if (frase) {
    if (html.caja) {
      t.innerHTML = html.caja;
      frase.replaceWith(t.firstElementChild);
    } else frase.remove();
  }
  return "";
}
