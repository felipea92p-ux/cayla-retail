import Link from "next/link";
import type { CSSProperties } from "react";
import { Download } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getMisPartesDeCompras } from "@/lib/compras-mi-parte";
import { MisPartesDeCompras } from "@/components/MisPartesDeCompras";
import { listarCompras, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, ETIQUETA_TIPO_DOCUMENTO, soles, type ParamsCompras } from "@/lib/compras";
import { getNotasPendientes, getResumenComprasExtra } from "@/lib/compras-indicadores";
import { celdaPago, celdaRecepcion, nombreDelMes, subEmision, vistaActiva, type VistaComprobantes } from "@/lib/comprobantes-lista-reglas";
import { diaMes, hoyLima, sumarDias } from "@/lib/fechas-lima";
import { idsConFaltanteCerrado } from "@/lib/nota-pendiente-reglas";
import { nombresDeDestinos } from "@/lib/reparto-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { Resaltado } from "@/components/ui/Resaltado";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { ChipNotaPendiente } from "@/components/ChipNotaPendiente";
import { Pestanas } from "@/components/ui/Pestanas";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { ComprobantesListaFilas } from "@/components/ComprobantesListaFilas";
import { ComprobantesListaVacia } from "@/components/ComprobantesListaVacia";

// Comprobantes de proveedores (ADR-0035, rediseño ADR-0111): la lista de lo que se compró. Cada
// fila dice los dos estados que importan —cuánto falta pagar y cuánto falta llegar— con su cifra
// debajo, no solo con un chip. Filtros, vistas y paginado viven en la URL y se resuelven en
// Postgres (`listar_compras`): la página nunca recibe más de 50 filas, haya 300 comprobantes o
// 3 millones.
//
// Las cuatro cifras de arriba deciden: qué se debe (y lo vencido), qué mercadería viene en camino
// (y cuánta ya debió llegar), cuánto se compró este mes frente al anterior, y el IGV de las
// facturas del mes — el crédito fiscal que se declara. Se fue «Registradas»: un conteo que no lleva
// a ninguna acción.
//
// Movimiento (2026-09-19, ADR-0136; prototipo `docs/maquetas/comprobantes-animaciones-2026-09`): la
// pantalla sigue siendo de servidor con su estado en la URL; lo que se mueve es CSS puro
// (app/estilos/comprobantes-lista.css) más tres piezas cliente mínimas. Al llegar, cabecera, tarjetas,
// pestañas, filtros y filas entran escalonadas (`anim-entra` con `--i`) y las cifras cuentan una vez
// (`CifraQueCuenta`); las barras de reparto y de avance se llenan; el subrayado de las pestañas y la
// pastilla del orden VIAJAN (`IndicadorDeslizante`); y al cambiar de vista u orden las filas que se quedan
// se reacomodan en vez de saltar (`ComprobantesListaFilas`, FLIP). Buscar resalta lo encontrado.
// `/` enfoca la búsqueda; `j`/`k` recorren las filas y `Enter` abre.

// Emisión (+ vence) · Proveedor (+ RUC) · N.° documento (+ tipo) · Recepción · Pago · Total · flecha.
// La fila entera es un enlace que abre el detalle como modal encima de esta lista (ruta interceptada
// `@modal/(.)factura/[compraId]`): la lista no se desmonta y al cerrar se vuelve exactamente donde se
// estaba, con scroll y filtros intactos. La flecha «›» es la señal de que se puede abrir.
const PLANTILLA = "sm:grid-cols-[8rem_1fr_7.5rem_10.75rem_11rem_7.25rem_1rem]";

const PARAMS_DE_VISTA = ["saldo", "porrecibir", "vencidas", "pago"];

