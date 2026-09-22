import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getSububicaciones } from "@/lib/sububicaciones";
import {
  DIAS_POR_DEFECTO,
  cursorDesdeParams,
  filtrosDesdeParams,
  getResumenMovimientos,
  listarMovimientos,
  serializarCursorMovimientos,
  ETIQUETA_CATEGORIA,
  hoyEnLima,
  textoPeriodo,
  type ParamsMovimientos,
  type ResumenMovimientos,
} from "@/lib/movimientos-v2";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { FiltrosMovimientos } from "@/components/FiltrosMovimientos";
import { MovimientosLista } from "@/components/MovimientosLista";
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
export default async function MovimientosPage({ searchParams }: { searchParams: Promise<ParamsMovimientos> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const esLider = persona.rol === "lider";
  const ubicaciones = await getUbicaciones();

  // Mismo criterio que Inventario: una Líder mira cualquier ubicación desde el
  // selector (`?ubicacion=`); una colaboradora, la suya y nada más. La base lo
  // vuelve a comprobar (`fn_puede_operar_ubicacion`) — esto solo decide qué se pinta.
  const ubicacionActivaId =
    esLider && params.ubicacion && ubicaciones.some((u) => u.id === params.ubicacion) ? params.ubicacion : persona.ubicacionId;
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId);

  // Las sububicaciones van primero: «?sub=piso» se traduce a SU id, que solo se sabe mirando la ubicación.
  const sububicaciones = await getSububicaciones(ubicacionActivaId);
  const { periodo, sub, ...filtros } = filtrosDesdeParams(params, { sububicaciones });
  const cursor = cursorDesdeParams(params);

  const [{ filas, siguiente }, resumen] = await Promise.all([
    listarMovimientos(ubicacionActivaId, filtros, { cursor }),
    getResumenMovimientos(ubicacionActivaId, filtros),
  ]);

  const hayFiltros = !!(filtros.busqueda || filtros.categoria || filtros.motivo || filtros.sububicacionId || periodo !== String(DIAS_POR_DEFECTO));
  const periodoEnPalabras = textoPeriodo(periodo, filtros.desde, filtros.hasta);

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Inventario · Movimientos"
        titulo={ubicacionActiva?.nombre ?? "—"}
        bajada="Qué cambió en el stock de esta sede, el proceso que lo originó y de dónde a dónde. No se edita ni se borra nunca."
        acciones={esLider ? <SelectorUbicacion ubicaciones={ubicaciones} ubicacionActualId={ubicacionActivaId} /> : undefined}
      />

      <Resumen resumen={resumen} periodo={periodoEnPalabras} />

      <FiltrosMovimientos sububicaciones={sububicaciones} sub={sub} periodo={periodo} desde={filtros.desde ?? ""} hasta={filtros.hasta ?? ""} />

      {filas.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-taupe">
          {hayFiltros ? "Ningún movimiento coincide con esos filtros." : "Todavía no hay movimientos en esta ubicación."}
        </p>
      ) : (
        <MovimientosLista movimientos={filas} hoyLima={hoyEnLima()} enlaceCompras={esLider} />
      )}

      <PaginacionCursor
        mostradas={filas.length}
        cursorSiguiente={siguiente ? serializarCursorMovimientos(siguiente) : null}
        hayCursor={!!cursor}
        // Sin `mov`: el detalle abierto es de ESTA página, no viaja a la siguiente.
        params={{ ...params, mov: undefined }}
        pathname="/inventario/movimientos"
        sustantivo={["movimiento", "movimientos"]}
      />

      <p className="nota-cayla">
        <b>Registro transparente:</b> cada movimiento queda con quién lo hizo, a qué hora y contra qué documento (boleta, factura
        del proveedor, traslado, conteo). No se edita ni se borra nunca — se corrige con otro movimiento, y los dos quedan.
      </p>
    </div>
  );
}

// Tres tarjetas (diseño de Felipe, 2026-09-16), del mismo período que la
// lista — no de la página: con paginado, la página nunca es «todo el
// período». La primera cuenta registros y los reparte por categoría; las
// otras dos son las unidades que entraron y salieron. Traslados, ajustes e
// internos viven en el desglose de la primera con su signo (¿la sede recibió
// o mandó?, ¿faltó o sobró?) — son las cifras que antes tenían tarjeta
// propia y siguen a la vista, solo más compactas.
function Resumen({ resumen, periodo }: { resumen: ResumenMovimientos; periodo: string }) {
  const total = Object.values(resumen).reduce((acc, r) => acc + r.movimientos, 0);
  const n = (v: number) => v.toLocaleString("es-PE");
  const conSigno = (delta: number) => (delta > 0 ? `+${n(delta)}` : delta < 0 ? `−${n(Math.abs(delta))}` : "0");
  const plural = (c: number, uno: string, varios: string) => `${n(c)} ${c === 1 ? uno : varios}`;

  const desglose = [
    resumen.entrada.movimientos > 0 && plural(resumen.entrada.movimientos, "entrada", "entradas"),
    resumen.salida.movimientos > 0 && plural(resumen.salida.movimientos, "salida", "salidas"),
    resumen.transferencia.movimientos > 0 && `${plural(resumen.transferencia.movimientos, "traslado", "traslados")} (${conSigno(resumen.transferencia.delta)})`,
    resumen.ajuste.movimientos > 0 && `${plural(resumen.ajuste.movimientos, "ajuste", "ajustes")} (${conSigno(resumen.ajuste.delta)})`,
    resumen.interno.movimientos > 0 && `${plural(resumen.interno.movimientos, "interno", "internos")}`,
  ].filter(Boolean);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tarjeta etiqueta={`Movimientos · ${periodo}`} valor={n(total)} unidad={total === 1 ? "registro" : "registros"}>
        {total === 0 ? "Sin movimientos en el período" : desglose.join(" · ")}
      </Tarjeta>
      <Tarjeta
        etiqueta={`${ETIQUETA_CATEGORIA.entrada}s`}
        valor={resumen.entrada.movimientos === 0 ? "—" : `+${n(resumen.entrada.unidades)}`}
        unidad="unidades"
        tono={resumen.entrada.movimientos > 0 ? "text-verde" : undefined}
      >
        {resumen.entrada.movimientos === 0
          ? "Nada entró en el período"
          : `${plural(resumen.entrada.movimientos, "movimiento", "movimientos")} · recepciones, devoluciones, producción`}
      </Tarjeta>
      <Tarjeta
        etiqueta={`${ETIQUETA_CATEGORIA.salida}s`}
        valor={resumen.salida.movimientos === 0 ? "—" : `−${n(resumen.salida.unidades)}`}
        unidad="unidades"
      >
        {resumen.salida.movimientos === 0 ? "Nada salió en el período" : `${plural(resumen.salida.movimientos, "movimiento", "movimientos")} · ventas y cambios`}
      </Tarjeta>
    </div>
  );
}

// La tarjeta del sistema (`ui/TarjetaCifra`): antes era una copia local con la misma receta.
function Tarjeta({ etiqueta, valor, unidad, tono, children }: { etiqueta: string; valor: string; unidad: string; tono?: string; children: React.ReactNode }) {
  return (
    <TarjetaCifra etiqueta={etiqueta} valor={valor} unidad={unidad} tono={tono}>
      {children}
    </TarjetaCifra>
  );
}
