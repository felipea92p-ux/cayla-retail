import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getSububicaciones } from "@/lib/sububicaciones";
import { getColaboradores } from "@/lib/colaboradores";
import {
  cursorDesdeParams,
  filtrosDesdeParams,
  getResumenMovimientos,
  listarMovimientos,
  serializarCursorMovimientos,
  CATEGORIAS,
  ETIQUETA_CATEGORIA,
  fechaCorta,
  hoyEnLima,
  type ParamsMovimientos,
  type ResumenMovimientos,
} from "@/lib/movimientos-v2";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { FiltrosMovimientos } from "@/components/FiltrosMovimientos";
import { MovimientosLista } from "@/components/MovimientosLista";
import { PaginacionCursor } from "@/components/Paginacion";

// Movimientos (2026-09-15): «por qué cambió el stock», ahora con búsqueda,
// filtros, detalle y paginado — todo resuelto en Postgres por `fn_movimientos`
// (20260915090000_movimientos_lectura.sql). Esta página solo traduce la URL a
// filtros y elige el layout; no calcula nada sobre las filas.
//
// Sigue siendo un historial: no hay botón de crear, editar ni borrar. Un
// movimiento se corrige con el proceso de negocio (una devolución, un
// conteo), nunca tocando la fila — el trigger de inmutabilidad lo impide.
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

  const { rangoPorDefecto, ...filtros } = filtrosDesdeParams(params);
  const cursor = cursorDesdeParams(params);

  const [{ filas, siguiente }, resumen, sububicaciones, colaboradores] = await Promise.all([
    listarMovimientos(ubicacionActivaId, filtros, { cursor }),
    getResumenMovimientos(ubicacionActivaId, filtros),
    getSububicaciones(ubicacionActivaId),
    esLider ? getColaboradores() : Promise.resolve([]),
  ]);

  const hayFiltros = !!(filtros.busqueda || filtros.categoria || filtros.motivo || filtros.usuarioId || filtros.sububicacionId || !rangoPorDefecto);
  const textoPeriodo = rangoPorDefecto
    ? "Últimos 30 días"
    : filtros.desde && filtros.hasta
      ? `${fechaCorta(filtros.desde)} – ${fechaCorta(filtros.hasta)}`
      : filtros.desde
        ? `Desde ${fechaCorta(filtros.desde)}`
        : filtros.hasta
          ? `Hasta ${fechaCorta(filtros.hasta)}`
          : "Todo el historial";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Movimientos</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">{ubicacionActiva?.nombre ?? "—"}</h1>
          <p className="mt-1 text-sm text-tinta/65">
            Cada cambio del stock con su proceso, quién lo hizo y de dónde a dónde. No se edita ni se borra nunca.
          </p>
        </div>
        {esLider && <SelectorUbicacion ubicaciones={ubicaciones} ubicacionActualId={ubicacionActivaId} />}
      </div>

      <Resumen resumen={resumen} periodo={textoPeriodo} />

      <FiltrosMovimientos
        sububicaciones={sububicaciones}
        colaboradores={esLider ? colaboradores.map((c) => ({ id: c.persona_id, nombre: c.nombre })) : null}
        rangoPorDefecto={rangoPorDefecto}
        desdePorDefecto={filtros.desde ?? ""}
      />

      {filas.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ningún movimiento coincide con esos filtros." : "Todavía no hay movimientos en esta ubicación."}
        </p>
      ) : (
        <MovimientosLista movimientos={filas} hoyLima={hoyEnLima()} />
      )}

      <PaginacionCursor
        mostradas={filas.length}
        cursorSiguiente={siguiente ? serializarCursorMovimientos(siguiente) : null}
        hayCursor={!!cursor}
        params={params}
        pathname="/movimientos"
        sustantivo={["movimiento", "movimientos"]}
      />
    </div>
  );
}

// Cinco cifras, una por categoría, del período filtrado — no de la página:
// con paginado, la página nunca es «todo el período». Entradas y salidas se
// leen como unidades; ajustes y transferencias con signo (es lo que importa:
// ¿faltó o sobró?, ¿la sede recibió o mandó?); internos como unidades
// repuestas (no cambian el total de la tienda).
function Resumen({ resumen, periodo }: { resumen: ResumenMovimientos; periodo: string }) {
  const cifra = (categoria: (typeof CATEGORIAS)[number]) => {
    const r = resumen[categoria];
    if (r.movimientos === 0) return "—";
    if (categoria === "entrada") return `+${r.unidades.toLocaleString("es-PE")}`;
    if (categoria === "salida") return `−${r.unidades.toLocaleString("es-PE")}`;
    if (categoria === "interno") return r.unidades.toLocaleString("es-PE");
    return r.delta > 0 ? `+${r.delta.toLocaleString("es-PE")}` : r.delta < 0 ? `−${Math.abs(r.delta).toLocaleString("es-PE")}` : "0";
  };
  return (
    <div className="card-cayla px-5 py-4">
      <p className="label-cayla text-[11px] text-tinta/55">{periodo}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        {CATEGORIAS.map((c) => (
          <div key={c}>
            <dt className="label-cayla text-[11px] text-tinta/65">{ETIQUETA_CATEGORIA[c]}s</dt>
            <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta">{cifra(c)}</dd>
            <dd className="text-xs text-tinta/55">
              {resumen[c].movimientos === 0
                ? "sin movimientos"
                : `${resumen[c].movimientos.toLocaleString("es-PE")} ${resumen[c].movimientos === 1 ? "movimiento" : "movimientos"}`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
