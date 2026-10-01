import Link from "next/link";
import { textoAlcance, textoLugar, type ConteoResumen } from "@/lib/conteo-reglas";
import { textoUltimoConteo, type AlcanceConteo } from "@/lib/conteo-inicio-reglas";
import { agruparPorDia, hrefRecientes, textoDiaLargo, textoPieRecientes, textoTotalRecientes, type VistaRecientes } from "@/lib/conteo-recientes-reglas";
import type { Sububicacion } from "@/lib/sububicaciones";
import { TABLA } from "@/components/ui/Tabla";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AbrirConteo } from "@/components/AbrirConteo";
import { ConteosLista } from "@/components/ConteosLista";
import { FiltroConteosRecientes } from "@/components/conteo/FiltroConteosRecientes";
import { AccionesEnCurso } from "@/components/conteo/AccionesEnCurso";
import { ResumenConteo } from "@/components/conteo/ResumenConteo";

// El INICIO de Conteo (Inventario ▸ Conteo, rediseño 2026-09-29). Responde una sola pregunta: «¿qué hago ahora?».
//   · Hay un conteo abierto en esta sede → la tarjeta «Conteo N en curso» (cuántas variantes lleva, seguir o cancelar).
//     El formulario de abrir NO se muestra: la base permite un solo conteo abierto por ubicación, y ofrecer abrir otro
//     solo llevaría a un error.
//   · No hay → «Abrir un conteo»: tres preguntas y un botón.
// Debajo, «Conteos recientes». Sin tarjetas de cifras: la exactitud y «conviene contar primero» eran cifras que nadie
// pidió mirar antes de contar; la exactitud vive en Análisis, y contar ya no ordena por plata (ni por nada: se cuenta todo
// lo que hay). Sin costos, sin soles, sin «a ciegas»: quien cuenta ve «Debe haber» y compara con lo que tiene en la mano.
//
// Server Component sin datos propios: `app/(app)/inventario/conteo/page.tsx` lee y esto dibuja (separado para poder
// mirarlo con datos de muestra sin base, principio 7). Lo único que necesita del navegador —elegir, abrir, cancelar— vive en
// `AbrirConteo` y `AccionesEnCurso`.
export function ConteoVista({
  sede,
  ubicacionId,
  abierto,
  conteos,
  recientes,
  sububicaciones,
  categorias,
  alcance = null,
  trasladosPorAtender = null,
  soloPrendas = [],
  variantes = [],
}: {
  sede: string;
  ubicacionId: string;
  /** El conteo abierto de esta sede (es el primero de `conteos` cuando lo hay), o `null`. */
  abierto: ConteoResumen | null;
  /** El historial de la sede, el abierto primero y después del más reciente al más antiguo (los de «Último conteo», no los filtrados). */
  conteos: ConteoResumen[];
  /** Lo que dibuja «Conteos recientes»: los más recientes, o los del día pedido (`?dia=`). Ver `vistaDeRecientes`. */
  recientes: VistaRecientes;
  sububicaciones: Sububicacion[];
  categorias: { id: string; nombre: string }[];
  /** Cuántas variantes trae un conteo de cada lugar y categoría (`fn_conteo_alcance`); `null` = no se pudo leer: la tarjeta sale sin cifras. */
  alcance?: AlcanceConteo | null;
  /** Traslados hacia esta sede por atender: el aviso «antes de contar». `null` = no se sabe o no ve Traslados. */
  trasladosPorAtender?: number | null;
  /** Las prendas de «Contar esta prenda» (`?variantes=`, ADR-0241), ya con su nombre. Vacío = la lista de siempre. */
  soloPrendas?: string[];
  /** Los ids de esas prendas: se arrastran al conteo que se abre. */
  variantes?: string[];
}) {
  // Una línea por lugar (piso / almacén) para elegir dónde contar: cuándo fue su último conteo.
  const ultimoPorLugar = abierto ? {} : Object.fromEntries(sububicaciones.map((s) => [s.id, textoUltimoConteo(conteos, s.id)]));

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={sede} titulo="Conteo" subtitulo="Compara lo que CAYLA dice que hay con lo que encuentras físicamente en la tienda." />

      {soloPrendas.length > 0 && (
        // Llegó desde un movimiento (ADR-0241). Dice qué se cuenta y que lo demás no se toca: cerrar ajusta solo lo verificado.
        <div className="nota-cayla flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span>
            <b>Contando solo:</b> {soloPrendas.join(", ")}. Abre un conteo del lugar donde está y la lista mostrará solo esto.
          </span>
          <Link href="/inventario/conteo" className="btn-cayla btn-enlace text-xs">
            Contar todo
          </Link>
        </div>
      )}

      {/* `#contar`: `/inventario/conteo#contar` sigue llegando aquí (enlaces de Movimientos, Existencias y el menú). */}
      <div id="contar" className="scroll-mt-24">
        {abierto ? (
          <section className="card-cayla space-y-4 p-5 sm:p-6" aria-labelledby="conteo-en-curso">
            <div className="space-y-1">
              <h2 id="conteo-en-curso" className="font-display text-xl text-tinta">
                Conteo {abierto.numero} en curso
              </h2>
              <p className="text-sm text-taupe">
                {textoLugar(abierto)} · {textoAlcance(abierto)}
              </p>
            </div>
            <ResumenConteo
              variante="completo"
              resumen={{ variantes: abierto.variantes, verificadas: abierto.lineas, pendientes: abierto.pendientes, conDiferencia: abierto.lineasConDiferencia }}
            />
            <AccionesEnCurso conteoId={abierto.id} numero={abierto.numero} />
          </section>
        ) : (
          <AbrirConteo
            ubicacionId={ubicacionId}
            sububicaciones={sububicaciones}
            categorias={categorias}
            ultimoPorLugar={ultimoPorLugar}
            alcance={alcance}
            trasladosPorAtender={trasladosPorAtender}
            variantes={variantes}
          />
        )}
      </div>

      {/* Sin `overflow-hidden` en la tarjeta: el calendario del filtro se abre hacia abajo y una tarjeta que recorta lo cortaría. La
          lista lleva su propio recorte para sus esquinas. */}
      <section className="card-cayla @container" aria-labelledby="conteos-recientes">
        {/* Título y filtro en UNA fila (se acomodan en dos cuando no caben). El total de conteos ya no va arriba a la derecha: cada
            día dice cuántos trae y el pie dice qué se está viendo; aquí queda solo para el lector de pantalla, que oye el cambio. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pb-4 pt-4 @[36rem]:px-5">
          <h2 id="conteos-recientes" className="font-display text-lg text-tinta">
            Conteos recientes
          </h2>
          {recientes.mostrados.length > 0 && (
            <p className="sr-only" aria-live="polite">
              {textoTotalRecientes(recientes)}
            </p>
          )}
          {(conteos.length > 0 || recientes.dia !== null) && (
            <FiltroConteosRecientes
              dia={recientes.dia}
              hoy={recientes.hoy}
              ayer={recientes.ayer}
              deHoy={recientes.deHoy}
              deAyer={recientes.deAyer}
              diasConConteos={recientes.diasConConteos}
              variantes={variantes}
            />
          )}
        </div>
        <div className="overflow-hidden rounded-b-xl">
          {recientes.mostrados.length > 0 ? (
            <>
              <ConteosLista grupos={agruparPorDia(recientes.mostrados)} hoy={recientes.hoy} />
              <p className="border-t border-sand px-4 py-2.5 text-xs text-taupe @[36rem]:px-5">{textoPieRecientes(recientes)}</p>
            </>
          ) : recientes.dia !== null ? (
            <div className="border-t border-sand px-5 py-8 text-center">
              <p className="font-display text-lg text-tinta">No hubo conteos el {textoDiaLargo(recientes.dia, recientes.hoy)}.</p>
              <p className="mt-1 text-sm text-tinta/75">
                {recientes.anterior ? `El conteo anterior fue el ${textoDiaLargo(recientes.anterior.dia, recientes.hoy)} (Conteo ${recientes.anterior.numero}).` : "No hay conteos de antes de esa fecha."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {recientes.anterior && (
                  <Link href={hrefRecientes(recientes.anterior.dia, variantes)} scroll={false} className="btn-cayla btn-secundario">
                    Ir a ese día
                  </Link>
                )}
                <Link href={hrefRecientes(null, variantes)} scroll={false} className="btn-cayla btn-primario">
                  Ver todos
                </Link>
              </div>
            </div>
          ) : (
            <p className={`${TABLA.vacio} border-t border-sand`}>Todavía no hay conteos en esta ubicación.</p>
          )}
        </div>
      </section>

      <p className="nota-cayla">
        <b>Cómo se cuenta:</b> se escanea o se escribe lo que encuentras en la tienda y se compara con lo que CAYLA esperaba. Cada diferencia se confirma antes de cerrar y
        cada ajuste queda como movimiento.{" "}
        <Link href="/inventario/movimientos?proc=conteo" className="text-tinta underline underline-offset-2 hover:text-taupe">
          Ver ajustes por conteo →
        </Link>
      </p>
    </div>
  );
}
