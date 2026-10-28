import { cookies } from "next/headers";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { destinosParaEnviar } from "@/lib/para-enviar-reglas";
import { sedesParaPedir } from "@/lib/pedidos-entre-sedes-reglas";
import { getExistencias, getFilaSinStockDeVariante, resumirExistencias, getPrendasDanadasPendientes } from "@/lib/inventario-v2";
import { getSububicaciones, encontrarPorTipo } from "@/lib/sububicaciones";
import { getTrasladosEnCurso } from "@/lib/traslados";
import { getFilasSemanaDeSede } from "@/lib/resumen-inventario";
import { getRitmoRecientePorVariante } from "@/lib/existencias-ritmo-servidor";
import { deltaDisponibleSede } from "@/lib/existencias-categorias";
import type { PisoDeTalla } from "@/lib/piso-plan";
import { leerPlanDelPiso } from "@/lib/piso-plan-servidor";
import { politicaDe } from "@/lib/politica-operativa-inventario";
import { getApartadosAbiertos } from "@/lib/apartados";
import { contarPorRegularizar } from "@/lib/por-regularizar-cuenta";
import { getCapacidadPiso } from "@/lib/capacidad-piso-servidor";
import { cifraColgadasEnElPiso } from "@/lib/capacidad-piso";
import { getCatalogoParaExistencias, getColoresParaExistencias } from "@/lib/existencias-catalogo";
import { getEmpresasAqui } from "@/lib/empresas-de-sede";
import { soloLasDeAqui } from "@/lib/empresas-de-sede-reglas";
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
  searchParams: Promise<{ ubicacion?: string; danados?: string; variante?: string; ajustar?: string; de?: string; desde?: string }>;
}) {
  const persona = await exigirModulo("existencias"); // ADR-0161: URL directa sin el módulo en su rol → «Sin acceso»
  // `danados=1`: llegar desde el aviso de cuarentena de Devoluciones abre la cola de dañadas (ADR-0232).
  // `variante=<id>`: llegar desde un movimiento («Ver en Existencias», ADR-0241) abre el detalle de ESA prenda en esa talla.
  // `ajustar=1&de=<producto>`: llegar desde el candado de Editar producto (ADR-0494, actividad 3) abre la planilla de «Ajustar stock» en esa talla y
  // ofrece «Volver a Editar producto» (`lib/existencias-ajustar-desde-editar.ts`).
  const { ubicacion: ubicacionQuery, danados, variante, ajustar, de, desde } = await searchParams;
  const ubicaciones = await getUbicaciones();

  const ubicacionActivaId =
    persona.rol === "lider" && ubicacionQuery && ubicaciones.some((u) => u.id === ubicacionQuery)
      ? ubicacionQuery
      : persona.ubicacionId;
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId);

  // «Acción hoy»/Cobertura piso solo tienen sentido donde se vende: una tienda.
  const vende = ubicacionActiva?.tipo === "tienda";
  // Cuántas prendas caben colgadas en el piso (ADR-0329, m² × prendas por m²): la nota «de 600» de «Colgadas en el piso». Solo una
  // tienda tiene piso de venta. Corre en paralelo con lo de abajo y nunca lanza: si no responde, la cifra sale sin nota.
  const capacidadPiso = vende ? getCapacidadPiso(ubicacionActivaId) : Promise.resolve(null);
  // Ventas sin registrar (ADR-0330: viven en Existencias, en /inventario/por-regularizar, bajo este mismo módulo): «Para hoy» cuenta
  // las de ESTA sede y su botón abre la lista de esa misma sede, así la cifra y la lista dicen lo mismo. Solo en una tienda: nacen en
  // Vender.
  const [stockBase, sububicaciones, traslados, danadosPendientes, apartados, semana, catalogo, colores, colaSinRegistrar, plan, empresasAqui] = await Promise.all([
    // D-54 (ADR-0159): sin el toggle «Con datos de prueba» que sí tienen Caja/Ventas, Existencias
    // pide siempre el default de la función (apagado) — los productos archivados como dato de
    // prueba, nunca borrados, quedan afuera.
    getExistencias(ubicacionActivaId, ubicaciones),
    getSububicaciones(ubicacionActivaId),
    getTrasladosEnCurso(ubicacionActivaId),
    getPrendasDanadasPendientes(ubicacionActivaId),
    // Reservas para clientas (ADR-0141): solo donde se vende. Taller no aparta.
    // Una terminal libera cualquier apartado (Felipe, 2026-09-22, ADR-0162): `persona.terminal` lo dice.
    vende ? getApartadosAbiertos(ubicacionActivaId, { esTerminal: persona.terminal }) : Promise.resolve([]),
    // Rediseño 2026-09-22: costo/precio/categoría y el delta de 7 días para «Disponible total» y el
    // overlay de categorías — sin cambios (2026-09-25): sigue siendo un dato de 7 días aparte del
    // Ritmo reciente, que ahora vive en `existencias-ritmo.ts`.
    // Dato SECUNDARIO (tarea #8 del análisis): solo alimenta el «% vs. semana anterior» y el desglose de «Disponible
    // total». Si su función no responde, Existencias sigue en pie y la tarjeta lo dice; antes se caía la pantalla entera.
    // Rediseño 2026-10-04: la cifra de 7 días solo se pinta donde no se separa piso y almacén (la cabecera del Taller); en una
    // tienda se pedía y no se mostraba en ningún lado.
    (vende ? Promise.resolve([] as Awaited<ReturnType<typeof getFilasSemanaDeSede>>) : getFilasSemanaDeSede(ubicacionActivaId)).then(
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
    getCatalogoParaExistencias(),
    // La familia de cada color, para el filtro «Color» agrupado por familia (2026-10-03). Secundario: si falla, lista plana.
    getColoresParaExistencias(),
    // Secundario: `null` si la cola no respondió. «Para hoy» lo dice («no se pudo leer») en vez de callar o dibujar un 0.
    vende ? contarPorRegularizar(ubicacionActivaId).catch(() => null) : Promise.resolve(null),
    // «Hoy» de cada talla: el motor del piso (ADR-0328 act. 7) sobre UNA lectura (`fn_piso_plan_lectura`): lo libre en piso y
    // almacén, lo vendido ayer y en 14 días (escaneado y anotado a mano) y las tallas centrales. Solo donde se vende. Si no
    // responde, `null`: «Hoy» dice N/D y la pantalla lo avisa; el resto sigue en pie.
    vende ? leerPlanDelPiso(ubicacionActivaId) : Promise.resolve(null),
    // Qué empresas operan aquí (ADR-0505): «en el catálogo, sin stock aquí» no ofrece en Trujillo una prenda de CLAURE. Sin respuesta, todas.
    getEmpresasAqui(ubicacionActivaId).catch(() => null),
  ]);
  const sinRegistrar = vende ? (colaSinRegistrar ?? "fallo") : null;
  // De quién son las unidades de cada talla (ADR-0542): solo donde conviven dos empresas (Lima). Corre en paralelo con el ritmo de abajo;
  // dato secundario: si la base no responde, las tallas quedan sin la línea «De quién es» y nada más cambia.
  const repartoDeStock = getStockPorDueno(ubicacionActivaId, empresasAqui);
  // «Ver el valor a costo» (ADR-0557): solo se pregunta si la cuenta puede pasar la puerta (líder, o quien ve el dinero de Compras); la
  // base la repite y sin permiso devuelve cero filas. Corre en paralelo con el ritmo de abajo; dato secundario: si falla, sin el enlace.
  const valorPendiente = persona.rol === "lider" || puede(persona, "verDineroCompras") ? getValorInventario() : Promise.resolve(null);

  // Política operativa de Inventario (Felipe, 2026-09-25): las jornadas mínimas del Ritmo reciente. Lo que el piso pide hoy ya
  // no sale de aquí: lo decide el motor del piso (`plan`).
  const politica = politicaDe(ubicacionActivaId);

  // Ritmo reciente / Cobertura piso (2026-09-25): sobre el ledger único (`fn_ledger_puntos`), no
  // sobre `fn_resumen_variantes` — depende de conocer las variantes de esta sede primero.
  const varianteIds = stockBase.map((f) => f.varianteId);
  const pisoPorVariante = new Map(stockBase.map((f) => [f.varianteId, f.piso ?? 0]));
  const ritmoReciente = vende
    ? await getRitmoRecientePorVariante(ubicacionActivaId, varianteIds, pisoPorVariante)
    : { datos: null, fallo: null };

  // La decisión de cada talla (por colgar · sin stock atrás · mantener) es la del motor del piso: la misma que lee el
  // Inicio. Sin plan (la lectura no respondió), ninguna fila trae decisión y «Hoy» dice N/D: nunca un «Mantener» que no sabe.
  const planPiso: ReadonlyMap<string, PisoDeTalla> = plan?.porTalla ?? new Map();
  const planFallo = vende && plan === null ? "«Hoy» no se pudo calcular ahora: la columna dice N/D. Lo demás de esta pantalla sí está al día." : null;

  // Ritmo reciente/Cobertura piso son dato SECUNDARIO de sus propias columnas — ya no alimentan
  // Acción hoy: si su cálculo falla, esas dos columnas quedan en «N/D» y se avisa, pero la
  // decisión de reponer (que no depende de la RPC) sigue firme. La marca (2026-09-26) se suma
  // encima: si el catálogo no respondió, cada fila queda sin marca y el panel lo avisa.
  // La familia de cada color (2026-10-03) va igual: sin ella, el filtro de color queda como lista plana.
  // La descripción (2026-10-06) sale de la misma lectura: sin ella, el panel de la talla no dibuja nada bajo el nombre.
  const stock = conDuenos(
    conFamiliaDeColor(
      conDescripcion(
        conEstadoProducto(
          conMarca(
            stockBase.map((f) => ({
              ...f,
              ritmoReciente: ritmoReciente.datos?.ritmo.get(f.varianteId) ?? null,
              coberturaPiso: ritmoReciente.datos?.cobertura.get(f.varianteId) ?? null,
              planPiso: planPiso.get(f.varianteId) ?? null,
            })),
            catalogo.productos
          ),
          catalogo.productos
        ),
        catalogo.productos
      ),
      colores
    ),
    await repartoDeStock
  );
  // El candado de Editar producto (`?variante=&ajustar=1`) apunta a una talla que esta sede quizá nunca movió: sin fila de `stock` no está en
  // la lista y no abría nada. Se arma su fila en cero para abrir «Ajustar stock» directo en ella. Solo en SU sede y con «Ajustar stock».
  const filaSinStock =
    pideAjustar(ajustar) && variante && ubicacionActivaId === persona.ubicacionId && puede(persona, "ajustarStock") && !stockBase.some((f) => f.varianteId === variante)
      ? await getFilaSinStockDeVariante(variante, vende).catch(() => null)
      : null;
  const sinStock = productosSinStockEnSede(soloLasDeAqui(catalogo.productos, empresasAqui), stockBase);
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
  // El piso nunca cuadrado: el plan lo trae (`enPausa`, ADR-0328 d.5). Sin plan (la lectura falló) no se afirma nada: `planFallo` ya lo dice.
  const pisoSinCuadrar = vende && separa && plan?.enPausa === true;

  const vistaValor = armarVistaValor(await valorPendiente, ubicacionActivaId);

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
      {vistaValor && <ValorInventarioExistencias key={`valor-${ubicacionActivaId}`} vista={vistaValor} puedeEditarCatalogo={puede(persona, "editarCatalogo")} />}

      {/* `key` por sede: cambiar de sede (selector de arriba o `?ubicacion=`) es un `router.refresh`, no una
          pantalla nueva, y sin la llave el panel conservaba sus filtros. Un filtro de TRU («Por colgar»,
          «Dañado», una talla) aplicado al Taller dejaba la tabla vacía, sin control visible que lo explicara. */}
      <InventarioPanel
        key={ubicacionActivaId}
        ubicacionId={ubicacionActivaId}
        stock={stock}
        resumen={resumen}
        enCamino={enCamino}
        sububicaciones={sububicaciones}
        sububicacionPiso={sububicacionPiso}
        sububicacionAlmacen={sububicacionAlmacen}
        danadosPendientes={danadosPendientes}
        abrirDanados={danados === "1"}
        abrirVariante={variante ?? null}
        abrirAjustar={pideAjustar(ajustar)}
        abrirSinFila={filaSinStock}
        volverAEditar={vueltaAEditar(de, desdeDeParams(desde))}
        apartados={apartados}
        editaCatalogo={puede(persona, "editarCatalogo")}
        puedeAjustar={puede(persona, "ajustarStock")}
        coberturaFallo={ritmoReciente.fallo}
        planFallo={planFallo}
        // La lista del día del motor (lo vendido ayer primero): la tarjeta «Reponer a piso hoy» y el orden sin búsqueda la siguen,
        // igual que el Inicio de almacén. Sin plan, o con el piso en pausa, está vacía.
        listaDelDia={plan?.listaDelDia}
        sedeNombre={ubicacionActiva?.nombre ?? "esta sede"}
        sinStock={sinStock}
        marcaFallo={catalogo.fallo}
        verProductos={veModulo(persona, "productos")}
        politica={politica}
        veTraslados={veTraslados}
        puedeBajarAlPiso={puedeBajarAlPiso}
        veApartados={veModulo(persona, "apartados")}
        esTienda={vende}
        panelFiltros={panelFiltros}
        coloresCatalogo={colores}
        sinRegistrar={sinRegistrar}
        pisoSinCuadrar={pisoSinCuadrar}
        // ADR-0328 act. 17: «Subir prenda» puede dejarla «para enviar» a otra sede; solo quien ve Traslados arma ese envío.
        destinosParaEnviar={veTraslados ? destinosParaEnviar(ubicaciones, ubicacionActivaId) : []}
        // «Pedir a otra sede» del panel de la talla: las OTRAS tiendas activas (la base rechaza pedirle al Taller).
        sedesParaPedir={sedesParaPedir(ubicaciones, ubicacionActivaId)}
      />
    </div>
  );
}
