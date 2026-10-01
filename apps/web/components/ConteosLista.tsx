import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { resultadoConteo, textoAlcance, textoLugar, textoResultadoConteo, type ResultadoConteo } from "@/lib/conteo-reglas";
import { textoAvanceHistorial } from "@/lib/conteo-inicio-reglas";
import { horaLimaDe, inicialesDe, responsablesDeConteo, textoAperturaCierre, type GrupoDia } from "@/lib/conteo-recientes-reglas";

/* ====================================================================
   ConteosLista · «Conteos recientes» del inicio (Inventario ▸ Conteo)

   Rediseño 2026-10-01 (Felipe: «muy desordenada y poco entendible… más moderna, básica, simple y práctica»). La tabla de seis
   columnas repartía cuatro datos en 1.500 px —el ojo viajaba de la hora al responsable— y repetía «Almacén de tienda» en las 17
   filas. Ahora cada conteo es UNA fila con lo que se busca, en el orden en que se busca:

     qué se contó y dónde  ·  cómo salió  ·  quién  ·  abrirlo
     «Almacén de tienda · Solo Pantalones»        [Todo correcto]   (AC) Angie Chavez   ›
     «Conteo 28 · 17:33 · 4 variantes verificadas»

   · Sin encabezado de columnas, sin cebra, sin botón «Ver» en cada fila: la fila entera es el enlace (con la flecha ›). El que sigue
     en curso lleva «Seguir», el único botón de la lista: es lo único que pide actuar.
   · El día es un título liviano («Ayer · miércoles 30 de setiembre», con cuántos conteos trae), no una banda.
   · El RESULTADO es el mismo chip y los mismos tonos de siempre (no cambia ninguna regla): En curso → pizarra · Todo correcto →
     verde · N diferencias encontradas → neutro (el conteo ya las ajustó; en rojo, cada conteo del historial sería una pared roja) ·
     Conteo parcial → ámbar · Cancelado → apagado, sin tachar. Un cerrado sin ninguna variante verificada y un anulado se leen
     «Cancelado» (`resultadoConteo`).
   · Una sola persona por fila (quien abrió, con sus iniciales). «Cerró …» solo aparece si se sabe y es otra persona
     (`responsablesDeConteo`): «Cerró —» en cada fila era ruido. Ojo: el hueco de fondo —un conteo cerrado con la cuenta de tienda no
     guarda quién lo cerró (ADR-0280)— sigue ahí; esta pantalla ya no lo grita, pero tampoco lo arregla.

   La fila cambia de forma por el ancho de SU tarjeta (`@container`), no por el de la ventana: con el lateral abierto una ventana
   de 1024 px deja ~670 al contenido. Ancha: una sola línea de cuatro celdas con anchos fijos (para que el resultado y la persona
   queden alineados de una fila a otra; cada fila es su propia rejilla). Angosta: arriba qué y dónde (con la flecha), abajo el
   resultado y la persona. Server Component: no hay estado, y los conteos de una sede son pocos.
   ==================================================================== */

const TONO_RESULTADO: Record<ResultadoConteo, TonoChip> = {
  en_curso: "pizarra",
  todo_correcto: "verde",
  con_diferencias: "neutro",
  parcial: "ambar",
  cancelado: "apagado",
};

// Las clases van ESCRITAS enteras, no armadas con un `${}`: Tailwind solo genera lo que encuentra literal en el código.
// `@[50rem]` = 736 px de tarjeta: lo que pide la rejilla ancha (qué y dónde 1fr, resultado 13, persona 12, flecha/«Seguir» 5,5 rem).
const FILA =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-4 py-3.5 transition-colors duration-150 hover:bg-hueso/70 focus-visible:bg-hueso/70 focus-visible:outline-none @[36rem]:px-5 @[50rem]:grid-cols-[minmax(0,1fr)_13rem_12rem_5.5rem]";

const plural = (n: number) => `${n} ${n === 1 ? "conteo" : "conteos"}`;

export function ConteosLista({ grupos }: { grupos: GrupoDia[] }) {
  return (
    <div className="border-t border-sand">
      {grupos.map((g) => (
        <section key={g.dia} aria-label={g.titulo}>
          {/* El día: un título liviano con «Hoy»/«Ayer» cuando toca y cuántos conteos trae. Sin banda: el aire separa los días. */}
          <h3 className="flex items-baseline gap-2 px-4 pb-1.5 pt-5 text-[13px] first-of-type:pt-4 @[36rem]:px-5">
            {g.rotulo && <span className="font-semibold text-tinta">{g.rotulo}</span>}
            {g.rotulo && (
              <span aria-hidden className="text-taupe/60">
                ·
              </span>
            )}
            <span className={g.rotulo ? "text-taupe" : "font-semibold text-tinta"}>{g.titulo}</span>
            <span className="ml-auto whitespace-nowrap font-normal text-taupe">{plural(g.conteos.length)}</span>
          </h3>
          <ul role="list" className="divide-y divide-sand/70 border-y border-sand/70">
            {g.conteos.map((c) => {
              const resultado = resultadoConteo(c);
              const abierto = resultado === "en_curso";
              const avance = textoAvanceHistorial(c);
              const { abrio, cerro } = responsablesDeConteo(c);
              return (
                <li key={c.id}>
                  {/* La fila entera es el enlace; al pasar el mouse, también la hora de cierre. */}
                  <Link href={`/inventario/conteo/${c.id}`} title={textoAperturaCierre(c)} className={FILA}>
                    <span className="col-start-1 row-start-1 min-w-0">
                      <span className="block truncate text-[15px] font-medium text-tinta">
                        {textoLugar(c)} · {textoAlcance(c)}
                      </span>
                      <span className="block truncate text-[13px] text-taupe">
                        Conteo {c.numero} · {horaLimaDe(c.creadoEn)}
                        {avance ? ` · ${avance}` : ""}
                      </span>
                    </span>

                    {/* Angosta: resultado y persona en su propio renglón, bajo el título. Ancha (`contents`): cada una es su celda. */}
                    <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 @[50rem]:contents">
                      <span className="@[50rem]:min-w-0">
                        <Chip tono={TONO_RESULTADO[resultado]} tachado={false}>
                          {textoResultadoConteo(c)}
                        </Chip>
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sand text-[11px] font-semibold tracking-wide text-tinta/70">
                          {inicialesDe(abrio)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-tinta/85">{abrio ?? "Sin responsable"}</span>
                          {cerro && <span className="block truncate text-xs text-taupe">Cerró {cerro}</span>}
                        </span>
                      </span>
                    </span>

                    {/* Lo único que pide actuar es el conteo en curso: «Seguir». Los demás se abren, y la flecha lo dice. */}
                    <span className="col-start-2 row-start-1 justify-self-end @[50rem]:col-auto @[50rem]:row-auto">
                      {abierto ? (
                        <span className="btn-cayla btn-chico btn-primario">Seguir</span>
                      ) : (
                        <ChevronRight aria-hidden className="h-5 w-5 text-taupe/70" strokeWidth={1.75} />
                      )}
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
