"use client";

import { ArrowRight, PackageCheck, Truck } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { EVENTO_MANDAR, detalleEnvio, siglaTienda, type PorMandar } from "@/lib/mi-plata-reglas";
import { avanceDeEnvios, type EnvioMio } from "@/lib/mis-envios-reglas";
import { FilaEnvio } from "./FilaEnvio";

// «Para mandar» (maqueta docs/maquetas/mis-compras-pc-mesa-2026-10/, Felipe 2026-10-28): lo que falta mandar a cada tienda y los envíos de la
// ronda, en UNA tarjeta (antes, una franja ámbar y otra sección «Envíos de esta ronda», que con cero envíos ocupaba un bloque para decir que no
// había nada). Arriba, cada tienda con sus prendas y el botón «Mandar a …»; debajo, cuántas prendas ya salieron; y al pie, los envíos con su
// código o, mientras no hay ninguno, una línea tenue. El botón abre la hoja «Mandar a la tienda» (`MandarATienda`, que sigue montada en la
// pantalla sin su franja): se le avisa con `EVENTO_MANDAR`, como hace «Cerrar mi ronda». No decide nada: lo que se manda y cómo lo sigue
// haciendo la hoja.

/** Cuántos envíos se ven aquí: los más nuevos. El resto, en Mis envíos («Ver todos»): la tarjeta no se come la pantalla. */
const VISIBLES = 3;

export function ParaMandar({
  porMandar,
  envios,
  texto,
  hoy,
}: {
  porMandar: PorMandar[];
  /** Los envíos de la ronda abierta; `null` si no hay ronda abierta o «Mis envíos» no se pudo leer (no se inventa «no mandaste nada»). */
  envios: EnvioMio[] | null;
  /** La serie y número de la ronda («RC-000004»). */
  texto: string | null;
  hoy: string;
}) {
  const conPrendas = porMandar.filter((t) => t.unidades > 0);
  const faltan = conPrendas.reduce((s, t) => s + t.unidades, 0);
  if (faltan === 0 && envios === null) return null;
  const avance = avanceDeEnvios(conPrendas, envios ?? []);
  const sinEnvios = envios !== null && envios.length === 0;
  const botonA = conPrendas.length === 1 ? `Mandar a ${siglaTienda(conPrendas[0]!.tienda)}` : "Mandar a las tiendas";
  return (
    <section aria-label="Para mandar" className="card-cayla flex min-w-0 flex-col gap-3.5 p-4 lg:p-5">
      <TituloSeccion
        cuenta={faltan}
        dato={faltan === 0 && envios !== null && envios.length > 0 ? <Chip tono="verde">Todo mandado</Chip> : conPrendas.length > 1 ? `${conPrendas.length} tiendas` : undefined}
      >
        Para mandar
      </TituloSeccion>
      {conPrendas.length > 0 && (
        <>
          <ul className="flex flex-col gap-2.5">
            {conPrendas.map((t) => (
              <li key={t.tiendaId} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ambar/15 text-ambar">
                  <Truck className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-tinta">{t.tienda}</span>
                  <span className="block text-xs text-taupe">{detalleEnvio(t)}</span>
                </span>
              </li>
            ))}
          </ul>
          <Boton peso="primario" className="w-full" data-guia="mi-plata.mandar" onClick={() => window.dispatchEvent(new Event(EVENTO_MANDAR))}>
            <span className="inline-flex items-center gap-2">
              {botonA}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Boton>
        </>
      )}
      {avance && (
        <div className="flex flex-col gap-1.5">
          <BarraAvance pct={avance.pct} etiqueta="Prendas de la ronda que ya mandaste" texto={avance.texto} />
          <p className="text-xs tabular-nums text-taupe">{avance.texto}</p>
        </div>
      )}
      {envios !== null && (
        <div className="flex flex-col gap-1 border-t border-dashed border-borde-control pt-3" data-guia="mi-plata.envios">
          {sinEnvios ? (
            <p className="flex items-start gap-2.5 text-xs text-taupe">
              <PackageCheck className="mt-px h-4 w-4 shrink-0" aria-hidden />
              <span>
                Aún no mandas nada{texto ? <> en la ronda <span className="whitespace-nowrap">{texto}</span></> : ""}. Cuando mandes un envío, aparece aquí con su código.
              </span>
            </p>
          ) : (
            <>
              <ul className="divide-y divide-sand">
                {envios.slice(0, VISIBLES).map((e) => (
                  <FilaEnvio key={e.id} e={e} hoy={hoy} />
                ))}
              </ul>
              <EnlaceVer href="/compras/mi-plata/envios">{envios.length > VISIBLES ? `Ver los ${envios.length} envíos` : "Ver todos los envíos"}</EnlaceVer>
            </>
          )}
        </div>
      )}
    </section>
  );
}
