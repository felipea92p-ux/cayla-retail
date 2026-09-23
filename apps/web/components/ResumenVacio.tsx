"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageOpen, Store } from "lucide-react";
import { cambiarUbicacionActiva } from "@/app/actions/ubicacion";
import type { CambiosUrl } from "@/components/useResumenUrl";
import type { Ubicacion } from "@/lib/resumen-reglas";

// Cuando la sede no tiene nada que analizar (rediseño 2026-09-22, «vacío con salidas», decisión de Felipe). Antes
// era una línea de texto y el líder quedaba sin salida. Ahora dice qué pasa y ofrece tres caminos:
//   · ampliar el período a 90 días (solo en Desempeño, si todavía no se mira 90 días),
//   · mirar otra tienda (cambia la sede global, la misma acción que el selector de arriba),
//   · ir a Recibir mercadería, que es lo que hace aparecer stock en una sede.
// El Taller usa la misma pieza: no vende a clientas, así que sus salidas son las tiendas.

export type SedeParaVer = { id: string; nombre: string };

export function ResumenVacio({
  ubicacion,
  modo,
  puedeAmpliar,
  rango,
  otrasTiendas,
  actualizar,
}: {
  ubicacion: Ubicacion;
  modo: "desempeno" | "comparar";
  /** Desempeño con un período menor a 90 días: ofrecer «Ampliar a 90 días». */
  puedeAmpliar: boolean;
  /** «24 ago – 22 sep», para decir de qué fechas se habla. */
  rango?: string;
  /** Otras tiendas a las que el líder puede cambiarse (máximo dos botones). */
  otrasTiendas: SedeParaVer[];
  actualizar: (cambios: CambiosUrl) => void;
}) {
  const router = useRouter();
  const [cambiando, empezar] = useTransition();
  const esTienda = ubicacion.tipo === "tienda";

  const titulo = !esTienda
    ? `${ubicacion.nombre} no vende a clientas`
    : modo === "comparar"
      ? `${ubicacion.nombre} no tuvo stock ni ventas en estos dos períodos`
      : `${ubicacion.nombre} no tuvo stock ni ventas${rango ? ` del ${rango}` : " en este período"}`;
  const cuerpo = !esTienda
    ? "No hay ventas, ritmo ni rotación que analizar aquí. Elige una tienda para ver su análisis."
    : "El análisis aparece cuando la sede recibe mercadería o vende. Si esperabas ver datos, revisa que la mercadería se haya recibido en esta sede y no en otra.";

  const verTienda = (id: string) =>
    empezar(async () => {
      await cambiarUbicacionActiva(id);
      router.refresh();
    });

  return (
    <section className="anim-entra card-cayla flex flex-col gap-4 px-6 py-8 sm:flex-row sm:items-start sm:gap-6" aria-labelledby="vacio-titulo">
      <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-hueso text-taupe">
        {esTienda ? <PackageOpen strokeWidth={1.5} className="h-6 w-6" /> : <Store strokeWidth={1.5} className="h-6 w-6" />}
      </span>
      <div className="min-w-0 space-y-2">
        <h2 id="vacio-titulo" className="font-display text-[1.35rem] leading-tight text-tinta">
          {titulo}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-taupe">{cuerpo}</p>
        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          {esTienda && puedeAmpliar && (
            <button type="button" className="btn-cayla btn-primario" onClick={() => actualizar({ preset: "90d", desde: null, hasta: null })}>
              Ampliar a 90 días
            </button>
          )}
          {otrasTiendas.slice(0, 2).map((t, i) => (
            <button key={t.id} type="button" disabled={cambiando} onClick={() => verTienda(t.id)} className={`btn-cayla ${!esTienda && i === 0 ? "btn-primario" : "btn-secundario"}`}>
              Ver {t.nombre}
            </button>
          ))}
          {esTienda && (
            <Link href="/recibir" className="btn-cayla btn-enlace">
              Ir a Recibir mercadería →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
