import Link from "next/link";
import { textoAlcance, textoLugar, type ConteoResumen } from "@/lib/conteo-reglas";
import { textoUltimoConteo } from "@/lib/conteo-inicio-reglas";
import type { Sububicacion } from "@/lib/sububicaciones";
import { TABLA } from "@/components/ui/Tabla";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AbrirConteo } from "@/components/AbrirConteo";
import { ConteosLista } from "@/components/ConteosLista";
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
  sububicaciones,
  categorias,
  trasladosPorAtender = null,
  soloPrendas = [],
  variantes = [],
}: {
  sede: string;
  ubicacionId: string;
  /** El conteo abierto de esta sede (es el primero de `conteos` cuando lo hay), o `null`. */
  abierto: ConteoResumen | null;
  /** El historial de la sede, el abierto primero y después del más reciente al más antiguo. */
  conteos: ConteoResumen[];
  sububicaciones: Sububicacion[];
  categorias: { id: string; nombre: string }[];
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
            trasladosPorAtender={trasladosPorAtender}
            variantes={variantes}
          />
        )}
      </div>

      <section className="card-cayla @container overflow-hidden" aria-labelledby="conteos-recientes">
        <h2 id="conteos-recientes" className="px-4 py-3.5 font-display text-lg text-tinta @[36rem]:px-5">
          Conteos recientes
        </h2>
        {conteos.length > 0 ? <ConteosLista conteos={conteos} /> : <p className={`${TABLA.vacio} border-t border-sand`}>Todavía no hay conteos en esta ubicación.</p>}
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
