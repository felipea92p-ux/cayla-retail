import Link from "next/link";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { TABLA } from "@/components/ui/Tabla";
import { resultadoConteo, textoAlcance, textoLugar, textoResultadoConteo, type ResultadoConteo } from "@/lib/conteo-reglas";
import { textoAvanceHistorial } from "@/lib/conteo-inicio-reglas";
import { horaLimaDe, textoAperturaCierre, type GrupoDia } from "@/lib/conteo-recientes-reglas";

/* ====================================================================
   ConteosLista · «Conteos recientes» del inicio (Inventario ▸ Conteo, rediseño 2026-09-29)

   Hora · Ubicación · Qué se contó · Resultado · Responsable · Acción, en APARTADOS POR DÍA (Felipe, 2026-10-01): una banda con
   el día («HOY · miércoles 30 de setiembre») y, debajo, sus conteos, cada uno con la hora a la que se abrió. La fecha ya no
   se repite en cada fila: el día es la banda. Cada fila es un enlace al conteo (el que sigue abierto también: allí se continúa). El RESULTADO se lee de un vistazo y nunca dice «Cerrado · Vacío»:
     · En curso                → pizarra (informativo)
     · Todo correcto           → verde
     · 3 diferencias encontradas → neutro: el conteo ya las ajustó. En rojo, cada conteo del historial pintaría una pared roja
                                 y el rojo dejaría de avisar lo que hoy hay que mirar.
     · Conteo parcial          → ámbar: quedó a medias
     · Cancelado               → apagado, sin tachar (no es una anulación de dinero; se canceló un conteo)
   Un cerrado sin ninguna variante verificada (de antes del rediseño) y un anulado se leen «Cancelado»
   y no cuentan para ninguna métrica (`resultadoConteo`).

   La tabla cambia de forma por el ancho de SU tarjeta (`@container`), no por el de la ventana: con el lateral abierto,
   una ventana de 1024 px deja ~670 al contenido y las seis columnas necesitan ~830. Debajo de eso cada fila se apila
   en una ficha de cuatro renglones. Server Component: no hay estado, y los conteos de una sede son pocos.
   ==================================================================== */

const TONO_RESULTADO: Record<ResultadoConteo, TonoChip> = {
  en_curso: "pizarra",
  todo_correcto: "verde",
  con_diferencias: "neutro",
  parcial: "ambar",
  cancelado: "apagado",
};

// Las seis columnas, de ~830 px de tarjeta hacia arriba (5,5 + 8 + 7 + 11 + 7 + 6 rem, más aire) — `@[52rem]` = 832 px. Las clases
// van ESCRITAS enteras, no armadas con un `${}`: Tailwind solo genera lo que encuentra literal en el código.
const PLANTILLA = "@[52rem]:grid-cols-[5.5rem_minmax(8rem,1fr)_minmax(7rem,1fr)_11rem_minmax(7rem,1fr)_6rem]";
const plural = (n: number) => `${n} ${n === 1 ? "conteo" : "conteos"}`;

// Sin espacio para las seis columnas la fila es una FICHA que se acomoda sola (`flex-wrap`), en dos tamaños:
//  · angosta (celular, < 36 rem): fecha y resultado arriba —si el resultado no cabe al lado de la fecha («3 diferencias
//    corregidas» en un celular de 320, baja a su propio renglón en vez de partir la fecha—, luego lugar y qué, y al final
//    los responsables con la acción a la derecha;
//  · media (tableta con el lateral abierto, 36–52 rem): fecha · lugar y qué · resultado · acción en UN renglón, y debajo los
//    responsables.
// En la tabla ancha cada celda vuelve a su columna (`order` se apaga: en una rejilla también reordena).
const CELDA = {
  fecha: "order-1 min-w-0 @[36rem]:w-24 @[36rem]:shrink-0 @[52rem]:order-none @[52rem]:w-auto @[52rem]:shrink",
  resultado: "order-2 ml-auto @[36rem]:order-3 @[36rem]:ml-0 @[52rem]:order-none",
  // La ubicación se dice en su columna solo en la tabla ancha; antes va delante de «Qué se contó» («Piso de venta · Todo»).
  ubicacion: "hidden min-w-0 @[52rem]:order-none @[52rem]:block",
  que: "order-3 min-w-0 basis-full @[36rem]:order-2 @[36rem]:flex-1 @[36rem]:basis-0 @[52rem]:order-none @[52rem]:flex-none @[52rem]:basis-auto",
  responsable: "order-4 min-w-0 flex-1 @[36rem]:order-5 @[36rem]:flex-none @[36rem]:basis-full @[52rem]:order-none @[52rem]:basis-auto",
  accion: "order-5 shrink-0 @[36rem]:order-4 @[52rem]:order-none",
} as const;

