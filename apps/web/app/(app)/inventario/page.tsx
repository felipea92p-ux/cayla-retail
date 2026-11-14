import { cookies } from "next/headers";
import { after } from "next/server";
import type { ComponentProps } from "react";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { crearMedidor, lineaDeTramos, tamanoJson } from "@/lib/medir-tramos";
import { planDelPanel } from "@/lib/existencias-plan-panel";
import { getUbicaciones } from "@/lib/ubicaciones";
import { destinosParaEnviar } from "@/lib/para-enviar-reglas";
import { sedesParaPedir } from "@/lib/pedidos-entre-sedes-reglas";
import { getExistencias, getFilaSinStockDeVariante, resumirExistencias, getPrendasDanadasPendientes, getLugarDeDanadas } from "@/lib/inventario-v2";
import { getSububicaciones, encontrarPorTipo } from "@/lib/sububicaciones";
import { getTrasladosEnCurso } from "@/lib/traslados";
import { getFilasSemanaDeSede } from "@/lib/resumen-inventario";
import { getRitmoRecientePorVariante } from "@/lib/existencias-ritmo-servidor";
import { ritmoDelPanel } from "@/lib/existencias-ritmo-panel";
import { deltaDisponibleSede } from "@/lib/existencias-categorias";
import { leerPlanDelPiso } from "@/lib/piso-plan-servidor";
import { politicaDe } from "@/lib/politica-operativa-inventario";
import { getApartadosAbiertos } from "@/lib/apartados";
import { contarPorRegularizar } from "@/lib/por-regularizar-cuenta";
import { getCapacidadPiso } from "@/lib/capacidad-piso-servidor";
import { cifraColgadasEnElPiso } from "@/lib/capacidad-piso";
import { getCatalogoParaExistencias, getColoresParaExistencias } from "@/lib/existencias-catalogo";
import { getEmpresasAqui } from "@/lib/empresas-de-sede";
import { soloLasDeAqui } from "@/lib/empresas-de-sede-reglas";
import { getEtapasOcultas } from "@/lib/etapa-prenda";
import { sinLasEnProduccion } from "@/lib/etapa-prenda-reglas";
import { getStockPorDueno } from "@/lib/stock-por-dueno";
import { getValorInventario } from "@/lib/valor-inventario";
import { armarVistaValor } from "@/lib/valor-inventario-reglas";
import { conDuenos } from "@/lib/stock-por-dueno-reglas";
import { conDescripcion, conEstadoProducto, conFamiliaDeColor, conMarca, productosSinStockEnSede } from "@/lib/existencias-catalogo-reglas";
import { estaAtrasado } from "@/lib/traslados-reglas";
import { COOKIE_PANEL_FILTROS_EXISTENCIAS, leerPanelFiltros } from "@/lib/panel-filtros";
import { InventarioPanel } from "@/components/InventarioPanel";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BotonAjustarStock } from "@/components/existencias/BotonAjustarStock";
import { CifrasExistencias } from "@/components/existencias/CifrasExistencias";
import { ValorInventarioExistencias } from "@/components/existencias/ValorInventarioExistencias";
import { pideAjustar, vueltaAEditar } from "@/lib/existencias-ajustar-desde-editar";
import { pideSepararDanada } from "@/lib/danadas-lugar";
import { contarDanadasViejas } from "@/lib/danadas-arreglo";
import { desdeDeParams } from "@/lib/vuelta-productos";

