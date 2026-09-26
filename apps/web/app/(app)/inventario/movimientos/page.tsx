import { Download } from "lucide-react";
import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getSububicaciones } from "@/lib/sububicaciones";
import {
  agruparPorOperacion,
  cursorDesdeParams,
  desgloseCifras,
  filtrosDesdeParams,
  getPrendasDeMovimientos,
  getResumenTienda,
  getSaldosDeMovimientos,
  listarMovimientos,
  periodoCorto,
  serializarCursorMovimientos,
  hoyEnLima,
  unidades,
  type CategoriaMovimiento,
  type CifrasGrupo,
  type ParamsMovimientos,
  type ResumenTienda,
} from "@/lib/movimientos-v2";
import { desdeDeUltimosDias } from "@/lib/movimientos-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { FiltrosMovimientos } from "@/components/FiltrosMovimientos";
import { MovimientosLista } from "@/components/MovimientosLista";
import { MovimientosVacio } from "@/components/MovimientosVacio";
import { PaginacionCursor } from "@/components/Paginacion";

// Movimientos (2026-09-15): «por qué cambió el stock», con búsqueda, filtros,
// detalle y paginado — todo resuelto en Postgres por `fn_movimientos`
// (20260915090000_movimientos_lectura.sql). Esta página solo traduce la URL a
// filtros y elige el layout; no calcula nada sobre las filas.
//
// Mudada a `/inventario/movimientos` el 2026-09-16 (Felipe, integrando sus
// diseños): es una de las cuatro pestañas de Inventario. `/movimientos`
// redirige acá con los filtros intactos.
//
// Sigue siendo un historial: no hay botón de crear, editar ni borrar. Un
// movimiento se corrige con el proceso de negocio (una devolución, un
// conteo), nunca tocando la fila — el trigger de inmutabilidad lo impide.
//
// 2026-09-19: muestra el EFECTO sobre el stock de la sede (qué prenda, cuánto, de
// dónde a dónde) y el proceso que lo originó, con una referencia («Traslado 24») que
// lleva a la pantalla que explica el proceso completo. Sin filtro ni columna de persona:
// la autoría sigue guardada en la base y se ve en el detalle de cada movimiento.
//
// 2026-09-26 (ADR-0234, decisiones de Felipe D1 y D2): se lee DESDE LA TIENDA. «Entró» es todo lo que sumó stock a la
// sede —también el traslado que llegó— y «Salió», todo lo que lo restó; las cifras cuentan OPERACIONES (lo que se guardó
// de una sola vez), no filas, y la lista muestra cada operación como una fila que se despliega.
export default async function MovimientosPage({ searchParams }: { searchParams: Promise<ParamsMovimientos> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const esLider = persona.rol === "lider";
  // La sede la decide SOLO el selector de la cabecera (`UbicacionSwitcher`, cookie: cambia todo el
  // ERP). Hasta el 2026-09-22 había un segundo selector en el título (`?ubicacion=`) que podía decir
  // otra sede que la cabecera; Felipe eligió dejar uno. Un enlace viejo con `?ubicacion=` se ignora.
  // La base vuelve a comprobar el permiso (`fn_puede_operar_ubicacion`) — esto solo decide qué se pinta.
  const ubicacionActivaId = persona.ubicacionId;

  // Las sububicaciones van antes que la lista: «?sub=piso» se traduce a SU id, que solo se sabe mirando la ubicación.
  // No dependen de la lista de ubicaciones (la sede sale de la persona): las dos a la vez, una espera menos.
  const [ubicaciones, sububicaciones] = await Promise.all([getUbicaciones(), getSububicaciones(ubicacionActivaId)]);
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId);
  const sede = ubicacionActiva?.nombre ?? "esta sede";
  const { periodo, sub, ...filtros } = filtrosDesdeParams(params, { sububicaciones });
  const cursor = cursorDesdeParams(params);

  // Las cifras de las píldoras cuentan con los demás filtros, pero no con el proceso: con «Merma» elegida, «Ajustes 3»
  // sigue diciendo cuántos ajustes hay. Solo en ese caso cuesta una consulta más.
  const [{ filas, siguiente }, resumen, resumenSinProceso] = await Promise.all([
    listarMovimientos(ubicacionActivaId, filtros, { cursor }),
    getResumenTienda(ubicacionActivaId, filtros),
    filtros.motivo ? getResumenTienda(ubicacionActivaId, { ...filtros, motivo: undefined }) : null,
  ]);
  // La foto y el stock de hoy de cada prenda, y cuántas quedaron después de cada movimiento: ayudas de la lista, a la vez.
  const [prendas, saldos] = await Promise.all([getPrendasDeMovimientos(ubicacionActivaId, filas), getSaldosDeMovimientos(ubicacionActivaId, filas)]);
  const operaciones = agruparPorOperacion(filas);

  // Vacío con un período corto: ¿hay algo si se mira más atrás? Se pregunta una sola vez y solo
  // cuando la lista salió vacía, para que el vacío ofrezca el siguiente paso con la cifra real.
  const vacio = filas.length === 0 && !cursor;
  const periodoCortoElegido = periodo === "7" || periodo === "30";
  const resumen90 = vacio && periodoCortoElegido ? await getResumenTienda(ubicacionActivaId, { ...filtros, desde: desdeDeUltimosDias(90), hasta: undefined }) : null;
  const en90 = resumen90 ? resumen90[filtros.categoria ?? "todos"].operaciones : 0;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={ubicacionActiva?.nombre ?? "—"}
        titulo="Movimientos"
        subtitulo="Qué entró y qué salió del stock de esta sede, quién lo hizo y por qué. No se edita ni se borra nunca."
        acciones={
          // Una descarga directa con los mismos filtros de la pantalla (sin la página ni el detalle abierto), como
          // Exportar de Historial: el archivo es exactamente lo que se ve, completo. Va en `acciones` (a la derecha,
          // que aquí está libre: las cifras van en su fila), no en `pie`: bajo la frase ocupaba una fila entera y
          // empujaba la lista fuera de la primera pantalla (ADR-0220).
          <a href={`/inventario/movimientos/exportar${cadenaExportar(params)}`} download className="btn-cayla btn-secundario inline-flex items-center gap-2">
            <Download aria-hidden strokeWidth={1.5} className="h-4 w-4" />
            Exportar a Excel
          </a>
        }
      />

      {resumen ? (
        <Cifras resumen={resumen} categoria={filtros.categoria ?? null} sede={sede} periodo={periodoCorto(periodo, filtros.desde, filtros.hasta)} />
      ) : (
        <p className="nota-cayla text-sm">Las cifras de arriba no se pudieron leer ahora; la lista de abajo está completa.</p>
      )}

      {/* Filtros y lista en UNA tarjeta (ADR-0169): lo que se filtra y lo filtrado se leen como una sola cosa, y la
          lista sube a la primera pantalla. Separadas, entre las dos iban dos huecos y una línea de ayuda, y en 1366×768
          se veía una sola fila. */}
      <section aria-label="Movimientos de la sede" className="card-cayla overflow-hidden">
        <FiltrosMovimientos
          sububicaciones={sububicaciones}
          sub={sub}
          periodo={periodo}
          desde={filtros.desde ?? ""}
          hasta={filtros.hasta ?? ""}
          resumen={resumenSinProceso ?? resumen}
        />
        {vacio ? (
          <MovimientosVacio
            sede={sede}
            periodo={periodo === "todo" ? "todo el historial" : periodo === "personalizado" ? "el período elegido" : `los últimos ${periodo} días`}
            conFiltros={!!(filtros.busqueda || filtros.categoria || filtros.motivo || filtros.sububicacionId)}
            en90={en90}
            params={params}
          />
        ) : (
          <MovimientosLista
            operaciones={operaciones}
            prendas={prendas}
            saldos={saldos}
            hoyLima={hoyEnLima()}
            enlaceCompras={esLider}
            enlaceVentas={veModulo(persona, "historial")}
          />
        )}
      </section>

      <PaginacionCursor
        mostradas={operaciones.length}
        cursorSiguiente={siguiente ? serializarCursorMovimientos(siguiente) : null}
        hayCursor={!!cursor}
        // Sin `mov`: el detalle abierto es de ESTA página, no viaja a la siguiente.
        params={{ ...params, mov: undefined }}
        pathname="/inventario/movimientos"
        sustantivo={["movimiento", "movimientos"]}
      />

      {/* La ayuda de uso va en la nota del pie, como en toda pantalla (ADR-0169): lo que se toca y adónde lleva, sin
          prometer lo que no hace (ADR-0234). Las filas ya se ven tocables (flecha, referencia subrayada). */}
      <p className="nota-cayla">
        Toca un movimiento para ver qué prendas fueron y quién lo hizo. «Traslado N» y «Conteo N» abren su pantalla
        {veModulo(persona, "historial") ? "; una boleta, su venta." : "."}{" "}
        <b>Registro transparente:</b> cada movimiento queda con quién lo hizo, a qué hora y contra qué documento (boleta, factura
        del proveedor, traslado, conteo). No se edita ni se borra nunca — se corrige con otro movimiento, y los dos quedan.
      </p>
    </div>
  );
}

