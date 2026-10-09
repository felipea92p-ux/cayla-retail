"use client";

import { useSyncExternalStore } from "react";
import { Modal } from "@/components/ui/Modal";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";

/* ====================================================================
   Aviso destacado · la confirmación que no se puede pasar por alto (2026-10-08)

   Felipe: «al bajar a piso debe salir un pop up notorio que indique que en efecto se bajó». El aviso de la esquina
   (`avisar.exito`) se iba en 4 s mientras la colaboradora miraba el perchero, y la bajada quedaba sin confirmar a la vista.
   Esta hoja centrada dice lo que pasó en grande —un visto que se dibuja, la cifra y la prenda— y se cierra sola.

   · Se monta UNA vez en `app/layout.tsx`, como `<Avisos />`, y su estado vive fuera de React: sobrevive al `router.refresh`
     que sigue a un guardado aunque Next vuelva a montar la página (lo hace cuando un filtro cambió la URL con
     `history.replaceState`). Un pop-up dibujado dentro de la pantalla moría en ese mismo instante.
   · Espera al loader (ADR-0149), igual que los avisos: «listo, se guardó» no se dice encima de «Cargando…».
   · Se cierra sola (la barra de abajo se vacía; con el mouse encima se pausa), con la ×, Escape o un clic afuera. Sin botón
     «Cerrar» al pie: la hoja no guarda nada (ADR-0358, `accion.cerrar`).
   · Uno a la vez: si llega otro mientras uno está abierto, lo reemplaza (dos bajadas seguidas dicen la última).
   · Úsalo solo para lo que la persona TIENE que ver confirmado con el cuerpo puesto en otra cosa (hoy: bajar al piso). Todo lo
     demás sigue en `avisar.*`, la voz de siempre.
   ==================================================================== */

export type Destacado = {
  id: number;
  /** Qué pasó, corto: «Bajado al piso». */
  titulo: string;
  /** La cifra grande: «3 unidades». */
  cifra?: string;
  /** Sobre qué: «Blusa Emma · Beige · talla S». */
  detalle?: string;
  /** Qué significa para la tienda: «Ya se pueden vender en Tienda Lima.» */
  nota?: string;
};

let actual: Destacado | null = null;
let siguienteId = 1;
const oyentes = new Set<() => void>();

function emitir() {
  oyentes.forEach((o) => o());
}
function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}
const leer = () => actual;
const leerEnServidor = () => null;

/** Abre la hoja (o reemplaza la que está abierta). Se puede llamar en el instante en que responde la base: sale después del loader. */
export function avisarDestacado(d: Omit<Destacado, "id">) {
  actual = { ...d, id: siguienteId++ };
  emitir();
}

function cerrarDestacado(id: number) {
  if (actual?.id !== id) return;
  actual = null;
  emitir();
}

export function AvisoDestacado() {
  const d = useSyncExternalStore(suscribir, leer, leerEnServidor);
  const ocupada = useSyncExternalStore(suscribirEspera, esperaOcupada, () => false);
  if (!d || ocupada) return null;
  // `key`: un destacado nuevo vuelve a entrar con su coreografía en vez de cambiar el texto del anterior.
  return <Hoja key={d.id} d={d} />;
}

function Hoja({ d }: { d: Destacado }) {
  return (
    <Modal titulo={d.titulo} tituloGrande conCerrar ancho="max-w-sm" onClose={() => cerrarDestacado(d.id)}>
      {(cerrar) => (
        <>
          <div role="status" className="destacado-cuerpo mt-4 flex flex-col items-center text-center">
            <span aria-hidden className="grid h-[72px] w-[72px] place-items-center rounded-full bg-verde/[0.12] text-verde">
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path className="destacado-trazo" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            {d.cifra && <p className="mt-3 font-display text-[34px] font-medium leading-none tabular-nums text-tinta">{d.cifra}</p>}
            {d.detalle && <p className="mt-2 text-[15px] font-medium text-tinta">{d.detalle}</p>}
            {d.nota && <p className="mt-1 text-[13px] leading-snug text-taupe">{d.nota}</p>}
          </div>
          {/* La cuenta atrás: al vaciarse cierra la hoja. Con el mouse encima se pausa (`.destacado-reloj`, avisos.css). */}
          <div aria-hidden className="mt-5 h-1 overflow-hidden rounded-full bg-sand/60">
            <div
              className="destacado-reloj h-full rounded-full bg-verde"
              onAnimationEnd={(e) => {
                if (e.animationName === "cayla-destacado-reloj") cerrar();
              }}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
