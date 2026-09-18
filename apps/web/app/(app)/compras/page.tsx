import Link from "next/link";
import { Download } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { listarCompras, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, ETIQUETA_TIPO_DOCUMENTO, soles, type ParamsCompras } from "@/lib/compras";
import { getResumenComprasExtra } from "@/lib/compras-indicadores";
import { celdaPago, celdaRecepcion, nombreDelMes, subEmision, vistaActiva, type VistaComprobantes } from "@/lib/comprobantes-lista-reglas";
import { diaMes, hoyLima, sumarDias } from "@/lib/fechas-lima";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { Pestanas } from "@/components/ui/Pestanas";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";

// Comprobantes de proveedores (ADR-0035, rediseño ADR-0106): la lista de lo que se compró. Cada
// fila dice los dos estados que importan —cuánto falta pagar y cuánto falta llegar— con su cifra
// debajo, no solo con un chip. Filtros, vistas y paginado viven en la URL y se resuelven en
// Postgres (`listar_compras`): la página nunca recibe más de 50 filas, haya 300 comprobantes o
// 3 millones.
//
// Las cuatro cifras de arriba deciden: qué se debe (y lo vencido), qué mercadería viene en camino
// (y cuánta ya debió llegar), cuánto se compró este mes frente al anterior, y el IGV de las
// facturas del mes — el crédito fiscal que se declara. Se fue «Registradas»: un conteo que no lleva
// a ninguna acción.

// Emisión (+ vence) · Proveedor (+ RUC) · N.° documento (+ tipo) · Recepción · Pago · Total · flecha.
// La fila entera es un enlace que abre el detalle como modal encima de esta lista (ruta interceptada
// `@modal/(.)factura/[compraId]`): la lista no se desmonta y al cerrar se vuelve exactamente donde se
// estaba, con scroll y filtros intactos. La flecha «›» es la señal de que se puede abrir.
const PLANTILLA = "sm:grid-cols-[8rem_1fr_7.5rem_10.75rem_11rem_7.25rem_1rem]";

const PARAMS_DE_VISTA = ["saldo", "porrecibir", "vencidas", "pago"];

