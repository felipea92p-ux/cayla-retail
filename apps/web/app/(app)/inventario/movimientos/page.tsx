import Link from "next/link";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getSububicaciones } from "@/lib/sububicaciones";
import {
  agruparPorOperacion,
  cursorDesdeParams,
  filtrosDesdeParams,
  getPrendasDeMovimientos,
  getApartadosDeMovimientos,
  getResumenTienda,
  getSaldosDeMovimientos,
  listarMovimientos,
  periodoCorto,
  serializarCursorMovimientos,
  hoyEnLima,
  type CategoriaFiltro,
  type ParamsMovimientos,
} from "@/lib/movimientos-v2";
import { desdeDeUltimosDias, restarDias } from "@/lib/movimientos-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas } from "@/components/ui/Pestanas";
import { PerdidasVista } from "@/components/perdidas/PerdidasVista";
import { getResumenPerdidas } from "@/lib/perdidas";
import {
  DIAS_VENTANA_REPETICION,
  MODULOS_DE_RESPALDO,
  PERIODOS_PERDIDAS,
  filtrosPerdidas,
  hrefPerdidas,
  perdidasQueSeRepiten,
  rangoPerdidas,
  type ParamsPerdidas,
} from "@/lib/perdidas-reglas";
import { FiltrosMovimientos } from "@/components/FiltrosMovimientos";
import { TiposMovimiento } from "@/components/movimientos/TiposMovimiento";
import { MovimientosLista } from "@/components/MovimientosLista";
import { MovimientosVacio } from "@/components/MovimientosVacio";
import { MenuMovimientos } from "@/components/MenuMovimientos";
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
export default async function MovimientosPage({ searchParams }: { searchParams: Promise<ParamsMovimientos & ParamsPerdidas> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  // ADR-0328 act. 14: «Pérdidas» es una pestaña de Movimientos, no un módulo (ADR-0306): quien ve Movimientos la ve.
  if (params.vista === "perdidas") {
    // Los respaldos («Conteo 7», «Traslado 24») enlazan solo si la cuenta ve esa pantalla (ADR-0161, como los atajos).
    const modulos = MODULOS_DE_RESPALDO.filter((clave) => veModulo(persona, clave));
    return <PaginaPerdidas ubicacionId={persona.ubicacionId} modulos={modulos} params={params} />;
  }
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
  // «Hoy» por defecto en el celular (ADR-0241): la pregunta de la tienda es «qué pasó hoy», y en el teléfono cada fila
  // de más es un deslizamiento. Se decide en el servidor por el aparato que pide la página: sin una segunda carga ni
  // un parpadeo de «30 días» a «Hoy». Una tableta o la computadora siguen en 30 días.
  const esCelular = userAgent({ headers: await headers() }).device.type === "mobile";
  const porDefecto = esCelular ? "hoy" : "30";
  const { periodo, sub, ...filtros } = filtrosDesdeParams(params, { sububicaciones, porDefecto });
  const cursor = cursorDesdeParams(params);

  // Las cifras de las píldoras cuentan con los demás filtros, pero no con el proceso: con «Merma» elegida, «Ajustes 3»
  // sigue diciendo cuántos ajustes hay. Solo en ese caso cuesta una consulta más.
  const [{ filas, siguiente }, resumen, resumenSinProceso] = await Promise.all([
    listarMovimientos(ubicacionActivaId, filtros, { cursor }),
    getResumenTienda(ubicacionActivaId, filtros),
    filtros.motivo ? getResumenTienda(ubicacionActivaId, { ...filtros, motivo: undefined }) : null,
  ]);
  // La foto y el stock de hoy de cada prenda, y cuántas quedaron después de cada movimiento: ayudas de la lista, a la vez.
  // Y el apartado de cada movimiento de apartar o liberar (ADR-0241), para su código y su enlace.
  const [prendas, saldos, apartados] = await Promise.all([
    getPrendasDeMovimientos(ubicacionActivaId, filas),
    getSaldosDeMovimientos(ubicacionActivaId, filas),
    getApartadosDeMovimientos(filas),
  ]);
  const operaciones = agruparPorOperacion(filas);

  // Vacío con un período corto: ¿hay algo si se mira más atrás? Se pregunta una sola vez y solo
  // cuando la lista salió vacía, para que el vacío ofrezca el siguiente paso con la cifra real.
  const vacio = filas.length === 0 && !cursor;
  const periodoCortoElegido = periodo === "hoy" || periodo === "7" || periodo === "30";
  const resumen90 = vacio && periodoCortoElegido ? await getResumenTienda(ubicacionActivaId, { ...filtros, desde: desdeDeUltimosDias(90), hasta: undefined }) : null;
  const en90 = resumen90 ? resumen90[filtros.categoria ?? "todos"].operaciones : 0;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={ubicacionActiva?.nombre ?? "—"}
        titulo="Movimientos"
        // «No se edita ni se borra nunca» lo dice la nota del pie, completo (ADR-0241: una vez, no dos).
        subtitulo="Qué entró y qué salió del stock de esta sede, quién lo hizo y por qué."
        acciones={
          // Exportar (la misma descarga directa de ADR-0234, con los filtros de la pantalla) y copiar esta vista viven en
          // el «⋯» (ADR-0241): son de vez en cuando, y en el celular el botón suelto ocupaba una fila entera.
          <MenuMovimientos hrefExportar={`/inventario/movimientos/exportar${cadenaExportar(params, periodo, porDefecto)}`} />
        }
      />

      <PestanasMovimientos activa="movimientos" />

      {/* Filtros y lista en UNA tarjeta (ADR-0169): lo que se filtra y lo filtrado se leen como una sola cosa, y la
          lista sube a la primera pantalla. Separadas, entre las dos iban dos huecos y una línea de ayuda, y en 1366×768
          se veía una sola fila. */}
      {/* Lista a la izquierda, tipos a la derecha (rediseño 2026-10-05, ADR-0353, columna que pidió Felipe): los siete botones son el
          filtro de tipo Y sus cifras —reemplazan a las píldoras de tipo y a las tres tarjetas de arriba—. Desde lg la columna
          acompaña al bajar por la lista; debajo, la fila de botones va ARRIBA de la lista y se desliza de lado. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start">
      <aside className="order-1 min-w-0 space-y-3 lg:sticky lg:top-[4.75rem] lg:order-2">
        <TiposMovimiento resumen={resumenSinProceso ?? resumen} categoria={filtros.categoria ?? null} hrefTipo={(cat) => hrefConTipo(params, cat)} periodo={periodoCorto(periodo, filtros.desde, filtros.hasta)} />
        {!resumen && <p className="nota-cayla text-sm">Las cifras no se pudieron leer ahora; la lista está completa.</p>}
      </aside>
      <div className="order-2 min-w-0 space-y-6 lg:order-1">
      <section aria-label="Movimientos de la sede" className="card-cayla overflow-hidden">
        <FiltrosMovimientos
          sububicaciones={sububicaciones}
          sub={sub}
          periodo={periodo}
          periodoPorDefecto={porDefecto}
          hrefExportar={`/inventario/movimientos/exportar${cadenaExportar(params, periodo, porDefecto)}`}
          desde={filtros.desde ?? ""}
          hasta={filtros.hasta ?? ""}
          resumen={resumenSinProceso ?? resumen}
        />
        {/* `data-resultados` (main, ADR-0149): se atenúa mientras el buscador espera a la base (useBusquedaEnUrl). */}
        <div data-resultados>
          {vacio ? (
            <MovimientosVacio
              sede={sede}
              periodo={periodo === "todo" ? "todo el historial" : periodo === "personalizado" ? "el período elegido" : periodo === "hoy" ? "hoy" : `los últimos ${periodo} días`}
              conFiltros={!!(filtros.busqueda || filtros.categoria || filtros.motivo || filtros.sububicacionId)}
              en90={en90}
              params={params}
            />
          ) : (
            // Sin `ubicacionId`/`sububicaciones`: el cajón nuevo (diseño aprobado 2026-09-28) no tiene «Corregir con un
            // ajuste» — MovimientosLista ya no los recibe (ver su propio comentario sobre por qué).
            <MovimientosLista
              operaciones={operaciones}
              prendas={prendas}
              saldos={saldos}
              apartados={apartados}
              // Los módulos a los que llevan los atajos, preguntados como en cualquier pantalla (`veModulo`, ADR-0161).
              accesos={{
                modulos: MODULOS_DE_ATAJOS.filter((clave) => veModulo(persona, clave)),
                puedeAjustar: puede(persona, "ajustarStock"),
              }}
              // Las bajadas al piso del día se pliegan solo en «Todos» sin búsqueda (ADR-0241): con la píldora
              // «Piso ↔ almacén» o buscando una prenda, cada una es su fila.
              plegar={!filtros.categoria && !filtros.motivo && !filtros.busqueda}
              hoyLima={hoyEnLima()}
              enlaceCompras={esLider}
              enlaceVentas={veModulo(persona, "historial")}
            />
          )}
        </div>
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
      </div>
      </div>

      {/* La ayuda de uso va en la nota del pie, como en toda pantalla (ADR-0169): lo que se toca y adónde lleva, sin
          prometer lo que no hace (ADR-0234). Las filas ya se ven tocables (flecha, referencia subrayada). */}
      {/* ADR-0241: sin la instrucción de uso («Toca un movimiento…»): las filas ya se ven tocables (flecha, referencia
          subrayada) y a la tercera visita era ruido. Queda la regla del negocio. */}
      <p className="nota-cayla">
        <b>Registro transparente:</b> cada movimiento queda con quién lo hizo, a qué hora y contra qué documento (boleta, factura
        del proveedor, traslado, conteo). No se edita ni se borra nunca — se corrige con otro movimiento, y los dos quedan.
      </p>
    </div>
  );
}

