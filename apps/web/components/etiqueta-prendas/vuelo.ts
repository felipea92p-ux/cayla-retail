// El vuelo de una prenda a la etiqueta (ADR-0136: responde a marcarla o escanearla, 480 ms, sin rebote). Una copia de la miniatura
// sale de donde estaba (su fila o el lector) y llega al lugar de su pieza en el mosaico; la pieza aparece recién al llegar. Sin
// movimiento (`prefers-reduced-motion`) no vuela: la pieza ya está.

/** Una prenda recién marcada: qué piezas son suyas y de dónde sale (se busca al volar, cuando la pantalla ya cambió: la tarjeta de la
 *  lectura recién entonces existe). */
export type Vuelo = { desde: () => Element | null; ids: readonly string[] };

export const sinMovimiento = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Vuela una copia de `desde` hasta `hasta` y devuelve cuándo llegó. */
export function volar(desde: Element, hasta: Element): Promise<void> {
  const inicio = desde.getBoundingClientRect();
  const fin = hasta.getBoundingClientRect();
  if (sinMovimiento() || fin.width === 0 || fin.height === 0 || inicio.width === 0 || inicio.height === 0) return Promise.resolve();
  const d = { rect: inicio, html: (desde as HTMLElement).outerHTML };
  const copia = document.createElement("div");
  copia.className = "eqp-vuelo";
  copia.setAttribute("aria-hidden", "true");
  copia.innerHTML = d.html;
  Object.assign(copia.style, { left: `${d.rect.left}px`, top: `${d.rect.top}px`, width: `${d.rect.width}px`, height: `${d.rect.height}px` });
  (copia.firstElementChild as HTMLElement | null)?.style.setProperty("width", "100%");
  (copia.firstElementChild as HTMLElement | null)?.style.setProperty("height", "100%");
  document.body.appendChild(copia);
  const dx = fin.left - d.rect.left;
  const dy = fin.top - d.rect.top;
  const sx = fin.width / d.rect.width;
  const sy = fin.height / d.rect.height;
  // Un arco corto: sube un poco a mitad de camino y baja a su lugar.
  const animacion = copia.animate(
    [
      { transform: "translate(0, 0) scale(1)", transformOrigin: "0 0" },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 36}px) scale(${(1 + sx) / 2}, ${(1 + sy) / 2})`, transformOrigin: "0 0", offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: "0 0" },
    ],
    { duration: 480, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)", fill: "forwards" },
  );
  return new Promise((listo) => {
    let hecho = false;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      copia.remove();
      listo();
    };
    animacion.finished.then(terminar, terminar);
    // Una pestaña de fondo no anima: la copia no puede quedarse flotando.
    window.setTimeout(terminar, 900);
  });
}
