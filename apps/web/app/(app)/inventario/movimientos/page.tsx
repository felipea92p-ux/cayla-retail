import Link from "next/link";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getSububicaciones } from "@/lib/sububicaciones";
import {
  agruparPorOperacion,
  cursorDesdeParams,
  desgloseCifras,
  filtrosDesdeParams,
  getPrendasDeMovimientos,
  getApartadosDeMovimientos,
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
import { desdeDeUltimosDias, desgloseAjustes, restarDias, ventasAnuladas } from "@/lib/movimientos-reglas";
import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas } from "@/components/ui/Pestanas";
import { PerdidasVista } from "@/components/perdidas/PerdidasVista";
import { getResumenPerdidas } from "@/lib/perdidas";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
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
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { FiltrosMovimientos } from "@/components/FiltrosMovimientos";
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

      {resumen ? (
        <Cifras resumen={resumen} categoria={filtros.categoria ?? null} sede={sede} periodo={periodoCorto(periodo, filtros.desde, filtros.hasta)} params={params} />
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
      deslizante
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
          <SegmentoEnlaces
            deslizante
            idIndicador="perdidas-periodo"
            etiquetaAccesible="Período de las pérdidas"
            activo={rango.periodo}
            // Cambiar el período conserva la prenda o la zona elegida.
            opciones={PERIODOS_PERDIDAS.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta, href: hrefPerdidas({ periodo: o.valor, ...filtro }) }))}
          />
        }
      />
    </div>
  );
}

/** Las pantallas a las que llevan los atajos de un movimiento (ADR-0241). Etiquetas de precio no es un módulo: la
 *  protege la RLS de lo que muestra. */
const MODULOS_DE_ATAJOS = ["cambios", "devoluciones", "conteos", "existencias", "apartados"] as const;

// Tres tarjetas leídas desde la tienda (ADR-0234; mismo lenguaje visual que «Prioridades de hoy» de Existencias):
// lo que ENTRÓ a la sede (del proveedor, del Taller, de una devolución…), lo que SALIÓ y los ajustes. Cada una nombra la
// sede —comparar dos tiendas sin darse cuenta es fácil si la sede solo está arriba, en chico— y el período. Siguen al
// filtro de tipo, como a los demás: con «Traslados» elegido, «Entró» dice solo lo que llegó por traslado.
// Cada una se toca (ADR-0241, Felipe eligió tarjetas tocables): «Salió» filtra las salidas, como la píldora; tocada
// otra vez, vuelve a «Todos». Hasta el 2026-09-26 no eran clic («la misma acción en dos controles confunde»), pero en el
// celular la franja es lo primero que el pulgar encuentra y la píldora queda dentro de la hoja de filtros.
function Cifras({
  resumen,
  categoria,
  sede,
  periodo,
  params,
}: {
  resumen: ResumenTienda;
  categoria: CategoriaMovimiento | null;
  sede: string;
  periodo: string;
  params: ParamsMovimientos;
}) {
  const hrefTipo = (cat: CategoriaMovimiento) => hrefConTipo(params, categoria === cat ? null : cat);
  const n = (v: number) => Math.abs(v).toLocaleString("es-PE");
  // Con un tipo elegido, las tres tarjetas miran lo que ese filtro muestra: con «Traslados», «Entró» es lo que llegó por
  // traslado y «Salió», lo que salió por traslado. Los ajustes van aparte (D1): solo cuentan en su tarjeta.
  const vacio: CifrasGrupo = { operaciones: 0, entran: 0, salen: 0, movidas: 0, procesos: [] };
  const grupo = categoria ? resumen[categoria] : null;
  const entro = !grupo ? resumen.entrada : categoria === "ajuste" ? vacio : grupo;
  const salio = !grupo ? resumen.salida : categoria === "ajuste" ? vacio : grupo;
  const ajustes = !grupo || categoria === "ajuste" ? resumen.ajuste : vacio;
  const desglose = desgloseAjustes(ajustes);
  const movidas = !categoria || categoria === "interno" ? resumen.interno.movidas : 0;
  return (
    <>
      {/* En el celular, las tres cifras en UNA franja: tres tarjetas apiladas se comían la primera pantalla y el primer
          movimiento quedaba a 1.000 px (revisión del 2026-09-26). El desglose queda para la pantalla ancha. */}
      <div className="card-cayla px-4 py-3 sm:hidden" aria-label={`Cifras de ${sede} · ${periodo}`}>
        <p className="label-cayla text-[10px] font-bold text-taupe">
          {sede} · {periodo}
        </p>
        <dl className="mt-1.5 grid grid-cols-3 gap-2">
          <CifraCorta etiqueta="Entró" valor={entro.entran === 0 ? "—" : `+${n(entro.entran)}`} tono={entro.entran > 0 ? "text-verde" : undefined} href={hrefTipo("entrada")} activa={categoria === "entrada"} />
          <CifraCorta etiqueta="Salió" valor={salio.salen === 0 ? "—" : `−${n(salio.salen)}`} href={hrefTipo("salida")} activa={categoria === "salida"} />
          <CifraCorta
            etiqueta="Ajustes"
            valor={ajustes.operaciones === 0 ? "—" : <CarasAjustes faltaron={ajustes.salen} aparecieron={ajustes.entran} corta />}
            href={hrefTipo("ajuste")}
            activa={categoria === "ajuste"}
          />
        </dl>
      </div>
    <div className="hidden gap-3 sm:grid sm:grid-cols-3">
      <TarjetaCifra etiqueta={`Entró a ${sede} · ${periodo}`} valor={entro.entran === 0 ? "—" : `+${n(entro.entran)}`} unidad={unidades(entro.entran)} tono={entro.entran > 0 ? "text-verde" : undefined} href={hrefTipo("entrada")} activa={categoria === "entrada"}>
        {entro.entran === 0 ? "No entró nada en el período" : desgloseCifras(entro, "entran")}
      </TarjetaCifra>
      {/* «Salió» no es alarma (una venta es lo esperado, no un problema): neutro, no coral. */}
      <TarjetaCifra etiqueta={`Salió de ${sede} · ${periodo}`} valor={salio.salen === 0 ? "—" : `−${n(salio.salen)}`} unidad={unidades(salio.salen)} href={hrefTipo("salida")} activa={categoria === "salida"}>
        {/* «30 vendidas (2 se anularon)»: las ventas que se anularon después se dicen junto a las vendidas, no solo en «Entró». */}
        {salio.salen === 0 ? "No salió nada en el período" : desgloseCifras(salio, "salen", { anuladas: ventasAnuladas(resumen) })}
      </TarjetaCifra>
      {/* Ajustes en bruto (Felipe, 2026-10-03): lo que faltó y lo que apareció, nunca un neto — «+52» escondía 35 prendas
          que faltaron. El desglose dice si hay un documento detrás («a mano» o «en un conteo»), no el motivo. */}
      <TarjetaCifra
        etiqueta={`Ajustes en ${sede} · ${periodo}`}
        valor={ajustes.operaciones === 0 ? "—" : <CarasAjustes faltaron={ajustes.salen} aparecieron={ajustes.entran} />}
        href={hrefTipo("ajuste")}
        activa={categoria === "ajuste"}
      >
        {ajustes.operaciones === 0 ? (
          "Sin ajustes en el período"
        ) : (
          <>
            {desglose.faltaron && <span className="block">Faltaron: {desglose.faltaron}</span>}
            {desglose.aparecieron && <span className="block">Aparecieron: {desglose.aparecieron}</span>}
          </>
        )}
        {movidas > 0 && <span className="block">Además, {n(movidas)} movidas entre piso y almacén (no cambian el total).</span>}
      </TarjetaCifra>
    </div>
    </>
  );
}

