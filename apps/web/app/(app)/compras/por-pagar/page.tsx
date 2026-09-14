import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { listarPorPagar, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, fechaCorta, soles, type CompraResumen, type ParamsCompras } from "@/lib/compras";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";

// Documento · Emitida · Vencimiento · Pagado de total · Saldo
const PLANTILLA = "sm:grid-cols-[7rem_1fr_9rem_8.5rem_8.5rem]";

// Por pagar (ADR-0035): las facturas vigentes con saldo, ordenadas por
// vencimiento (las vencidas quedan arriba solas) y agrupadas por proveedor
// dentro de la página. Sale del índice parcial `compras_por_pagar_idx`, que
// solo contiene lo que se debe — chico aunque haya millones pagadas. Las
// cifras de cabecera se suman en Postgres, no en la página. Registrar el
// pago se hace desde el detalle (un pago siempre es contra UNA factura).
export default async function PorPagarPage({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  await requirePersonaActualV2();
  const params = await searchParams;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, resumen, proveedores] = await Promise.all([
    listarPorPagar(filtros, cursor),
    getResumenCompras(),
    getProveedoresActivos(),
  ]);
  const proximas7 = compras.filter((c) => !c.vencida && c.fechaVencimiento && diasHasta(c.fechaVencimiento) <= 7);

  // Agrupar por proveedor DENTRO de la página: el orden global sigue siendo
  // por vencimiento, así que un proveedor puede reaparecer en la siguiente.
  const porProveedor = new Map<string, { nombre: string; saldo: number; facturas: CompraResumen[] }>();
  for (const c of compras) {
    const g = porProveedor.get(c.proveedorId) ?? { nombre: c.proveedorNombre, saldo: 0, facturas: [] };
    g.saldo += c.saldo;
    g.facturas.push(c);
    porProveedor.set(c.proveedorId, g);
  }
  const grupos = [...porProveedor.values()];

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Por pagar</h1>
        <p className="mt-1 text-sm text-tinta/65">Lo que se debe a proveedores, factura por factura y por orden de vencimiento. Se paga desde el detalle de cada una.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Deuda total" valor={soles(resumen.deuda)} detalle={`${resumen.conSaldo.toLocaleString("es-PE")} factura${resumen.conSaldo === 1 ? "" : "s"}`} />
        <Cifra etiqueta="Vencido" valor={soles(resumen.vencido)} detalle={resumen.vencidas ? `${resumen.vencidas.toLocaleString("es-PE")} factura${resumen.vencidas === 1 ? "" : "s"} vencida${resumen.vencidas === 1 ? "" : "s"}` : "Nada vencido"} alerta={resumen.vencidas > 0} />
        <Cifra etiqueta="Vence en 7 días" valor={soles(proximas7.reduce((a, c) => a + c.saldo, 0))} detalle={proximas7.length ? `${proximas7.length} factura${proximas7.length === 1 ? "" : "s"} en esta página` : "Ninguna en esta página"} />
      </div>

      <FiltrosCompras proveedores={proveedores} visibles={["busqueda", "proveedor", "vencidas", "condicion"]} />

      {grupos.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ninguna factura por pagar coincide con esos filtros." : "No hay facturas con saldo pendiente. Todo pagado."}
        </p>
      ) : (
        grupos.map((g) => (
          <section key={g.nombre} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="label-cayla text-[11px] text-tinta/65">{g.nombre}</p>
              <p className="text-sm tabular-nums text-tinta">{soles(g.saldo)}</p>
            </div>
            <Tabla>
              <Encabezado
                plantilla={PLANTILLA}
                columnas={[{ titulo: "Documento" }, { titulo: "Emitida · Condición" }, { titulo: "Vencimiento" }, { titulo: "Pagado", alinear: "der" }, { titulo: "Saldo", alinear: "der" }]}
              />
              {g.facturas.map((c) => (
                <Link key={c.id} href={`/compras/${c.id}`} className={fila(PLANTILLA, "transition-colors hover:bg-tinta/[0.03]")}>
                  <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{c.documento}</span>
                  <span className={celda("izq", "text-xs text-tinta/65")}>
                    {fechaCorta(c.fechaEmision)} · {c.condicion === "contado" ? "contado" : "crédito"}
                  </span>
                  <span className={celda("izq", `label-cayla text-[11px] ${c.vencida ? "text-rojo" : "text-tinta/65"}`)}>
                    {c.fechaVencimiento ? (c.vencida ? `Venció ${fechaCorta(c.fechaVencimiento)}` : etiquetaVence(c.fechaVencimiento)) : "Sin vencimiento"}
                  </span>
                  <span className={celda("der", "text-xs text-tinta/65")}>
                    {soles(c.pagado)}
                    <span className="block text-[11px] text-tinta/45">de {soles(c.total)}</span>
                  </span>
                  <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(c.saldo)}</span>
                </Link>
              ))}
            </Tabla>
          </section>
        ))
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras/por-pagar" />
    </div>
  );
}

function diasHasta(iso: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(iso.slice(0, 10) + "T00:00:00");
  return Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
}

function etiquetaVence(iso: string): string {
  const d = diasHasta(iso);
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  if (d <= 7) return `Vence en ${d} días`;
  return `Vence ${fechaCorta(iso)}`;
}

function Cifra({ etiqueta, valor, detalle, alerta = false }: { etiqueta: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className="card-cayla p-4">
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className={`font-display mt-1 text-2xl tabular-nums ${alerta ? "text-rojo" : "text-tinta"}`}>{valor}</p>
      <p className={`mt-0.5 text-xs ${alerta ? "text-rojo" : "text-tinta/65"}`}>{detalle}</p>
    </div>
  );
}
