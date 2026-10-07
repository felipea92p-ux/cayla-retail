"use client";

import { useEffect, useState, type RefObject } from "react";

type Punto = [number, number];
type Trazo = { d: string; punta: Punto };
type Medida = { venta: Trazo | null; elegida: Trazo | null; ensayo: Trazo | null };
const SIN_MEDIDA: Medida = { venta: null, elegida: null, ensayo: null };

/** Una curva suave de `a` a `b`: sale y llega en horizontal, como un hilo tenso entre dos clavos. */
function curva([x1, y1]: Punto, [x2, y2]: Punto): string {
  const dx = (x2 - x1) * 0.55;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const mismoTrazo = (a: Trazo | null, b: Trazo | null) => a?.d === b?.d;

/**
 * Los hilos de la mesa (ADR-0360, maqueta A2): del talón elegido a la mitad de arriba del puente, y de la prenda que se toca a la mitad
 * de abajo (con el mouse encima, un hilo de ensayo punteado). Solo en tres columnas: con menos ancho no hay un lugar donde atarlos.
 *
 * Se mide en el DOM (`data-vsr-*`), nunca por clases de estilo, y se vuelve a medir al mover la ventana, al desplazar (las dos
 * columnas de la derecha van pegadas a la ventana mientras el talón se va con la lista) y 380 ms después de elegir (el talón elegido se
 * adelanta con una transición). Cada trazo se «escribe» una sola vez, al aparecer: un re-medido no lo repite.
 */
export function HilosMesa({
  raiz,
  activo,
  ventaId,
  prendaId,
  apuntadaId,
  hecho,
}: {
  raiz: RefObject<HTMLDivElement | null>;
  activo: boolean;
  ventaId: string | null;
  prendaId: string | null;
  apuntadaId: string | null;
  hecho: boolean;
}) {
  const [m, setM] = useState<Medida>(SIN_MEDIDA);

  // Todo en un solo efecto: se mide en un cuadro de animación (nunca de forma síncrona dentro del efecto) y se vuelve a medir al mover la
  // ventana, al desplazar y 380 ms después de elegir.
  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      const el = raiz.current;
      if (!el || !activo || !ventaId) {
        setM((p) => (p === SIN_MEDIDA ? p : SIN_MEDIDA));
        return;
      }
      const base = el.getBoundingClientRect();
      const buscar = (selector: string) => el.querySelector<HTMLElement>(selector);
      const lado = (e: HTMLElement, cual: "izq" | "der", contenedor?: HTMLElement | null): Punto => {
        const r = e.getBoundingClientRect();
        let y = r.top + r.height / 2;
        if (contenedor) {
          // Una prenda desplazada fuera de su columna: el hilo se queda en el borde, no se va a la nada.
          const c = contenedor.getBoundingClientRect();
          y = Math.max(c.top + 14, Math.min(c.bottom - 14, y));
        }
        return [(cual === "izq" ? r.left : r.right) - base.left, y - base.top];
      };
      const talon = buscar(`[data-vsr-talon="${CSS.escape(ventaId)}"]`);
      const slotVenta = buscar('[data-vsr-slot="venta"]');
      const slotPrenda = buscar('[data-vsr-slot="prenda"]');
      const columna = buscar("[data-vsr-prendas]");
      const trazo = (a: Punto, b: Punto): Trazo => ({ d: curva(a, b), punta: b });
      const venta = talon && slotVenta ? trazo(lado(talon, "der"), lado(slotVenta, "izq")) : null;
      const hasta = (id: string | null): Trazo | null => {
        const t = id && slotPrenda ? buscar(`[data-vsr-prenda="${CSS.escape(id)}"]`) : null;
        return t && slotPrenda ? trazo(lado(t, "izq", columna), lado(slotPrenda, "der")) : null;
      };
      const elegida = hasta(prendaId);
      const ensayo = apuntadaId && apuntadaId !== prendaId ? hasta(apuntadaId) : null;
      setM((p) => (mismoTrazo(p.venta, venta) && mismoTrazo(p.elegida, elegida) && mismoTrazo(p.ensayo, ensayo) ? p : { venta, elegida, ensayo }));
    };
    const pedir = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(medir);
    };
    pedir();
    const tras = window.setTimeout(pedir, 380);
    window.addEventListener("scroll", pedir, { capture: true, passive: true });
    window.addEventListener("resize", pedir);
    const observador = raiz.current && typeof ResizeObserver !== "undefined" ? new ResizeObserver(pedir) : null;
    if (raiz.current) observador?.observe(raiz.current);
    return () => {
      cancelAnimationFrame(cuadro);
      clearTimeout(tras);
      window.removeEventListener("scroll", pedir, { capture: true });
      window.removeEventListener("resize", pedir);
      observador?.disconnect();
    };
  }, [raiz, activo, ventaId, prendaId, apuntadaId]);

  if (!activo) return null;
  return (
    <svg className="vsr-hilos" aria-hidden>
      {m.ensayo && <path className="vsr-h-prev" d={m.ensayo.d} />}
      {m.venta && <path key={`v-${ventaId}`} className="vsr-h-sel vsr-traza" pathLength={1} d={m.venta.d} />}
      {m.venta && <circle key={`pv-${ventaId}`} className="vsr-punta" r={4.5} cx={m.venta.punta[0]} cy={m.venta.punta[1]} />}
      {m.elegida && <path key={`p-${prendaId}`} className="vsr-h-sel vsr-traza" pathLength={1} d={m.elegida.d} />}
      {m.elegida && <circle key={`pp-${prendaId}`} className="vsr-punta" r={4.5} cx={m.elegida.punta[0]} cy={m.elegida.punta[1]} />}
      {hecho && m.venta && <path className="vsr-h-ok" pathLength={1} d={m.venta.d} />}
      {hecho && m.elegida && <path className="vsr-h-ok" pathLength={1} d={m.elegida.d} />}
    </svg>
  );
}
