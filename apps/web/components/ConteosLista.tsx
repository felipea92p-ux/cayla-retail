import Link from "next/link";
import { ChevronRight, ClipboardCheck, Package } from "lucide-react";
import type { TonoChip } from "@/components/ui/Chip";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { ColumnaHora, DIA_CUANTOS, DIA_ETIQUETA, DIA_TITULO, FILA_ACTIVIDAD, PUNTO_ACTIVIDAD } from "@/components/ui/lista-actividad";
import { resultadoConteo, textoAlcance, textoLugar, textoResultadoConteo, type ResultadoConteo } from "@/lib/conteo-reglas";
import { apoyoDeResultado, cifraDeConteo, horaLimaDe, responsablesDeConteo, textoAperturaCierre, type GrupoDia } from "@/lib/conteo-recientes-reglas";
import { etiquetaDia } from "@/lib/movimientos-reglas";

/* ====================================================================
   ConteosLista · «Conteos recientes» del inicio (Inventario ▸ Conteo)

   Rediseño 2026-10-01, en dos pasos. Felipe, mirando la pantalla en producción: «muy desordenada y poco entendible… más moderna,
   básica, simple y práctica»; y al ver la primera versión: «que tenga la misma estructura visual y lógica que la tabla de
   Movimientos, se entiende mucho más». Por eso esta lista NO inventa una forma: usa la de Movimientos (`ui/lista-actividad.tsx`, la
   misma rejilla, el mismo punto, el mismo título de día) y cada celda dice lo análogo:

       Movimientos                         Conteos recientes
       hora                                hora a la que se abrió
       punto (entra / sale / neutro)       punto del resultado (verde, ámbar, gris…)
       foto + prenda / talla · color       ícono del lugar + «Conteo 28» / «Almacén de tienda · Solo Pantalones»
       proceso / de dónde a dónde          resultado («Todo correcto») / cuándo cerró
       referencia («Traslado 100»)         quién abrió (y «Cerró X» solo si se sabe y es otra persona)
       cantidad / «quedan 5»               variantes verificadas («15», o «20 de 37») / «variantes»
       flecha ›                            flecha ›

   El RESULTADO conserva sus reglas y tonos (ahora en el punto, no en un chip): En curso → pizarra · Todo correcto → verde ·
   N diferencias encontradas → neutro (el conteo ya las ajustó; en rojo, cada conteo del historial sería una pared roja) · Conteo
   parcial → ámbar · Cancelado → apagado. Un cerrado sin ninguna variante verificada y un anulado se leen «Cancelado»
   (`resultadoConteo`).

   «Cerró —» ya no sale en cada fila. Ojo: el hueco de fondo —un conteo cerrado con la cuenta de tienda no guarda quién lo cerró
   (ADR-0280)— sigue ahí; esta pantalla no lo grita, pero tampoco lo arregla.

   Server Component: no hay estado, y los conteos de una sede son pocos. Desde sm es la rejilla de seis celdas de Movimientos; en
   celular, la de tres con «resultado» y «quién» en un segundo renglón (se ve a 375 px; ver el comentario de `FILA_ACTIVIDAD`).
   ==================================================================== */

const TONO_RESULTADO: Record<ResultadoConteo, TonoChip> = {
  en_curso: "pizarra",
  todo_correcto: "verde",
  con_diferencias: "neutro",
  parcial: "ambar",
  cancelado: "apagado",
  // ADR-0328: todo se anotó con «Aplicar todos completos»; nadie contó. No es verde: no se sabe si estaba correcto.
  sin_contar: "neutro",
};

const plural = (n: number) => `${n} ${n === 1 ? "conteo" : "conteos"}`;