export function ConteosLista({ grupos }: { grupos: GrupoDia[] }) {
  return (
    <div className="border-t border-sand">
      <div className={`${TABLA.encabezado} hidden border-b border-sand @[52rem]:grid ${PLANTILLA}`} role="row">
        {["Hora", "Ubicación", "Qué se contó", "Resultado", "Responsable", "Acción"].map((titulo) => (
          <span key={titulo} className={TABLA.titulo} role="columnheader">
            {titulo}
          </span>
        ))}
      </div>
      {grupos.map((g) => (
        <section key={g.dia} aria-label={g.titulo} className="border-t border-sand first-of-type:border-t-0">
          {/* El apartado del día: la banda en hueso, con «HOY»/«AYER» cuando toca y cuántos conteos trae. */}
          <h3 className="flex items-baseline gap-2.5 bg-hueso px-4 py-2.5 @[36rem]:px-5">
            {g.rotulo && <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-taupe">{g.rotulo}</span>}
            <span className="font-display text-base text-tinta">{g.titulo}</span>
            <span className="ml-auto whitespace-nowrap text-xs font-normal text-taupe">{plural(g.conteos.length)}</span>
          </h3>
          <div className="divide-y divide-sand">{g.conteos.map((c) => {
        const resultado = resultadoConteo(c);
        const abierto = resultado === "en_curso";
        const avance = textoAvanceHistorial(c);
        // La HORA a la que se abrió (la del día ya está en la banda); al pasar el mouse, también la de cierre.
        const hora = horaLimaDe(c.creadoEn);
        return (
          <Link
            key={c.id}
            title={textoAperturaCierre(c)}
            href={`/inventario/conteo/${c.id}`}
            className={`fila-cayla flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 focus-visible:bg-crema/60 focus-visible:outline-none @[36rem]:px-5 @[52rem]:grid @[52rem]:gap-x-4 ${PLANTILLA}`}
          >
            <span className={CELDA.fecha}>
              {/* Angosta, en una línea («11:58 · Conteo 27»); en su columna o en la ficha media, en dos. */}
              <span className="text-sm tabular-nums text-tinta @[36rem]:block">{hora}</span>
              <span className="text-xs text-taupe @[36rem]:block">
                <span aria-hidden className="@[36rem]:hidden">
                  {" "}
                  ·{" "}
                </span>
                Conteo {c.numero}
              </span>
            </span>
            <span className={CELDA.ubicacion}>
              <span className="block truncate text-sm text-tinta">{textoLugar(c)}</span>
            </span>
            <span className={CELDA.que}>
              <span className="block text-sm text-tinta @[52rem]:truncate">
                <span className="@[52rem]:hidden">{textoLugar(c)} · </span>
                {textoAlcance(c)}
              </span>
              {avance && <span className="block truncate text-xs text-taupe">{avance}</span>}
            </span>
            <span className={CELDA.resultado}>
              <Chip tono={TONO_RESULTADO[resultado]} tachado={false}>
                {textoResultadoConteo(c)}
              </Chip>
            </span>
            <span className={CELDA.responsable}>
              <span className="block truncate text-xs text-tinta/75">Abrió {c.abiertoPorNombre}</span>
              {!abierto && c.estado === "cerrado" && <span className="block truncate text-xs text-taupe">Cerró {c.cerradoPorNombre}</span>}
            </span>
            <span className={CELDA.accion}>
              <span className={`btn-cayla btn-chico ${abierto ? "btn-primario" : "btn-secundario"}`}>{abierto ? "Seguir" : "Ver"}</span>
            </span>
          </Link>
        );
      })}</div>
        </section>
      ))}
    </div>
  );
}