/** Las dos vistas de Movimientos (ADR-0328 act. 14): el libro entero y lo que se perdió. Enlaces, no estado: la vista vive en
 *  la URL, se comparte y «atrás» funciona (ADR-0111). */
function PestanasMovimientos({ activa }: { activa: "movimientos" | "perdidas" }) {
  return (
    <Pestanas
      idIndicador="movimientos-vistas"
      etiquetaAccesible="Vistas de Movimientos"
      activa={activa}
      items={[
        { clave: "movimientos", etiqueta: "Movimientos", href: "/inventario/movimientos" },
        { clave: "perdidas", etiqueta: "Pérdidas", href: hrefPerdidas() },
      ]}
    />
  );
}

/** La pestaña «Pérdidas»: el período y los filtros de la URL, las dos lecturas a la vez (el período elegido y los últimos
 *  30 días de «se repite», que es lo mismo que avisa el Inicio del líder) y la vista. Sin filtros de Movimientos: es otra
 *  pregunta («¿cuánto perdimos?»), con su propio período (por defecto, este mes). */
async function PaginaPerdidas({ ubicacionId, modulos, params }: { ubicacionId: string; modulos: readonly string[]; params: ParamsPerdidas }) {
  const hoy = hoyEnLima();
  const rango = rangoPerdidas(params.p, hoy);
  const filtro = filtrosPerdidas(params);
  const filtrada = Boolean(filtro.varianteId || filtro.sububicacionId);
  const desde30 = restarDias(hoy, DIAS_VENTANA_REPETICION - 1);
  // «Se repite» mira siempre los últimos 30 días de toda la sede. Si el período elegido ya es ese, una sola lectura.
  const mismo = !filtrada && rango.desde === desde30 && rango.hasta === hoy;
  const [ubicaciones, resumen, ultimos30] = await Promise.all([
    getUbicaciones(),
    getResumenPerdidas(ubicacionId, rango.desde, rango.hasta, filtro),
    filtrada || mismo ? Promise.resolve(null) : getResumenPerdidas(ubicacionId, desde30, hoy),
  ]);
  const sede = ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "esta sede";
  const base30 = mismo ? resumen : ultimos30;
  const repeticiones = filtrada ? null : base30 ? perdidasQueSeRepiten(base30.hechos, hoy) : null;
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={sede}
        titulo="Movimientos"
        subtitulo="Pérdidas: todo lo que salió sin venderse. Lo que apareció va aparte."
      />
      <PestanasMovimientos activa="perdidas" />
      <PerdidasVista
        resumen={resumen}
        repeticiones={repeticiones}
        sede={sede}
        periodo={rango.periodo}
        periodoTexto={rango.texto}
        filtro={filtro}
        modulos={modulos}
        selectorPeriodo={
          // Un período es un filtro de un valor: la píldora del sistema (ADR-0357), no el segmento de modo.
          // Cambiar el período conserva la prenda o la zona elegida.
          <nav aria-label="Período de las pérdidas" className="flex flex-wrap items-center gap-2">
            {PERIODOS_PERDIDAS.map((o) => (
              <Link key={o.valor} href={hrefPerdidas({ periodo: o.valor, ...filtro })} replace aria-current={o.valor === rango.periodo ? "page" : undefined} className="pildora-cayla">
                {o.etiqueta}
              </Link>
            ))}
          </nav>
        }
      />
    </div>
  );
}