/** Las dos caras de los ajustes, cada una con su palabra: «−35 faltaron  +87 aparecieron». Lo que faltó va en rojo (hay
 *  que mirarlo, como el punto rojo de su fila); lo que apareció, en tinta: no es alarma, pero tampoco es una entrada. Una
 *  cara en cero se apaga y no se esconde: «0 faltaron» también es una respuesta. `corta`: la columna angosta de la franja
 *  del celular (~100 px): las dos cifras se apilan, más chicas y cada una con su palabra —sin ella, «−3 +7» no dice qué es
 *  cada cosa—. */
function CarasAjustes({ faltaron, aparecieron, corta = false }: { faltaron: number; aparecieron: number; corta?: boolean }) {
  const n = (v: number) => v.toLocaleString("es-PE");
  const palabra = corta ? "font-sans text-[11px] text-taupe" : "font-sans text-sm text-tinta/55";
  return (
    <span className={corta ? "flex flex-col text-lg leading-snug" : "flex flex-wrap items-baseline gap-x-4"}>
      <span className="whitespace-nowrap">
        <span className={faltaron > 0 ? "text-rojo" : "text-tinta/40"}>{faltaron > 0 ? `−${n(faltaron)}` : "0"}</span>
        <span className={palabra}> faltaron</span>
      </span>
      <span className="whitespace-nowrap">
        <span className={aparecieron > 0 ? "text-tinta" : "text-tinta/40"}>{aparecieron > 0 ? `+${n(aparecieron)}` : "0"}</span>
        <span className={palabra}> aparecieron</span>
      </span>
    </span>
  );
}

function CifraCorta({ etiqueta, valor, tono, href, activa }: { etiqueta: string; valor: ReactNode; tono?: string; href: string; activa: boolean }) {
  return (
    <div className="min-w-0">
      <Link
        href={href}
        aria-current={activa ? "true" : undefined}
        className={`-mx-1.5 block rounded-lg px-1.5 py-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo ${activa ? "bg-hueso" : "hover:bg-hueso/60"}`}
      >
        <dt className="text-[11px] text-taupe">{etiqueta}</dt>
        <dd className={`font-display text-2xl leading-tight tabular-nums ${tono ?? "text-tinta"}`}>{valor}</dd>
      </Link>
    </div>
  );
}

/** La misma pantalla con otro tipo (o sin tipo): sin el proceso, la página ni el detalle abierto — como la píldora. */
function hrefConTipo(params: ParamsMovimientos, cat: CategoriaMovimiento | null): string {
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