/** La ficha: el lugar donde se contó, en el mismo recuadro que la miniatura de una prenda en Movimientos. */
function FichaDeLugar({ tipo }: { tipo: string | null }) {
  const clase = "h-[18px] w-[18px]";
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-tinta/10 bg-sand/50 text-taupe">
      {tipo === "piso_venta" ? <IconoPercha className={clase} /> : tipo === "almacen_tienda" ? <Package className={clase} strokeWidth={1.5} /> : <ClipboardCheck className={clase} strokeWidth={1.5} />}
    </span>
  );
}

export function ConteosLista({ grupos, hoy }: { grupos: GrupoDia[]; hoy: string }) {
  return (
    <div className="border-t border-sand px-4 pb-2 sm:px-5">
      {grupos.map((g) => (
        <section key={g.dia} aria-label={etiquetaDia(g.dia, hoy)}>
          <h3 className={DIA_TITULO}>
            <span className={DIA_ETIQUETA}>{etiquetaDia(g.dia, hoy)}</span>
            <span className={DIA_CUANTOS}>{plural(g.conteos.length)}</span>
          </h3>
          <ul role="list" className="divide-y divide-sand">
            {g.conteos.map((c) => {
              const resultado = resultadoConteo(c);
              const { abrio, cerro } = responsablesDeConteo(c);
              const apoyo = apoyoDeResultado(c);
              const cifra = cifraDeConteo(c);
              const hora = horaLimaDe(c.creadoEn);
              const detalle = `${textoLugar(c)} · ${textoAlcance(c)}`;
              return (
                <li key={c.id}>
                  {/* La fila entera es el enlace (el conteo en curso también: allí se sigue contando); al pasar el mouse, la hora de cierre. */}
                  <Link
                    href={`/inventario/conteo/${c.id}`}
                    title={textoAperturaCierre(c)}
                    className={`${FILA_ACTIVIDAD} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo`}
                  >
                    <ColumnaHora desde={hora} />

                    <span aria-hidden className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO_ACTIVIDAD[TONO_RESULTADO[resultado]]}`} />

                    <span className="flex min-w-0 items-center gap-2.5">
                      <FichaDeLugar tipo={c.sububicacionTipo} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-tinta">Conteo {c.numero}</span>
                        {/* En celular no hay columna de hora: va delante, y el detalle envuelve en vez de cortarse («Solo Cami…» no dice qué se contó). */}
                        <span className="block break-words text-xs leading-snug tabular-nums text-taupe sm:hidden">
                          {hora} · {detalle}
                        </span>
                        {/* Envuelve en vez de cortarse: aquí «Solo Pantalones» es lo que se vino a leer. */}
                        <span className="hidden break-words text-xs leading-snug text-taupe sm:block">{detalle}</span>
                      </span>
                    </span>

                    {/* Resultado y quién. En celular bajan a un segundo renglón bajo la ficha; desde sm cada uno tiene su columna. */}
                    <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
                      <span className="min-w-0 sm:col-start-4 sm:row-start-1">
                        <span className="block break-words text-[13px] leading-snug text-tinta">{textoResultadoConteo(c)}</span>
                        {apoyo && <span className="hidden break-words text-xs leading-snug text-taupe sm:block">{apoyo}</span>}
                      </span>
                      <span className="min-w-0 sm:col-start-5 sm:row-start-1">
                        <span className="block truncate text-[13px] text-tinta">{abrio ?? "Sin responsable"}</span>
                        {cerro && <span className="block truncate text-xs text-taupe">Cerró {cerro}</span>}
                      </span>
                    </span>

                    <span className="col-start-3 row-start-1 flex items-center justify-end gap-1 text-right text-[13.5px] font-bold tabular-nums sm:col-start-6">
                      <span className="flex flex-col items-end leading-tight">
                        {cifra ? (
                          <>
                            <span>{cifra.cifra}</span>
                            <span className="mt-0.5 whitespace-nowrap text-[11px] font-normal text-taupe">{cifra.unidad}</span>
                          </>
                        ) : (
                          <span aria-hidden className="font-normal text-taupe/60">
                            —
                          </span>
                        )}
                      </span>
                      <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-tinta/30" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