// Tres tarjetas leídas desde la tienda (ADR-0234; mismo lenguaje visual que «Prioridades de hoy» de Existencias):
// lo que ENTRÓ a la sede (del proveedor, del Taller, de una devolución…), lo que SALIÓ y los ajustes. Cada una nombra la
// sede —comparar dos tiendas sin darse cuenta es fácil si la sede solo está arriba, en chico— y el período. Siguen al
// filtro de tipo, como a los demás: con «Traslados» elegido, «Entró» dice solo lo que llegó por traslado.
// Ninguna es clic: el filtro de tipo ya está debajo, y la misma acción en dos controles confunde más de lo que ayuda.
function Cifras({ resumen, categoria, sede, periodo }: { resumen: ResumenTienda; categoria: CategoriaMovimiento | null; sede: string; periodo: string }) {
  const n = (v: number) => Math.abs(v).toLocaleString("es-PE");
  // Con un tipo elegido, las tres tarjetas miran lo que ese filtro muestra: con «Traslados», «Entró» es lo que llegó por
  // traslado y «Salió», lo que salió por traslado. Los ajustes van aparte (D1): solo cuentan en su tarjeta.
  const vacio: CifrasGrupo = { operaciones: 0, entran: 0, salen: 0, movidas: 0, procesos: [] };
  const grupo = categoria ? resumen[categoria] : null;
  const entro = !grupo ? resumen.entrada : categoria === "ajuste" ? vacio : grupo;
  const salio = !grupo ? resumen.salida : categoria === "ajuste" ? vacio : grupo;
  const ajustes = !grupo || categoria === "ajuste" ? resumen.ajuste : vacio;
  const netoAjustes = ajustes.entran - ajustes.salen;
  const movidas = !categoria || categoria === "interno" ? resumen.interno.movidas : 0;
  const valorAjustes = ajustes.operaciones === 0 ? "—" : `${netoAjustes > 0 ? "+" : netoAjustes < 0 ? "−" : ""}${n(netoAjustes)}`;
  return (
    <>
      {/* En el celular, las tres cifras en UNA franja: tres tarjetas apiladas se comían la primera pantalla y el primer
          movimiento quedaba a 1.000 px (revisión del 2026-09-26). El desglose queda para la pantalla ancha. */}
      <div className="card-cayla px-4 py-3 sm:hidden" aria-label={`Cifras de ${sede} · ${periodo}`}>
        <p className="label-cayla text-[10px] font-bold text-taupe">
          {sede} · {periodo}
        </p>
        <dl className="mt-1.5 grid grid-cols-3 gap-2">
          <CifraCorta etiqueta="Entró" valor={entro.entran === 0 ? "—" : `+${n(entro.entran)}`} tono={entro.entran > 0 ? "text-verde" : undefined} />
          <CifraCorta etiqueta="Salió" valor={salio.salen === 0 ? "—" : `−${n(salio.salen)}`} />
          <CifraCorta etiqueta="Ajustes" valor={valorAjustes} tono={netoAjustes < 0 ? "text-rojo" : undefined} />
        </dl>
      </div>
    <div className="hidden gap-3 sm:grid sm:grid-cols-3">
      <TarjetaCifra etiqueta={`Entró a ${sede} · ${periodo}`} valor={entro.entran === 0 ? "—" : `+${n(entro.entran)}`} unidad={unidades(entro.entran)} tono={entro.entran > 0 ? "text-verde" : undefined}>
        {entro.entran === 0 ? "No entró nada en el período" : desgloseCifras(entro, "entran")}
      </TarjetaCifra>
      {/* «Salió» no es alarma (una venta es lo esperado, no un problema): neutro, no coral. */}
      <TarjetaCifra etiqueta={`Salió de ${sede} · ${periodo}`} valor={salio.salen === 0 ? "—" : `−${n(salio.salen)}`} unidad={unidades(salio.salen)}>
        {salio.salen === 0 ? "No salió nada en el período" : desgloseCifras(salio, "salen")}
      </TarjetaCifra>
      <TarjetaCifra
        etiqueta={`Ajustes en ${sede} · ${periodo}`}
        valor={valorAjustes}
        unidad={unidades(netoAjustes)}
        tono={netoAjustes < 0 ? "text-rojo" : undefined}
      >
        {ajustes.operaciones === 0 ? "Sin ajustes en el período" : desgloseCifras(ajustes, "neto") || "Se compensaron entre sí"}
        {movidas > 0 && <span className="block">Además, {n(movidas)} movidas entre piso y almacén (no cambian el total).</span>}
      </TarjetaCifra>
    </div>
    </>
  );
}

function CifraCorta({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-taupe">{etiqueta}</dt>
      <dd className={`font-display text-2xl leading-tight tabular-nums ${tono ?? "text-tinta"}`}>{valor}</dd>
    </div>
  );
}

/** Los filtros de la URL para el archivo: todos menos la página (`cursor`) y el detalle abierto (`mov`). */
function cadenaExportar(params: ParamsMovimientos): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "cursor" && k !== "mov") p.set(k, v);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