export default async function ComprasPage({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  const persona = await exigirModulo("facturas_compra"); // 20260923130000: la lista de facturas es del módulo Facturas de compra
  const params = await searchParams;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const orden = params.orden === "vencimiento" ? "vencimiento" : "emision";
  const hayFiltros = Object.values(filtros).some(Boolean);

  // Qué comprobantes esperan su nota de crédito por faltante depende de los ids de la página, así que se
  // pide ENCADENADA a la lista (y solo si algún comprobante de la página tiene algo cerrado): sigue corriendo
  // en paralelo con las demás consultas de la pantalla.
  const [{ pagina: { filas: compras, siguiente }, notas }, resumen, extra, proveedores, ubicaciones, misPartes] = await Promise.all([
    listarCompras(filtros, { cursor, orden }).then(async (pagina) => ({ pagina, notas: await getNotasPendientes(idsConFaltanteCerrado(pagina.filas)) })),
    getResumenCompras(),
    getResumenComprasExtra(),
    getProveedoresActivos(),
    getUbicaciones(),
    // ADR-0179 (F3-b): la parte de mi tienda en comprobantes que gestiona otra (el líder los ve enteros en la lista).
    persona.rol === "lider" ? Promise.resolve([]) : getMisPartesDeCompras(),
  ]);
  // Para decir a qué tiendas va un comprobante repartido (ADR-0139).
  const nombrePorUbicacion = Object.fromEntries(ubicaciones.map((u) => [u.id, u.nombre]));

  const ahora = new Date();
  const hoy = hoyLima();
  const mesActual = nombreDelMes(hoy);
  const mesAnterior = nombreDelMes(sumarDias(`${hoy.slice(0, 7)}-01`, -1));
  const vista = vistaActiva(params);
  const busqueda = params.q?.trim() ?? "";
  const pagados = Math.max(0, resumen.vigentes - resumen.conSaldo);
  const cifra = (n: number, sing: string, plu: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? sing : plu}`;

  // Cada pestaña es una vista en la URL: conserva la búsqueda y los demás filtros, y reemplaza solo
  // el parámetro de vista.
  const hrefVista = (v: VistaComprobantes) => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val && k !== "cursor" && !PARAMS_DE_VISTA.includes(k)) q.set(k, String(val));
    const extraVista: Partial<Record<VistaComprobantes, [string, string]>> = { "por-pagar": ["saldo", "1"], "por-recibir": ["porrecibir", "1"], vencidos: ["vencidas", "1"], pagados: ["pago", "pagada"] };
    const e = extraVista[v];
    if (e) q.set(e[0], e[1]);
    const s = q.toString();
    return s ? `/compras?${s}` : "/compras";
  };
  const hrefOrden = (o: "emision" | "vencimiento") => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val && k !== "cursor" && k !== "orden") q.set(k, String(val));
    if (o === "vencimiento") q.set("orden", "vencimiento");
    const s = q.toString();
    return s ? `/compras?${s}` : "/compras";
  };

  return (
    <div className="space-y-6">
      <div className="anim-entra flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Comprobantes de proveedores</h1>
          <p className="mt-1 text-sm text-tinta/65">Cada comprobante registra lo que se compró; la recepción y el pago se anotan contra él.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {/* El registro de compras del mes que se le manda al contador (ADR-0179: con el filtro por tienda de la base,
              quien no es líder exporta lo de sus tiendas). */}
          <a
            href={`/compras/exportar?mes=${hoy.slice(0, 7)}`}
            className="label-cayla inline-flex items-center gap-2 rounded-md border border-tinta/25 px-4 py-3 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
          >
            <Download aria-hidden className="h-3.5 w-3.5" /> Exportar mes
          </a>
          <Link href="/compras/nueva" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
            + Registrar comprobante
          </Link>
        </div>
      </div>

      {/* Cada cifra lleva a donde se actúa sobre ella: «Por pagar» a la lista de deuda (y si hay vencidas,
          directo a las vencidas), «Por recibir» a la pantalla de recepción. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaCifra
          compacta
          viva
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          punto="ambar"
          detalleTono={resumen.vencidas > 0 ? "text-rojo" : undefined}
          etiqueta="Por pagar"
          valor={<CifraQueCuenta valor={resumen.deuda} formato="soles" alMontar />}
          href={resumen.vencidas > 0 ? "/compras/por-pagar?vencidas=1" : "/compras/por-pagar"}
          reparto={{ fraccion: resumen.deuda > 0 ? resumen.vencido / resumen.deuda : 0, tono: "rojo" }}
        >
          {resumen.vencidas > 0 ? (
            <>
              {cifra(resumen.vencidas, "vencida", "vencidas")} · {soles(resumen.vencido)} <span className="cmp-flecha">→</span>
            </>
          ) : (
            <>
              Sin vencidas <span className="cmp-flecha">→</span>
            </>
          )}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          viva
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          punto={resumen.porRecibir > 0 ? "ambar" : "verde"}
          detalleTono={resumen.porRecibirAtrasadas > 0 ? "text-ambar-profundo" : undefined}
          etiqueta="Por recibir"
          valor={<CifraQueCuenta valor={resumen.porRecibir} alMontar />}
          unidad={resumen.porRecibir === 1 ? "comprobante" : "comprobantes"}
          href={resumen.porRecibir > 0 ? "/compras/recibir" : undefined}
          reparto={{ fraccion: resumen.porRecibir > 0 ? resumen.porRecibirAtrasadas / resumen.porRecibir : 0, tono: "ambar" }}
        >
          {resumen.porRecibir === 0 ? (
            "Nada por recibir"
          ) : (
            <>
              {resumen.porRecibirAtrasadas > 0 ? `${cifra(resumen.porRecibirAtrasadas, "atrasada", "atrasadas")} · ` : ""}
              {soles(extra.valorPorRecibir)} por llegar <span className="cmp-flecha">→</span>
            </>
          )}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          className="anim-entra"
          style={{ ["--i" as string]: 3 }}
          etiqueta={`Compras de ${mesActual}`}
          valor={<CifraQueCuenta valor={extra.comprasMes} formato="soles" alMontar />}
        >
          {extra.comprasMesAnterior > 0 ? `${mesAnterior[0].toUpperCase()}${mesAnterior.slice(1)} completo: ${soles(extra.comprasMesAnterior)}` : `Sin compras en ${mesAnterior}`}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          className="anim-entra"
          style={{ ["--i" as string]: 4 }}
          punto="verde"
          etiqueta="IGV del mes"
          valor={<CifraQueCuenta valor={extra.igvMes} formato="soles" alMontar />}
        >
          Crédito fiscal · solo facturas
        </TarjetaCifra>
      </div>

      <MisPartesDeCompras partes={misPartes} indice={5} />

      <Pestanas
        deslizante
        idIndicador="comprobantes-vistas"
        className="anim-entra"
        style={{ ["--i" as string]: 5 }}
        etiquetaAccesible="Vistas de comprobantes"
        activa={vista}
        items={[
          { clave: "todos", etiqueta: "Todos", href: hrefVista("todos"), conteo: resumen.registradas },
          { clave: "por-pagar", etiqueta: "Por pagar", href: hrefVista("por-pagar"), conteo: resumen.conSaldo },
          { clave: "por-recibir", etiqueta: "Por recibir", href: hrefVista("por-recibir"), conteo: resumen.porRecibir },
          { clave: "vencidos", etiqueta: "Vencidos", href: hrefVista("vencidos"), conteo: resumen.vencidas },
          { clave: "pagados", etiqueta: "Pagados", href: hrefVista("pagados"), conteo: pagados },
        ]}
      />

      <div className="anim-entra" style={{ ["--i" as string]: 6 }}>
        <FiltrosCompras
          atajoBuscar
          proveedores={proveedores}
          tiendas={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))}
          visibles={["proveedor", "pago", "recepcion", "destino", "condicion", "tipo", "fechas", "vencidas"]}
          accionesDespues={
            <SegmentoEnlaces
              deslizante
              idIndicador="comprobantes-orden"
              etiquetaAccesible="Ordenar comprobantes"
              activo={orden}
              opciones={[
                { valor: "emision", etiqueta: "Emisión", href: hrefOrden("emision") },
                { valor: "vencimiento", etiqueta: "Vencimiento", href: hrefOrden("vencimiento") },
              ]}
            />
          }
        />
      </div>

      {compras.length === 0 && !cursor ? (
        <ComprobantesListaVacia hayFiltros={hayFiltros} busqueda={busqueda} />
      ) : (
        <Tabla className="anim-entra" style={{ ["--i" as string]: 7 }}>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Emisión" },
              { titulo: "Proveedor" },
              { titulo: "N.° documento" },
              { titulo: "Recepción" },
              { titulo: "Pago" },
              { titulo: "Total", alinear: "der" },
              { titulo: "" },
            ]}
          />
          <ComprobantesListaFilas clave={compras.map((c) => c.id).join("|")}>
            {compras.map((c, i) => {
              const recepcion = celdaRecepcion(c, ahora);
              const pago = celdaPago(c, ahora);
              return (
                <Link
                  key={c.id}
                  href={`/compras/factura/${c.id}`}
                  data-flip={c.id}
                  style={{ ["--k" as string]: Math.min(i, 8) }}
                  className={fila(PLANTILLA, "cmp-fila")}
                >
                  <span className={celda("izq", "whitespace-normal text-sm tabular-nums text-tinta")}>
                    <span className="block">{diaMes(c.fechaEmision)}</span>
                    <span className={`block text-xs ${c.vencida && c.estadoPago !== "pagada" ? "text-rojo" : "text-tinta/55"}`}>{subEmision(c)}</span>
                  </span>
                  <span className={celda()}>
                    <span className={`block text-sm ${c.estado === "anulada" ? "text-tinta/40 line-through" : "text-tinta"}`}>
                      <Resaltado texto={c.proveedorNombre} busqueda={busqueda} />
                    </span>
                    {c.proveedorRuc && (
                      <span className="block text-xs tabular-nums text-tinta/55">
                        RUC <Resaltado texto={c.proveedorRuc} busqueda={busqueda} />
                      </span>
                    )}
                  </span>
                  <span className={celda("izq", "whitespace-normal text-sm tabular-nums text-tinta")}>
                    <span className="block">
                      <Resaltado texto={c.documento} busqueda={busqueda} />
                    </span>
                    <span className="block text-xs text-tinta/55">{ETIQUETA_TIPO_DOCUMENTO[c.tipo]}</span>
                  </span>
                  <span className={celda("izq", "overflow-visible whitespace-normal")}>
                    <Chip tono={recepcion.tono}>{recepcion.texto}</Chip>
                    <span className="mt-0.5 block text-xs text-tinta/55">{recepcion.sub}</span>
                    {/* Repartido entre varias tiendas (ADR-0139): a cuáles va. Un comprobante de una sola tienda no lo repite acá. */}
                    {c.ubicacionesDestino.length > 1 && (
                      <span className="mt-0.5 block text-xs text-tinta/55">Repartida: {nombresDeDestinos(c.ubicacionesDestino, nombrePorUbicacion)}</span>
                    )}
                    {/* Avance real de lo recibido: solo si hay recepción parcial (`pct` es null si no). */}
                    <AvanceFino pct={recepcion.pct} />
                  </span>
                  <span className={celda("izq", "overflow-visible whitespace-normal")}>
                    {/* Solo lo vencido late: es lo único de la lista que pide actuar hoy. */}
                    <Chip tono={pago.tono} vivo={pago.tono === "rojo"}>
                      {pago.texto}
                    </Chip>
                    <span className="mt-0.5 block text-xs tabular-nums text-tinta/55">{pago.sub}</span>
                    <AvanceFino pct={pago.pct} />
                    {/* Junto al saldo: lo que el proveedor todavía debe acreditar por un faltante cerrado. */}
                    <ChipNotaPendiente nota={notas[c.id]} saldo={c.saldo} className="mt-1" />
                  </span>
                  <span className={celda("der", "cmp-total text-sm tabular-nums text-tinta")}>{c.total.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span aria-hidden className="cmp-flecha-fila hidden text-right text-base leading-none sm:block">
                    ›
                  </span>
                </Link>
              );
            })}
          </ComprobantesListaFilas>
        </Tabla>
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras" />
    </div>
  );
}

/** Barra fina de 3 px con el avance real bajo el subtexto de Recepción/Pago. `pct` 0–1; `null` = sin avance parcial, no se dibuja. */
function AvanceFino({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  return (
    <span aria-hidden className="cmp-mini">
      <i style={{ "--p": pct.toFixed(3) } as CSSProperties} />
    </span>
  );
}
