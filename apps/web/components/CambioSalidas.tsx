"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bookmark, ChevronRight, Truck, Undo2 } from "lucide-react";
import { AnotarNoHabia } from "@/components/punto-de-venta/AnotarNoHabia";
import type { ControlResponsable } from "@/lib/useResponsable";
import { hrefPedirTraslado, sedesDeOrigen, type SedeConId } from "@/lib/cambios-atajos-reglas";
import type { SedeConStock } from "@/lib/stock-por-sede";

/* ====================================================================
   CambioSalidas · qué hacer cuando la talla elegida no está en esta sede (spike 2026-09-26,
   docs/maquetas/cambios-mejoras-2026-09/, escena 2)

   Antes el paso 3 decía «no queda aquí — hay en AQP» y ahí terminaba. Ahora ofrece salidas, cada una hacia la
   pantalla que ya sabe hacerlo, con lo elegido puesto:
     · Pedirla a otra sede → Traslados (`/inventario/mover` prellenado). El origen por URL solo lo respeta un líder, así
       que a una integrante se le dice dónde hay y que se lo pida a su líder, sin un enlace que la llevaría a despachar
       desde su propia sede.
     · Apartarla cuando llegue → Apartados. Decidido sin tocar el modelo: el cambio NO queda «en espera»; se aparta a
       su nombre cuando entra al piso y el cambio se hace cuando vuelve (Apartados solo aparta lo que está en el piso).
     · No quiere esperar → «Anotar que no había» (Pedidos no atendidos, la misma pieza del Punto de venta).
     · No quiere nada a cambio → Devoluciones, ya sobre esta prenda.
   Nada de esto mueve stock ni dinero desde aquí.
   ==================================================================== */

function Salida({ href, icono, titulo, detalle, principal = false }: { href?: string; icono: ReactNode; titulo: string; detalle: string; principal?: boolean }) {
  const cuerpo = (
    <>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${principal ? "bg-tinta text-crema" : "bg-hueso text-tinta"}`}>{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-tinta">{titulo}</span>
        <span className="block text-[13px] text-tinta/70">{detalle}</span>
      </span>
      {href && <ChevronRight className="h-4 w-4 shrink-0 text-tinta/45" aria-hidden />}
    </>
  );
  const clase = `flex w-full items-center gap-3 rounded-xl border bg-papel px-3.5 py-3 text-left ${principal ? "border-tinta" : "border-sand"}`;
  return href ? (
    <Link href={href} className={`${clase} transition-colors duration-200 hover:border-taupe`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

export function CambioSalidas({
  aviso,
  referencia,
  color,
  talla,
  varianteId,
  otrasSedes,
  sedes,
  ubicacionId,
  sede,
  esLider,
  ventaItemId,
  responsable,
}: {
  /** El aviso de siempre (`avisoSinStock`): «No queda Negro · Talla M aquí — hay 2 en AQP». */
  aviso: string;
  referencia: string;
  color: string | null;
  talla: string | null;
  varianteId: string;
  otrasSedes: SedeConStock[];
  sedes: SedeConId[];
  ubicacionId: string;
  sede: string;
  esLider: boolean;
  ventaItemId: string;
  responsable: ControlResponsable;
}) {
  const origenes = sedesDeOrigen(otrasSedes, sedes).slice(0, 2);

  return (
    <div className="anim-revelar mt-4 rounded-2xl border border-ambar/35 bg-ambar/[0.06] px-4 py-4 sm:px-5" role="status">
      <p className="flex items-start gap-2 text-sm font-semibold text-ambar-profundo">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {aviso}
      </p>
      <p className="mt-1 text-[13px] text-tinta/75">Elige cómo seguir con la clienta:</p>

      <div className="mt-3 grid gap-2">
        {origenes.map((o, i) =>
          esLider ? (
            <Salida
              key={o.id}
              href={hrefPedirTraslado(o.id, ubicacionId, varianteId, 1)}
              principal={i === 0}
              icono={<Truck className="h-4 w-4" aria-hidden />}
              titulo={`Pedirla a ${o.sede}`}
              detalle={`Hay ${o.cantidad} · abre el traslado a ${sede} con esta prenda ya puesta`}
            />
          ) : (
            <Salida
              key={o.id}
              principal={i === 0}
              icono={<Truck className="h-4 w-4" aria-hidden />}
              titulo={`Hay ${o.cantidad} en ${o.sede}`}
              detalle={`Pídele a tu líder que la traslade a ${sede}`}
            />
          ),
        )}
        {origenes.length > 0 && (
          <Salida
            href="/vender/apartados"
            icono={<Bookmark className="h-4 w-4" aria-hidden />}
            titulo="Apartarla a su nombre cuando llegue"
            detalle="Cuando entre al piso, apártala en Apartados; el cambio se hace cuando vuelva"
          />
        )}
        <Salida
          href={`/devoluciones?item=${ventaItemId}`}
          icono={<Undo2 className="h-4 w-4" aria-hidden />}
          titulo="No quiere nada a cambio: mejor devolver"
          detalle="Pasa a Devoluciones con esta prenda ya elegida"
        />
      </div>

      <AnotarNoHabia
        ubicacionId={ubicacionId}
        descripcion={[referencia, color].filter(Boolean).join(" · ")}
        tallas={talla ? [talla] : []}
        clientaId={null}
        responsable={responsable}
      />
    </div>
  );
}
