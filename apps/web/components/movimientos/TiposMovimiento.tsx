import Link from "next/link";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { SelloTipo } from "@/components/movimientos/SelloTipo";
import { desgloseAjustes, desgloseCifras, ventasAnuladas, type CategoriaFiltro, type CifrasGrupo, type ResumenTienda } from "@/lib/movimientos-reglas";
import { GRUPOS_TIPO, TIPOS_VISUALES, type GrupoTipo, type InfoGrupo } from "@/lib/movimientos-tipos";

// La columna de los siete tipos, a la derecha de la lista (rediseño 2026-10-05, ADR-0346; maqueta: opción A · Ruta, columna
// a la derecha que pidió Felipe para aprovechar el espacio entre el detalle de la fila y su cantidad). Cada botón es el
// filtro de ese tipo Y su cifra: cuántas operaciones fueron y cuántas prendas. Reemplaza a las píldoras de tipo de los
// filtros y a las tres tarjetas de arriba (Entró, Salió, Ajustes): lo que decían ahora lo dice cada botón.
//
// Tocar un botón filtra la lista; tocarlo otra vez la suelta (vuelve a «Todos»). Son enlaces (la URL manda: se comparte y
// «atrás» funciona, ADR-0111). Un tipo sin nada en el período se ve con su cero y no se toca: no llevaría a ninguna parte.
// Las cifras siguen al período, la zona y la búsqueda, pero no al tipo: son «lo que hay», no «lo que se ve».
//
// Desde lg es una columna que acompaña al bajar por la lista; debajo, una fila que se desliza de lado arriba de ella.

/** `detalle`: lo que se lee DENTRO del botón en vez de las prendas (los ajustes en bruto). `desglose`: lo que dice su ayuda al
 *  pasar el mouse —de qué procesos salen las prendas («80 por traslado · 13 de stock inicial»)—, que antes decían las tarjetas. */
type Cifra = { operaciones: number; prendas: number; detalle: string | null; extra: string | null; desglose: string | null };

/** Qué cuenta cada botón, de las cifras por grupo que da la base (`fn_movimientos_resumen_procesos`). */
function cifraDeGrupo(g: InfoGrupo, resumen: ResumenTienda): Cifra {
  const c: CifrasGrupo = resumen[g.id];
  const n = (v: number) => v.toLocaleString("es-PE");
  switch (g.id as GrupoTipo) {
    case "venta": {
      const anuladas = ventasAnuladas(resumen);
      return { operaciones: c.operaciones, prendas: c.salen, detalle: null, extra: anuladas > 0 ? `${n(anuladas)} ${anuladas === 1 ? "se anuló" : "se anularon"}` : null, desglose: desgloseCifras(c, "salen", { anuladas }) || null };
    }
    case "colgada":
    case "guardada":
      return { operaciones: c.operaciones, prendas: c.movidas, detalle: null, extra: null, desglose: null };
    case "llegada":
      return { operaciones: c.operaciones, prendas: c.entran, detalle: null, extra: null, desglose: desgloseCifras(c, "entran") || null };
    case "traslado":
      return { operaciones: c.operaciones, prendas: c.salen, detalle: null, extra: null, desglose: desgloseCifras(c, "salen") || null };
    case "cliente":
      // Una devolución suma, un cambio suma y resta: las prendas que se movieron con el cliente son las dos caras.
      return { operaciones: c.operaciones, prendas: c.entran + c.salen, detalle: null, extra: null, desglose: [desgloseCifras(c, "entran"), desgloseCifras(c, "salen")].filter(Boolean).join(" · ") || null };
    case "ajuste": {
      // En bruto (Felipe, 2026-10-03, ADR-0234): lo que faltó y lo que apareció por separado, nunca un neto — «+52» escondía
      // 35 prendas que faltaron. El cajón y la lista dicen si hay un documento detrás (conteo) o fue a mano.
      const { faltaron, aparecieron } = desgloseAjustes(c);
      const desglose = [faltaron && `Faltaron: ${faltaron}`, aparecieron && `Aparecieron: ${aparecieron}`].filter(Boolean).join(" · ") || null;
      return { operaciones: c.operaciones, prendas: c.entran + c.salen, detalle: c.operaciones > 0 ? `−${n(c.salen)} faltaron · +${n(c.entran)} aparecieron` : null, extra: null, desglose };
    }
  }
}