/** Las pantallas a las que llevan los atajos de un movimiento (ADR-0241). Etiquetas de precio no es un módulo: la
 *  protege la RLS de lo que muestra. */
const MODULOS_DE_ATAJOS = ["cambios", "devoluciones", "conteos", "existencias", "apartados"] as const;

/** La misma pantalla con otro tipo (o sin tipo): sin el proceso, la página ni el detalle abierto — como la píldora. */
function hrefConTipo(params: ParamsMovimientos, cat: CategoriaFiltro | null): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && !["cat", "proc", "cursor", "mov"].includes(k)) p.set(k, v);
  if (cat) p.set("cat", cat);
  const qs = p.toString();
  return qs ? `/inventario/movimientos?${qs}` : "/inventario/movimientos";
}

/** Los filtros de la URL para el archivo: todos menos la página (`cursor`) y el detalle abierto (`mov`). Si rige «Hoy»
 *  por defecto (el celular, sin nada en la URL), el archivo lo lleva escrito: la ruta no sabe qué aparato la pide y
 *  bajaría 30 días. */
function cadenaExportar(params: ParamsMovimientos, periodo: string, porDefecto: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "cursor" && k !== "mov") p.set(k, v);
  if (!params.rango && !params.desde && !params.hasta && periodo === "hoy" && porDefecto === "hoy") p.set("rango", "hoy");
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
