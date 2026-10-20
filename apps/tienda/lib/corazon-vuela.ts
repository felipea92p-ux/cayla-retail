/**
 * El corazón de una prenda que se acaba de guardar vuela hasta la cuenta («Entrar» o «Cuenta» en la cabecera), donde está «Favoritos»:
 * así se sabe dónde quedó sin escribir una palabra. Solo dibujo en el navegador (nada se guarda aquí). Sin movimiento si la persona
 * pidió «reducir movimiento» (solo late la cuenta), y sin nada si la cabecera no está a la vista.
 */
const DESTINO = "[data-destino-corazon]";

/** La cuenta de la cabecera que se dibuja (la del celular o la de la computadora; la otra no ocupa lugar). */
function destinoDibujado(): HTMLElement | null {
  for (const e of document.querySelectorAll<HTMLElement>(DESTINO)) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return e;
  }
  return null;
}

function latir(destino: HTMLElement) {
  destino.removeAttribute("data-recibe");
  void destino.offsetWidth; // reinicia la animación si llegan dos seguidos
  destino.setAttribute("data-recibe", "");
  window.setTimeout(() => destino.removeAttribute("data-recibe"), 700);
}

export function volarCorazon(desde: HTMLElement) {
  const destino = destinoDibujado();
  if (!destino) return;
  const b = destino.getBoundingClientRect();
  // La cabecera no se queda pegada: con la página más abajo, la cuenta puede estar arriba de lo que se ve. Entonces el corazón sube hasta
  // el borde de arriba, donde está la cabecera, y se apaga ahí (y la cuenta no late: nadie la ve).
  const aLaVista = b.bottom > 0 && b.top < window.innerHeight;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (aLaVista) latir(destino);
    return;
  }
  const a = desde.getBoundingClientRect();
  const lado = 22;
  const x0 = a.left + a.width / 2 - lado / 2;
  const y0 = a.top + a.height / 2 - lado / 2;
  const dx = b.left + b.width / 2 - lado / 2 - x0;
  const dy = (aLaVista ? b.top + b.height / 2 - lado / 2 : -lado) - y0;
  const icono = desde.querySelector("svg");
  const vuelo = document.createElement("span");
  vuelo.setAttribute("aria-hidden", "true");
  vuelo.style.cssText = `position:fixed;left:${x0}px;top:${y0}px;width:${lado}px;height:${lado}px;z-index:1000;pointer-events:none;color:var(--rojo);`;
  if (icono) {
    const copia = icono.cloneNode(true) as SVGElement;
    copia.setAttribute("width", String(lado));
    copia.setAttribute("height", String(lado));
    copia.style.fill = "currentColor";
    copia.style.stroke = "currentColor";
    vuelo.appendChild(copia);
  }
  document.body.appendChild(vuelo);
  // Sube un poco y luego cae hacia la cuenta, achicándose: un arco corto, sin rebote.
  const arco = Math.min(70, Math.abs(dy) * 0.5 + 24);
  const animacion = vuelo.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - arco}px) scale(1.25)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(.45)`, opacity: aLaVista ? 0.9 : 0 },
    ],
    { duration: 800, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" },
  );
  animacion.onfinish = () => {
    vuelo.remove();
    if (aLaVista) latir(destino);
  };
  animacion.oncancel = () => vuelo.remove();
}