export function TiposMovimiento({
  resumen,
  categoria,
  hrefTipo,
  periodo,
}: {
  /** Las cifras del período con los demás filtros puestos (no el tipo). Null si la base no las pudo dar: los botones se ven, sin cifra. */
  resumen: ResumenTienda | null;
  /** El tipo elegido (`?cat=`), o null en «Todos». */
  categoria: CategoriaFiltro | null;
  /** La dirección de la pantalla con este tipo (o sin tipo): la arma la página con los filtros de la URL. */
  hrefTipo: (cat: CategoriaFiltro | null) => string;
  /** El período que cuentan las cifras, corto («hoy», «30 días», «1/9 – 26/9»): sin él, un «6» no dice de cuándo es. */
  periodo: string;
}) {
  const total = resumen?.todos.operaciones ?? 0;
  return (
    <nav aria-label="Tipo de movimiento" className="min-w-0">
      <p className="label-cayla mb-2 hidden text-[10px] font-bold text-taupe lg:block">Filtrar por tipo · {periodo}</p>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:mx-0 lg:grid lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0" data-hay={categoria ? "" : undefined}>
        {GRUPOS_TIPO.map((g) => {
          const info = TIPOS_VISUALES[g.tipo];
          const activa = categoria === g.id;
          const cifra = resumen ? cifraDeGrupo(g, resumen) : null;
          // Un tipo en cero se ve pero no se toca (ADR-0241): llevaría a «Ningún movimiento coincide». El elegido sí se suelta.
          const sinNada = !activa && cifra !== null && cifra.operaciones === 0;
          const contenido = (
            <>
              <SelloTipo tipo={g.tipo} tamano={40} />
              <span className="mv-tipo-nombre">{g.nombre}</span>
              <span className="mv-tipo-prendas">
                {cifra ? (
                  cifra.detalle ? (
                    cifra.detalle
                  ) : (
                    <>
                      {cifra.prendas.toLocaleString("es-PE")} {cifra.prendas === 1 ? "prenda" : "prendas"}
                      {cifra.extra ? ` · ${cifra.extra}` : ""}
                    </>
                  )
                ) : (
                  g.flujo
                )}
              </span>
              <span className="mv-tipo-cifra">
                {cifra ? (
                  <>
                    <b className="tabular-nums">
                      <CifraQueCuenta valor={cifra.operaciones} alMontar />
                    </b>
                    <small>{cifra.operaciones === 1 ? "operación" : "operaciones"}</small>
                  </>
                ) : (
                  <b>—</b>
                )}
              </span>
              <span className="mv-tipo-barra" aria-hidden>
                <i style={{ width: `${cifra && total > 0 ? Math.max(cifra.operaciones > 0 ? 4 : 0, Math.round((cifra.operaciones / total) * 100)) : 0}%` }} />
              </span>
            </>
          );
          return (
            <li key={g.id} className="shrink-0 lg:shrink">
              {sinNada ? (
                <span className="mv-tipo" data-mv-tono={info.tono} data-vacio="" aria-disabled="true">
                  {contenido}
                </span>
              ) : (
                <Link href={hrefTipo(activa ? null : g.id)} scroll={false} className="mv-tipo" data-mv-tono={info.tono} aria-current={activa ? "true" : undefined} title={activa ? "Quitar este filtro" : cifra?.desglose ? `${g.nombre}: ${cifra.desglose}` : `Ver solo: ${g.nombre.toLowerCase()}`}>
                  {contenido}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
