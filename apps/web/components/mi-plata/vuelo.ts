import { trayectoDelVuelo, type Caja } from "@/lib/vuelo-reglas";

// El vuelo de la prenda a «Tu compra» (Felipe 2026-10-28): lo que hace el navegador. La cuenta (a dónde, cuánto tarda) está en
// `lib/vuelo-reglas.ts`, con su prueba; la forma, en `app/estilos/compra-celular.css`. Una vez, sin rebote ni bucle. Con
// `prefers-reduced-motion` no vuela: avisa que llegó de inmediato, para que la línea solo se ilumine.

const cajaDe = (r: DOMRect): Caja => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/** Lo que hay que guardar ANTES de cambiar la compra: al agregar la prenda, la hoja se cierra y su botón deja de existir. */
export type SalidaDelVuelo = { caja: Caja; miniatura: Node | null };

/**
 * Desde dónde sale. Con el botón que se tocó (el «Agregar» de la hoja), la miniatura de la fila sale de su centro; sin botón (el «+ 9» de
 * la fila), sale de su lugar en la lista. Sin miniatura a la vista (una prenda nueva) vuela una bola con la cantidad desde el botón.
 */
export function salidaDelVuelo(clave: string, boton: Element | null): SalidaDelVuelo | null {
  const mini = document.querySelector(`[data-vuelo-miniatura="${CSS.escape(clave)}"]`);
  const r = mini?.getBoundingClientRect();
  const b = boton?.getBoundingClientRect();
  const hayBoton = Boolean(b && b.width > 0);
  const enPantalla = Boolean(r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight);
  if (mini && r && r.width > 0 && (hayBoton || enPantalla)) {
    const caja = b && hayBoton ? { left: b.left + b.width / 2 - r.width / 2, top: b.top + b.height / 2 - r.height / 2, width: r.width, height: r.height } : cajaDe(r);
    return { caja, miniatura: mini.cloneNode(true) };
  }
  return b && hayBoton ? { caja: { left: b.left + b.width / 2 - 22, top: b.top + b.height / 2 - 22, width: 44, height: 44 }, miniatura: null } : null;
}

/** Dónde aterriza: la miniatura de su línea en «Tu compra» (PC) o, si esa no se ve (celular), la esquina izquierda de la barra de abajo. */
export function destinoDelVuelo(clave: string): Caja | null {
  const linea = document.querySelector(`[data-vuelo-destino="${CSS.escape(clave)}"]`);
  const r = linea?.getBoundingClientRect();
  if (r && r.width > 0) return { left: r.left, top: r.top + (r.height - 36) / 2, width: 36, height: 36 };
  const barra = document.querySelector("[data-vuelo-barra]")?.getBoundingClientRect();
  return barra && barra.width > 0 ? { left: barra.left + 14, top: barra.top + (barra.height - 36) / 2, width: 36, height: 36 } : null;
}

export function volarATuCompra({ salida, cantidad, destino, alLlegar }: { salida: SalidaDelVuelo | null; cantidad: number; destino: Caja | null; alLlegar: () => void }) {
  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!salida || !destino || sinMovimiento || typeof Element.prototype.animate !== "function") {
    alLlegar();
    return;
  }
  const t = trayectoDelVuelo(salida.caja, destino);
  const { left, top, width, height } = salida.caja;
  const x = document.createElement("div");
  const y = document.createElement("div");
  x.className = "vuelo-x";
  y.className = "vuelo-y";
  x.setAttribute("aria-hidden", "true");
  const cuerpo = document.createElement("div");
  if (salida.miniatura) {
    cuerpo.className = "vuelo-cuerpo";
    cuerpo.style.cssText = `width:${width}px;height:${height}px`;
    cuerpo.appendChild(salida.miniatura);
    y.appendChild(cuerpo);
    const c = document.createElement("span");
    c.className = "vuelo-cant";
    c.textContent = String(cantidad);
    y.appendChild(c);
  } else {
    cuerpo.className = "vuelo-bola";
    cuerpo.textContent = `+${cantidad}`;
    y.appendChild(cuerpo);
  }
  x.appendChild(y);
  document.body.appendChild(x);
  // El arco: en horizontal va de corrido; en vertical sube un poco antes de bajar a su lugar, y se achica al llegar.
  const horizontal = x.animate([{ transform: `translate(${left}px, ${top}px)` }, { transform: `translate(${left + t.dx}px, ${top}px)` }], {
    duration: t.ms,
    easing: "cubic-bezier(0.45, 0.05, 0.25, 1)",
    fill: "forwards",
  });
  y.animate(
    [
      { transform: "translateY(0) scale(1)", offset: 0 },
      { transform: `translateY(${-t.subida}px) scale(${1 - (1 - t.escala) * 0.25})`, offset: 0.32, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
      { transform: `translateY(${t.dy}px) scale(${t.escala})`, offset: 1 },
    ],
    { duration: t.ms, easing: "cubic-bezier(0.55, 0, 0.3, 1)", fill: "forwards" },
  );
  horizontal.onfinish = () => {
    x.remove();
    alLlegar();
  };
}
