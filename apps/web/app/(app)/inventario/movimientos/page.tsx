import { Info } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getSububicaciones } from "@/lib/sububicaciones";
import {
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
import { CATEGORIAS, desdeDeUltimosDias, type CategoriaMovimiento } from "@/lib/movimientos-reglas";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
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
  const { periodo, sub, ...filtros } = filtrosDesdeParams(params, { sububicaciones });
  const cursor = cursorDesdeParams(params);

  // Las cifras de las píldoras de tipo cuentan con los demás filtros, pero no con el proceso: con
  // «Merma» elegida, «Salidas 27» sigue diciendo cuántas salidas hay. Solo en ese caso cuesta una
  // consulta más (el resumen ya ignora el tipo).
  const [{ filas, siguiente }, resumen, resumenSinProceso] = await Promise.all([
    listarMovimientos(ubicacionActivaId, filtros, { cursor }),
    getResumenMovimientos(ubicacionActivaId, filtros),
    filtros.motivo ? getResumenMovimientos(ubicacionActivaId, { ...filtros, motivo: undefined }) : null,
  ]);
  const conteos = Object.fromEntries(CATEGORIAS.map((c) => [c, (resumenSinProceso ?? resumen)[c].movimientos])) as Record<CategoriaMovimiento, number>;

  // Vacío con un período corto: ¿hay algo si se mira más atrás? Se pregunta una sola vez y solo
  // cuando la lista salió vacía, para que el vacío ofrezca el siguiente paso con la cifra real.
  const vacio = filas.length === 0 && !cursor;
  const periodoCorto = periodo === "7" || periodo === "30";
  // El resumen agrupa por tipo pero no filtra por él: con un tipo elegido se cuenta solo su fila.
  const resumen90 = vacio && periodoCorto ? await getResumenMovimientos(ubicacionActivaId, { ...filtros, desde: desdeDeUltimosDias(90), hasta: undefined }) : null;
  const en90 = !resumen90
    ? 0
    : filtros.categoria
      ? resumen90[filtros.categoria].movimientos
      : CATEGORIAS.reduce((acc, c) => acc + resumen90[c].movimientos, 0);

  const periodoEnPalabras = textoPeriodo(periodo, filtros.desde, filtros.hasta);

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Inventario · Movimientos"
        titulo={ubicacionActiva?.nombre ?? "—"}
        bajada="Qué cambió en el stock de esta sede, el proceso que lo originó y de dónde a dónde. No se edita ni se borra nunca."
      />

      <Resumen resumen={resumen} periodo={periodoEnPalabras} />

      <FiltrosMovimientos sububicaciones={sububicaciones} sub={sub} periodo={periodo} desde={filtros.desde ?? ""} hasta={filtros.hasta ?? ""} conteos={conteos} />

      {vacio ? (
        <MovimientosVacio
          sede={ubicacionActiva?.nombre ?? "esta sede"}
          periodo={periodo === "todo" ? "todo el historial" : periodo === "personalizado" ? "el período elegido" : `los últimos ${periodo} días`}
          conFiltros={!!(filtros.busqueda || filtros.categoria || filtros.motivo || filtros.sububicacionId)}
          en90={en90}
          params={params}
        />
      ) : (
        <>
          {/* Reemplaza al detalle que antes se abría al hacer clic en cualquier fila (quitado en este
              rediseño): una sola línea, sin caja, para que se entienda la Referencia sin tener que
              probar a hacer clic en una fila y descubrir que ya no pasa nada. */}
          <p className="flex items-center gap-2 text-xs text-tinta/55">
            <Info aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0" />
            Haz clic en una Referencia para ver el detalle en su módulo de origen — ventas en Historial, traslados en Traslados, compras en Compras.
          </p>
          <MovimientosLista movimientos={filas} hoyLima={hoyEnLima()} enlaceCompras={esLider} />
        </>
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

// Tres tarjetas (diseño de Felipe, 2026-09-16; mismo lenguaje visual que «Prioridades de hoy» de
// Existencias desde 2026-09-22 — `TarjetaIndicador`), del mismo período que la lista — no de la
// página: con paginado, la página nunca es «todo el período». La primera cuenta registros y los
// reparte por categoría; las otras dos son las unidades que entraron y salieron. Traslados, ajustes e
// internos viven en el desglose de la primera con su signo (¿la sede recibió o mandó?, ¿faltó o
// sobró?) — son las cifras que antes tenían tarjeta propia y siguen a la vista, solo más compactas.
// Sin «Ajustes» aparte: ya está en ese desglose, y sumar una cuarta tarjeta por lo mismo sería la caja
// de más que Felipe pidió evitar. Ninguna es clic — ya existe el filtro «Tipo» debajo para eso, y
// poner la misma acción en dos controles distintos confunde más de lo que ayuda.
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
      {/* «Salida» no es alarma (una venta es lo esperado, no un problema) — mismo criterio de color
          que ya usa la lista (`tonoCategoria`): neutro, no coral. */}
      <Tarjeta etiqueta={`${ETIQUETA_CATEGORIA.salida}s`} valor={resumen.salida.movimientos === 0 ? "—" : `−${n(resumen.salida.unidades)}`} unidad="unidades">
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
