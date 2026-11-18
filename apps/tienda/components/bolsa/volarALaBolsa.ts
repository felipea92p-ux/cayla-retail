// La foto que vuela a la bolsa (ADR-0524, «G · Pasarela»; la maqueta, `M.volar` y `M.latir`): al agregar una prenda desde su ficha, la foto que se está viendo
// se achica y cruza la pantalla hasta el ícono de la bolsa de la cabecera, que da un golpecito al llegar. Es solo un adorno de lo que ya se dijo en
// la línea «✓ La talla M ya está en tu bolsa»: nada depende de él, y con «reducir movimiento» no corre. Vive en el navegador (toca el DOM), no en `lib/`.

/** Dónde está la bolsa de la cabecera, si se ve (en el celular y en la computadora hay una sola visible). */
function bolsaVisible(): HTMLElement | null {
  const bolsas = [...document.querySelectorAll<HTMLElement>("[data-bolsa]")];
  return bolsas.find((b) => b.getClientRects().length > 0) ?? null;
}

/** La foto de la galería que más se ve: la grande en la computadora, la que está a la vista en la tira del celular. */
function fotoMasVisible(): HTMLElement | null {
  let mejor: { foto: HTMLElement; visible: number } | null = null;
  for (const foto of document.querySelectorAll<HTMLElement>(".t-galeria .t-foto-g")) {
    const r = foto.getBoundingClientRect();
    const ancho = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    const alto = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    const visible = Math.max(0, ancho) * Math.max(0, alto);
    if (visible > 0 && (!mejor || visible > mejor.visible)) mejor = { foto, visible };
  }
  return mejor?.foto ?? null;
}

const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** El golpecito del globo (o del ícono, si todavía no tiene número) al llegar la foto. */
function latir(bolsa: HTMLElement) {
  const globo = bolsa.querySelector<HTMLElement>(".t-globo") ?? bolsa;
  globo.animate([{ transform: "scale(1)" }, { transform: "scale(1.6)" }, { transform: "scale(1)" }], { duration: 560, easing: "cubic-bezier(.2,.7,.2,1)" });
}

/**
 * Hace volar la foto que se ve hasta la bolsa y, al llegar, la hace latir. Sin foto a la vista, sin bolsa a la vista o con «reducir movimiento», no hace nada.
 * La copia que vuela lleva su placa (la foto es clara en los dos temas) y se borra sola al llegar; nunca se queda en la página.
 */
export function volarALaBolsa(): void {
  if (sinMovimiento()) return;
  const foto = fotoMasVisible();
  const bolsa = bolsaVisible();
  const imagen = foto?.querySelector<HTMLImageElement>("img:not(.cp-lupa):not(.t-foto-previa)");
  if (!foto || !bolsa || !imagen?.currentSrc) return;
  const a = foto.getBoundingClientRect();
  const b = bolsa.getBoundingClientRect();
  const vuelo = document.createElement("div");
  vuelo.setAttribute("aria-hidden", "true");
  Object.assign(vuelo.style, {
    position: "fixed",
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    zIndex: "1000",
    pointerEvents: "none",
    margin: "0",
    background: "var(--t-foto)",
    overflow: "hidden",
  });
  const copia = document.createElement("img");
  copia.alt = "";
  copia.src = imagen.currentSrc;
  Object.assign(copia.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain", mixBlendMode: "multiply" });
  vuelo.appendChild(copia);
  document.body.appendChild(vuelo);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  vuelo
    .animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 60}px) scale(.45)`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(.05)`, opacity: 0.2 },
      ],
      { duration: 950, easing: "cubic-bezier(.6,0,.25,1)" },
    )
    .finished.then(
      () => {
        vuelo.remove();
        latir(bolsa);
      },
      () => vuelo.remove(),
    );
}