// Fase UI 2 (2026-09-14): piso de venta vs. almacén de tienda
// (20260914210000_inventario_piso_almacen.sql). Sigue siendo UNA tabla
// `stock` — la separación es una columna más (`sububicacion_id`), no dos
// tablas como en V1 — pero ahora una ubicación puede tener más de una fila
// por variante, así que la pantalla necesita saber agregar antes de
// mostrar. Esa agregación vive en `getStockPorUbicacion`, no acá.
//
// Existencias (2026-09-16, diseño de Felipe): a cada prenda se le suma lo que
// viene en camino hacia acá y lo que hay en las otras sedes
// (`getExistencias`), y arriba tres cifras: cuánto hay, cuántas prendas
// piden algo, cuánto está por llegar. Esta página sigue siendo solo "traer
// los datos y elegir el layout".
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ubicacion?: string; danados?: string; danada?: string; variante?: string; ajustar?: string; de?: string; desde?: string }>;
}) {
  // Cada lectura se mide (2026-11-13, `lib/medir-tramos.ts`): al terminar la respuesta, UNA línea `existencias_tramos` en el registro del
  // servidor dice cuánto tardó cada una, cuándo estuvo la lista y cuánto pesa lo que viaja. Se busca con `vercel logs --query existencias_tramos`.
  // `medir` devuelve la misma lectura: no cambia qué responde ni si falla.
  const { medir, marcar, todas, foto } = crearMedidor();
  const persona = await medir("persona", exigirModulo("existencias")); // ADR-0161: URL directa sin el módulo en su rol → «Sin acceso»
  // `danados=1`: llegar desde el aviso de cuarentena de Devoluciones abre la cola de dañadas (ADR-0232).
  // `variante=<id>`: llegar desde un movimiento («Ver en Existencias», ADR-0241) abre el detalle de ESA prenda en esa talla.
  // `ajustar=1&de=<producto>`: llegar desde el candado de Editar producto (ADR-0494, actividad 3) abre la planilla de «Ajustar stock» en esa talla y
  // ofrece «Volver a Editar producto» (`lib/existencias-ajustar-desde-editar.ts`).
  const { ubicacion: ubicacionQuery, danados, danada, variante, ajustar, de, desde } = await searchParams;
  const ubicaciones = await medir("ubicaciones", getUbicaciones());

  const ubicacionActivaId =
    persona.rol === "lider" && ubicacionQuery && ubicaciones.some((u) => u.id === ubicacionQuery)
      ? ubicacionQuery
      : persona.ubicacionId;
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId);

  // «Acción hoy»/Cobertura piso solo tienen sentido donde se vende: una tienda.
  const vende = ubicacionActiva?.tipo === "tienda";
  // Cuántas prendas caben colgadas en el piso (ADR-0329, m² × prendas por m²): la nota «de 600» de «Colgadas en el piso». Solo una
  // tienda tiene piso de venta. Corre en paralelo con lo de abajo y nunca lanza: si no responde, la cifra sale sin nota.
  const capacidadPiso = vende ? medir("capacidad", getCapacidadPiso(ubicacionActivaId)) : Promise.resolve(null);
  // Ventas sin registrar (ADR-0330: viven en Existencias, en /inventario/por-regularizar, bajo este mismo módulo): «Para hoy» cuenta
  // las de ESTA sede y su botón abre la lista de esa misma sede, así la cifra y la lista dicen lo mismo. Solo en una tienda: nacen en
  // Vender.
  // D-54 (ADR-0159): sin el toggle «Con datos de prueba» que sí tienen Caja/Ventas, Existencias
  // pide siempre el default de la función (apagado) — los productos archivados como dato de
  // prueba, nunca borrados, quedan afuera.
  const existencias = medir("existencias", getExistencias(ubicacionActivaId, ubicaciones));
  // Qué empresas operan aquí (ADR-0505): «en el catálogo, sin stock aquí» no ofrece en Trujillo una prenda de CLAURE. Sin respuesta, todas.
  const empresasDeAqui = medir("empresas", getEmpresasAqui(ubicacionActivaId)).catch(() => null);
  // Lo que depende de otra lectura arranca apenas esa responde, no cuando terminan TODAS (2026-11-13, `docs/innovacion/2026-11-13-cambiar-de-modulo.md`).
  // Las dos de abajo nunca lanzan: si no responden, su dato queda vacío y la pantalla lo dice, como antes.
  // Ritmo reciente / Cobertura piso (2026-09-25): sobre el ledger único (`fn_ledger_puntos`), no sobre `fn_resumen_variantes`. Desde el
  // 2026-11-13 (`lib/existencias-ritmo-panel.ts`) la lista NO lo espera: arranca cuando llegan las prendas y en producción tardaba 0,9–1,5 s
  // más (`existencias_tramos`, TRU), todo en el camino de la lista. Viaja como promesa al panel, igual que el plan; mientras llega, sus dos
  // columnas y «¿Cómo se vende?» dicen «calculando». Si las prendas fallan, la pantalla cae entera y nadie lee esta promesa: el `catch`
  // evita un rechazo suelto.
  const ritmoParaPanel = vende
    ? existencias
        .then((filas) => medir("ritmo", getRitmoRecientePorVariante(ubicacionActivaId, filas.map((f) => f.varianteId))))
        .then((r) => ritmoDelPanel(r.datos))
        .catch(() => null)
    : null;
  // De quién son las unidades de cada talla (ADR-0542): solo donde conviven dos empresas (Lima). Dato secundario: si la base no responde,
  // las tallas quedan sin la línea «De quién es» y nada más cambia.
  const repartoPendiente = empresasDeAqui.then((empresas) => medir("reparto", getStockPorDueno(ubicacionActivaId, empresas)));
  const etapasPendientes = medir("etapas", getEtapasOcultas()).catch(() => null);
  // «Hoy» de cada talla: el motor del piso (ADR-0328 act. 7) sobre UNA lectura (`fn_piso_plan_lectura`): lo libre en piso y almacén, lo
  // vendido ayer y en 14 días (escaneado y anotado a mano) y las tallas centrales. Solo donde se vende. Si no responde, `null`: «Hoy» dice
  // N/D y la pantalla lo avisa; el resto sigue en pie.
  // Existencias en dos tiempos (2026-11-13, `lib/existencias-plan-panel.ts`): es la lectura más lenta (0,77 s de media en producción) y ya
  // NO se espera para dibujar. La página le pasa al panel la PROMESA del plan, recortado a las tallas de la sede; la lista se dibuja con lo
  // demás y lo que depende del plan dice «calculando» hasta que llega.
  const planDelPiso = vende ? medir("plan", leerPlanDelPiso(ubicacionActivaId)) : null;
  // Si las prendas fallan, la pantalla entera cae (como antes) y esta promesa no la lee nadie: el `catch` evita un rechazo suelto.
  const planParaPanel = planDelPiso ? Promise.all([planDelPiso, existencias]).then(([plan, filas]) => planDelPanel(plan, filas)).catch(() => null) : null;
  // «Ver el valor a costo» (ADR-0557): solo se pregunta si la cuenta puede pasar la puerta (líder, o quien ve el dinero de Compras); la
  // base la repite y sin permiso devuelve cero filas. Dato secundario: si falla, sin el enlace. Arranca con las demás: hasta el 2026-11-13
  // empezaba recién cuando todas habían respondido y era el último tramo de la página, en fila (lo mostró `existencias_tramos`).
  const valorPendiente = persona.rol === "lider" || puede(persona, "verDineroCompras") ? medir("valor", getValorInventario()) : Promise.resolve(null);
  const [stockBase, sububicaciones, traslados, danadosPendientes, apartados, semana, catalogo, colores, colaSinRegistrar, empresasAqui, lugarDanadas, repartoDeStock, etapasOcultas] = await Promise.all([
    existencias,
    medir("sububicaciones", getSububicaciones(ubicacionActivaId)),
    medir("traslados", getTrasladosEnCurso(ubicacionActivaId)),
    medir("danadas", getPrendasDanadasPendientes(ubicacionActivaId)),
    // Reservas para clientas (ADR-0141): solo donde se vende. Taller no aparta.
    // Una terminal libera cualquier apartado (Felipe, 2026-09-22, ADR-0162): `persona.terminal` lo dice.
    vende ? medir("apartados", getApartadosAbiertos(ubicacionActivaId, { esTerminal: persona.terminal })) : Promise.resolve([]),
    // Rediseño 2026-09-22: costo/precio/categoría y el delta de 7 días para «Disponible total» y el
    // overlay de categorías — sin cambios (2026-09-25): sigue siendo un dato de 7 días aparte del
    // Ritmo reciente, que ahora vive en `existencias-ritmo.ts`.
    // Dato SECUNDARIO (tarea #8 del análisis): solo alimenta el «% vs. semana anterior» y el desglose de «Disponible
    // total». Si su función no responde, Existencias sigue en pie y la tarjeta lo dice; antes se caía la pantalla entera.
    // Rediseño 2026-10-04: la cifra de 7 días solo se pinta donde no se separa piso y almacén (la cabecera del Taller); en una
    // tienda se pedía y no se mostraba en ningún lado.
    (vende ? Promise.resolve([] as Awaited<ReturnType<typeof getFilasSemanaDeSede>>) : medir("semana", getFilasSemanaDeSede(ubicacionActivaId))).then(
      (filas) => ({ filas, fallo: false }),
      (error: unknown) => {
        console.error("Existencias: no se pudo leer la comparación de 7 días", error);
        return { filas: [] as Awaited<ReturnType<typeof getFilasSemanaDeSede>>, fallo: true };
      }
    ),
    // Existencias no pide `getFilasRecientesDeSede` (`fn_resumen_variantes`, 30 días): «Hoy» lo decide el motor del piso con su
    // propia lectura (abajo). Esa función sigue viva para Producción («Nueva orden», ADR-0133 F5).
    // La marca de cada prenda y qué productos del catálogo esta sede no tiene (2026-09-26): para buscar y filtrar por marca y
    // para decir «existe, pero aquí no lo han recibido» en vez de callar. Dato secundario: si falla, sin marca y con aviso.
    medir("catalogo", getCatalogoParaExistencias()),
    // La familia de cada color, para el filtro «Color» agrupado por familia (2026-10-03). Secundario: si falla, lista plana.
    medir("colores", getColoresParaExistencias()),
    // Secundario: `null` si la cola no respondió. «Para hoy» lo dice («no se pudo leer») en vez de callar o dibujar un 0.
    vende ? medir("por_regularizar", contarPorRegularizar(ubicacionActivaId)).catch(() => null) : Promise.resolve(null),
    empresasDeAqui,
    // Dónde deja esta tienda las prendas dañadas (ADR-0564). Nunca lanza: sin dato, la pantalla sigue como antes.
    medir("lugar_danadas", getLugarDeDanadas(ubicacionActivaId)),
    repartoPendiente,
    etapasPendientes,
  ]);
  const sinRegistrar = vende ? (colaSinRegistrar ?? "fallo") : null;

  // Política operativa de Inventario (Felipe, 2026-09-25): las jornadas mínimas del Ritmo reciente. Lo que el piso pide hoy ya
  // no sale de aquí: lo decide el motor del piso (`plan`).
  const politica = politicaDe(ubicacionActivaId);

  // La decisión de cada talla (por colgar · sin stock atrás · mantener) es la del motor del piso: la misma que lee el Inicio. Desde el
  // 2026-11-13 la pone el panel cuando el plan llega (`aplicarPlan`): aquí las filas salen sin decisión. Sin plan (no respondió), ninguna
  // fila la trae y «Hoy» dice N/D: nunca un «Mantener» que no sabe.

  // Ritmo reciente/Cobertura piso son dato SECUNDARIO de sus propias columnas y ya no viajan aquí: llegan
  // después por su promesa (`ritmoParaPanel`) y el panel los pone en cada fila. La marca (2026-09-26) se suma
  // encima: si el catálogo no respondió, cada fila queda sin marca y el panel lo avisa.
  // La familia de cada color (2026-10-03) va igual: sin ella, el filtro de color queda como lista plana.
  // La descripción (2026-10-06) sale de la misma lectura: sin ella, el panel de la talla no dibuja nada bajo el nombre.
  const stock = conDuenos(
    conFamiliaDeColor(
      conDescripcion(
        conEstadoProducto(
          conMarca(
            stockBase,
            catalogo.productos
          ),
          catalogo.productos
        ),
        catalogo.productos
      ),
      colores
    ),
    repartoDeStock
  );
  // El candado de Editar producto (`?variante=&ajustar=1`) apunta a una talla que esta sede quizá nunca movió: sin fila de `stock` no está en
  // la lista y no abría nada. Se arma su fila en cero para abrir «Ajustar stock» directo en ella. Solo en SU sede y con «Ajustar stock».
  const filaSinStock =
    pideAjustar(ajustar) && variante && ubicacionActivaId === persona.ubicacionId && puede(persona, "ajustarStock") && !stockBase.some((f) => f.varianteId === variante)
      ? await medir("fila_sin_stock", getFilaSinStockDeVariante(variante, vende)).catch(() => null)
      : null;
  // Lo que todavía es una orden no aparece como «sin stock aquí»: aún no es una prenda (ADR-0614, actividad 14). Lo terminado sí.
  const sinStock = productosSinStockEnSede(sinLasEnProduccion(soloLasDeAqui(catalogo.productos, empresasAqui), etapasOcultas), stockBase);
  // Lo que pide cada talla («Hoy») lo cuenta el panel con `hoyDeTalla`, la misma regla de la tabla, el filtro y «Para hoy»; el resumen
  // solo suma cantidades. Hasta el 2026-10-04 también contaba las tallas que piden reponer para una tarjeta que ya no existe.
  const resumen = resumirExistencias(stock);
  const sububicacionPiso = encontrarPorTipo(sububicaciones, "piso_venta");
  const sububicacionAlmacen = encontrarPorTipo(sububicaciones, "almacen_tienda");

  // «Bajar al piso» (ADR-0208): la única entrada a /inventario/bajar (Felipe, 2026-09-25; el lateral no cambia). Solo si
  // su rol ve «Bajada al piso» y si lo que se mira es SU sede activa y separa piso y almacén: esa pantalla baja siempre en
  // la sede activa, y en otra (o en el Taller) no tendría nada que bajar.
  const enSuSede = ubicacionActivaId === persona.ubicacionId;
  const puedeBajarAlPiso = veModulo(persona, "existencias") && enSuSede && sububicacionPiso !== null && sububicacionAlmacen !== null;
  // «Cuadrar el piso» (ADR-0328, actividad 3): la entrada a /inventario/cuadrar. Es una función de Existencias (ADR-0306), así que la
  // ve quien ve Existencias —la cuenta Almacén, que escanea con la pistola—, en su sede activa cuando separa piso y almacén (esa
  // pantalla cuadra siempre la sede activa). Confirmar es solo de un líder: allí el botón se apaga y dice quién sí puede, y la base
  // lo vuelve a preguntar (`fn_es_lider()` en cuadrar_piso).

  // Lo que viene HACIA esta ubicación, para la tarjeta «En camino»: cuántos
  // traslados, cuándo llega el próximo y si alguno ya debería haber llegado.
  // Solo lo que sigue en camino: un traslado `recibido_con_diferencia` ya llegó y espera a un líder (revisión 2026-10-04: «Para hoy»
  // decía «1 traslado en camino · el próximo llega el vie 3» de algo recibido días antes). Mismo criterio que la cifra de la cabecera.
  const haciaAca = traslados.filter((t) => t.ubicacionDestinoId === ubicacionActivaId && t.estado === "en_transito");
  const proximaLlegada = haciaAca.map((t) => t.fechaEstimadaLlegada).filter((f): f is string => !!f).sort()[0] ?? null;
  const enCamino = {
    traslados: haciaAca.length,
    proximaLlegada,
    // Solo lo que sigue en camino y ya debió llegar: un traslado con diferencia ya llegó (lo que espera es la
    // revisión de un líder) y no está «atrasado». Mismo criterio que la pantalla Traslados.
    atrasados: haciaAca.filter((t) => t.fechaEstimadaLlegada && estaAtrasado(t.fechaEstimadaLlegada, t.estado)).length,
  };

  // La foto es del momento en que se cargó: la app no sincroniza en segundo
  // plano, y decir «actualizado hace 2 min» prometería algo que no pasa.
  const horaCarga = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });

  // Si el panel de filtros entra abierto o cerrado en la computadora: lo que este equipo dejó la última vez (cookie propia de
  // Existencias, la lee el servidor para que la primera pintura no salte).
  // Existencias nace con el panel cerrado (rediseño 2026-10-04): la primera pantalla es el buscador y «Para hoy», y el panel de
  // seis píldoras abierto empujaba las prendas bajo el pliegue. Lo que este equipo dejó guardado manda.
  const panelFiltros = leerPanelFiltros((await cookies()).get(COOKIE_PANEL_FILTROS_EXISTENCIAS)?.value, "cerrado");

  const filasSemana = semana.filas;
  const deltaSede = deltaDisponibleSede(filasSemana);

  // Las cifras de la cabecera (rediseño 2026-10-04, decisión de Felipe en la ronda 2: el número grande son las colgadas, y
  // cuando exista la capacidad de cada sede, «de las que caben»). Colgadas y guardadas LIBRES (sin apartadas ni dañadas): la
  // caja cobra solo las colgadas, y «795 uds» sin partir hacía creer que había 795 para vender. Mismo recuadro que Ventas,
  // Cambios y Devoluciones (`ResumenSede`): Inventario usa la cabecera de Ventas (ADR-0220).
  const separa = resumen.separaPisoAlmacen;
  const guardadas = stock.reduce((n, f) => n + (f.almacenDisponible ?? 0), 0);
  const veTraslados = veModulo(persona, "traslados");
  const notaSemana = semana.fallo || deltaSede.pct === null ? undefined : `${deltaSede.pct >= 0 ? "+" : ""}${Math.round(deltaSede.pct)} % en 7 días`;
  // «583 de 600» (ADR-0328: el número grande son las colgadas contra lo que cabe), con «· por cuadrar» mientras la sede no haya
  // cuadrado su piso (la fecha viaja en la misma lectura). Solo en «Colgadas en el piso», que solo existe donde la sede separa piso y
  // almacén; una tienda sin m² no lleva nota.
  const capacidad = await capacidadPiso;
  // La capacidad cuenta solo ropa colgada (ADR-0329, accesorios fuera del riel): esta tarjeta cuenta lo mismo, la ropa libre en el
  // piso, y dice aparte «+ 17 accesorios», para que «583 de 600» compare lo mismo. Las dos suman lo que cobra la caja (ADR-0331).
  // Solo esta tarjeta: «Para hoy» e Inicio siguen contando lo que contaban.
  // Desde el 2026-10-12 (ADR-0391) «Colgadas» y «Guardadas» FILTRAN la lista de un toque (`CifrasExistencias`, un componente de
  // cliente: `ResumenSede` solo filtra desde uno); reemplazan al selector «Piso · Almacén · Ambos» de las tarjetas.
  const colgadas = separa ? cifraColgadasEnElPiso({ filas: stock, productos: catalogo.productos, catalogoFallo: catalogo.fallo !== null, capacidad }) : null;
  // El piso nunca cuadrado (ADR-0328 d.5): lo dice el plan (`enPausa`), que desde el 2026-11-13 llega después que la lista. Para que el
  // aviso no aparezca de golpe sobre las prendas ya dibujadas (ADR-0185), lo adelanta la capacidad, que llega con la lista y lee la MISMA
  // fecha del último cuadre (`cuadrado_en`, ADR-0329). Cuando el plan llega, manda el plan (`InventarioPanel`). Una tienda sin m² no
  // tiene capacidad: ahí el aviso espera al plan, como antes.
  const pisoSinCuadrarAntes = vende && separa && capacidad !== null && capacidad.cuadradoEn === null;

  const vistaValor = armarVistaValor(await valorPendiente, ubicacionActivaId);

  // Las props del panel en un objeto: además de pasarlas, se mide cuánto pesan (lo que viaja al navegador), en la línea del registro.
  const propsPanel = {
    ubicacionId: ubicacionActivaId,
    stock,
    resumen,
    enCamino,
    sububicaciones,
    sububicacionPiso,
    sububicacionAlmacen,
    danadosPendientes,
    lugarDanadas,
    // Las que llevan 7 días o más separadas sin que nadie las saque a arreglar ni decida: «Para hoy» sube la fila a rojo (ADR-0564).
    danadasViejas: contarDanadasViejas(danadosPendientes),
    abrirDanados: danados === "1",
    // `?danada=1`: el botón «Separé una dañada» de las cuentas de caja y de almacén (ADR-0564) abre el buscador de la prenda dañada.
    abrirSepararDanada: pideSepararDanada(danada),
    abrirVariante: variante ?? null,
    abrirAjustar: pideAjustar(ajustar),
    abrirSinFila: filaSinStock,
    volverAEditar: vueltaAEditar(de, desdeDeParams(desde)),
    apartados,
    editaCatalogo: puede(persona, "editarCatalogo"),
    puedeAjustar: puede(persona, "ajustarStock"),
    sedeNombre: ubicacionActiva?.nombre ?? "esta sede",
    sinStock,
    marcaFallo: catalogo.fallo,
    verProductos: veModulo(persona, "productos"),
    politica,
    veTraslados,
    puedeBajarAlPiso,
    veApartados: veModulo(persona, "apartados"),
    esTienda: vende,
    panelFiltros,
    coloresCatalogo: colores,
    sinRegistrar,
    pisoSinCuadrarAntes,
    // ADR-0328 act. 17: «Subir prenda» puede dejarla «para enviar» a otra sede; solo quien ve Traslados arma ese envío.
    destinosParaEnviar: veTraslados ? destinosParaEnviar(ubicaciones, ubicacionActivaId) : [],
    // «Pedir a otra sede» del panel de la talla: las OTRAS tiendas activas (la base rechaza pedirle al Taller).
    sedesParaPedir: sedesParaPedir(ubicaciones, ubicacionActivaId),
  } satisfies Omit<ComponentProps<typeof InventarioPanel>, "plan" | "ritmo">;

  // La lista ya puede dibujarse: lo que falta (el plan y el ritmo) llega por su promesa. Al terminar la respuesta —con el plan ya enviado—, la
  // línea del registro. `after` no suma nada a lo que espera la persona; si algo falla aquí, solo se pierde la línea.
  marcar("lista");
  after(async () => {
    try {
      await todas();
      const plan = planParaPanel ? await planParaPanel : null;
      const ritmo = ritmoParaPanel ? await ritmoParaPanel : null;
      console.info(
        JSON.stringify(
          lineaDeTramos("existencias_tramos", {
            sedeId: ubicacionActivaId,
            ...foto(),
            bytes: { panel: tamanoJson(propsPanel), plan: planParaPanel ? tamanoJson(plan) : null, ritmo: ritmoParaPanel ? tamanoJson(ritmo) : null },
          })
        )
      );
    } catch {
      // Medir nunca rompe la pantalla.
    }
  });

  return (
    <div className="space-y-5">
      {/* Sin selector de sede propio ni interruptor de «datos de prueba» a propósito (Felipe,
          2026-09-22): el selector global de la barra superior ya cambia toda la app, y uno
          segundo acá desacomodaba el layout al abrirse; el de «datos de prueba» se quitó del
          todo (render, estado y lectura de `?prueba=`), no solo se ocultó. */}
      <EncabezadoPagina
        sede={ubicacionActiva?.nombre ?? "—"}
        titulo="Existencias"
        subtitulo={separa ? "Lo que hay colgado y guardado en la tienda, y lo que toca hacer hoy." : "Lo que hay en esta sede y lo que viene en camino."}
        // La única hora de la cabecera es la de la foto (ADR-0220): el stock de abajo es el del momento en que se
        // cargó, y un reloj vivo encima haría creer que está al minuto.
        sinHora
        detalle={`vista de las ${horaCarga}`}
        // Como la maqueta (Felipe, 2026-10-05: «me da más herramientas, en la maqueta no»): la cabecera no lleva fila de botones. Colgar
        // se hace en cada tarjeta, «Cuadrar el piso» y lo demás pendiente están en «Pendientes», y Recibir, Contar, Trasladar y
        // Apartados siguen en el menú lateral. `/inventario/bajar` conserva su ruta, sin botón en esta pantalla. La única excepción es
        // «Ajustar stock» (ADR-0494, Felipe 2026-10-23): el stock se carga aquí y no en Catálogo, y lo que no se ve no se usa.
        acciones={<BotonAjustarStock ubicacionId={ubicacionActivaId} puedeAjustar={puede(persona, "ajustarStock")} />}
      >
        <CifrasExistencias
          sede={ubicacionActiva?.nombre ?? "esta sede"}
          separa={separa}
          colgadas={colgadas}
          guardadas={separa ? guardadas : null}
          disponibles={separa ? null : { valor: resumen.disponible, nota: notaSemana }}
          enCamino={resumen.enTransito > 0 ? { valor: resumen.enTransito, href: veTraslados ? "/inventario/traslados" : undefined } : null}
        />
      </EncabezadoPagina>

      {/* La llave lleva un prefijo: `InventarioPanel`, su hermano, ya usa el id de la sede, y dos hermanos no pueden repetirla. */}
      {vistaValor && <ValorInventarioExistencias key={`valor-${ubicacionActivaId}`} vista={vistaValor} puedeEditarCatalogo={puede(persona, "editarCatalogo")} veComprobacion={veModulo(persona, "reportes_financieros")} />}

      {/* `key` por sede: cambiar de sede (selector de arriba o `?ubicacion=`) es un `router.refresh`, no una
          pantalla nueva, y sin la llave el panel conservaba sus filtros. Un filtro de TRU («Por colgar»,
          «Dañado», una talla) aplicado al Taller dejaba la tabla vacía, sin control visible que lo explicara.
          `plan` y `ritmo`: las promesas del plan del piso y del Ritmo reciente (Existencias en dos tiempos); `null` donde no se piden (el Taller). */}
      <InventarioPanel key={ubicacionActivaId} {...propsPanel} plan={planParaPanel} ritmo={ritmoParaPanel} />
    </div>
  );
}