export default async function ComprasPage({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  await requirePersonaActualV2();
  const params = await searchParams;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const orden = params.orden === "vencimiento" ? "vencimiento" : "emision";
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, resumen, extra, proveedores] = await Promise.all([
    listarCompras(filtros, { cursor, orden }),
    getResumenCompras(),
    getResumenComprasExtra(),
    getProveedoresActivos(),
  ]);

  const ahora = new Date();
  const hoy = hoyLima();
  const mesActual = nombreDelMes(hoy);
  const mesAnterior = nombreDelMes(sumarDias(`${hoy.slice(0, 7)}-01`, -1));
  const vista = vistaActiva(params);
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Comprobantes de proveedores</h1>
          <p className="mt-1 text-sm text-tinta/65">Cada comprobante registra lo que se compró; la recepción y el pago se anotan contra él.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {/* El registro de compras del mes que se le manda al contador. */}
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
          punto="ambar"
          detalleTono={resumen.vencidas > 0 ? "text-rojo" : undefined}
          etiqueta="Por pagar"
          valor={soles(resumen.deuda)}
          href={resumen.vencidas > 0 ? "/compras/por-pagar?vencidas=1" : "/compras/por-pagar"}
        >
          {resumen.vencidas > 0 ? `${cifra(resumen.vencidas, "vencida", "vencidas")} · ${soles(resumen.vencido)} →` : "Sin vencidas →"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={resumen.porRecibir > 0 ? "ambar" : "verde"}
          detalleTono={resumen.porRecibirAtrasadas > 0 ? "text-ambar-profundo" : undefined}
          etiqueta="Por recibir"
          valor={resumen.porRecibir.toLocaleString("es-PE")}
          unidad={resumen.porRecibir === 1 ? "comprobante" : "comprobantes"}
          href={resumen.porRecibir > 0 ? "/compras/recibir" : undefined}
        >
          {resumen.porRecibir === 0
            ? "Nada por recibir"
            : `${resumen.porRecibirAtrasadas > 0 ? `${cifra(resumen.porRecibirAtrasadas, "atrasada", "atrasadas")} · ` : ""}${soles(extra.valorPorRecibir)} por llegar →`}
        </TarjetaCifra>
        <TarjetaCifra compacta etiqueta={`Compras de ${mesActual}`} valor={soles(extra.comprasMes)}>
          {extra.comprasMesAnterior > 0 ? `${mesAnterior[0].toUpperCase()}${mesAnterior.slice(1)} completo: ${soles(extra.comprasMesAnterior)}` : `Sin compras en ${mesAnterior}`}
        </TarjetaCifra>
        <TarjetaCifra compacta punto="verde" etiqueta="IGV del mes" valor={soles(extra.igvMes)}>
          Crédito fiscal · solo facturas
        </TarjetaCifra>
      </div>

      <Pestanas
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

      <FiltrosCompras
        proveedores={proveedores}
        visibles={["proveedor", "pago", "recepcion", "condicion", "tipo", "fechas", "vencidas"]}
        accionesDespues={
          <SegmentoEnlaces
            etiquetaAccesible="Ordenar comprobantes"
            activo={orden}
            opciones={[
              { valor: "emision", etiqueta: "Emisión", href: hrefOrden("emision") },
              { valor: "vencimiento", etiqueta: "Vencimiento", href: hrefOrden("vencimiento") },
            ]}
          />
        }
      />

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? (
            "Ningún comprobante coincide con esos filtros."
          ) : (
            <>
              Todavía no hay comprobantes registrados.{" "}
              <Link href="/compras/nueva" className="text-rojo hover:underline">
                Registrar el primero →
              </Link>
            </>
          )}
        </p>
      ) : (
        <Tabla>
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
          {compras.map((c) => {
            const recepcion = celdaRecepcion(c, ahora);
            const pago = celdaPago(c, ahora);
            return (
              <Link key={c.id} href={`/compras/factura/${c.id}`} className={fila(PLANTILLA, "group transition-colors hover:bg-tinta/[0.03] focus-visible:bg-tinta/[0.03] focus-visible:outline-none")}>
                <span className={celda("izq", "whitespace-normal text-sm tabular-nums text-tinta")}>
                  <span className="block">{diaMes(c.fechaEmision)}</span>
                  <span className={`block text-xs ${c.vencida && c.estadoPago !== "pagada" ? "text-rojo" : "text-tinta/55"}`}>{subEmision(c)}</span>
                </span>
                <span className={celda()}>
                  <span className={`block text-sm ${c.estado === "anulada" ? "text-tinta/40 line-through" : "text-tinta"}`}>{c.proveedorNombre}</span>
                  {c.proveedorRuc && <span className="block text-xs tabular-nums text-tinta/55">RUC {c.proveedorRuc}</span>}
                </span>
                <span className={celda("izq", "whitespace-normal text-sm tabular-nums text-tinta")}>
                  <span className="block">{c.documento}</span>
                  <span className="block text-xs text-tinta/55">{ETIQUETA_TIPO_DOCUMENTO[c.tipo]}</span>
                </span>
                <span className={celda("izq", "overflow-visible whitespace-normal")}>
                  <Chip tono={recepcion.tono}>{recepcion.texto}</Chip>
                  <span className="mt-0.5 block text-xs text-tinta/55">{recepcion.sub}</span>
                </span>
                <span className={celda("izq", "overflow-visible whitespace-normal")}>
                  <Chip tono={pago.tono}>{pago.texto}</Chip>
                  <span className="mt-0.5 block text-xs tabular-nums text-tinta/55">{pago.sub}</span>
                </span>
                <span className={celda("der", "text-sm tabular-nums text-tinta")}>{c.total.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span aria-hidden className="hidden text-right text-base leading-none text-tinta/30 transition-colors group-hover:text-rojo sm:block">
                  ›
                </span>
              </Link>
            );
          })}
        </Tabla>
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras" />
    </div>
  );
}
