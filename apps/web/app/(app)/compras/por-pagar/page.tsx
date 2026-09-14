import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { listarPorPagar, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, fechaCorta, soles, type CompraResumen, type ParamsCompras } from "@/lib/compras";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { BotonPagar } from "@/components/CompraDetallePanel";

// Documento · Emitida · Vencimiento · Pagado de total · Saldo · Pagar
const PLANTILLA = "sm:grid-cols-[7rem_1fr_9rem_8.5rem_8.5rem_5rem]";

// Por pagar (ADR-0035): las facturas vigentes con saldo, ordenadas por
// vencimiento (las vencidas quedan arriba solas) y agrupadas por proveedor
// dentro de la página. Sale del índice parcial `compras_por_pagar_idx`, que
// solo contiene lo que se debe — chico aunque haya millones pagadas. Las
// cifras de cabecera se suman en Postgres, no en la página.
//
// 2026-09-14: la página se parte en dos bloques —"Vencidas" y "Al día"— y
// cada fila lleva su botón "Pagar", que abre el mismo modal del detalle (un
// pago sigue siendo contra UNA factura). Antes las vencidas solo se
// distinguían por una fecha en rojo, y pagar exigía entrar a cada una.
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

  // Dos bloques, cada uno agrupado por proveedor DENTRO de la página: el
  // orden global sigue siendo por vencimiento, así que un proveedor puede
  // reaparecer en la siguiente página.
  const vencidas = agruparPorProveedor(compras.filter((c) => c.vencida));
  const alDia = agruparPorProveedor(compras.filter((c) => !c.vencida));
  const saldoVencidoPagina = compras.filter((c) => c.vencida).reduce((a, c) => a + c.saldo, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Por pagar</h1>
        <p className="mt-1 text-sm text-tinta/65">Lo que se debe a proveedores, factura por factura y por orden de vencimiento. Se paga desde cada fila o desde el detalle.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Deuda total" valor={soles(resumen.deuda)} detalle={`${resumen.conSaldo.toLocaleString("es-PE")} factura${resumen.conSaldo === 1 ? "" : "s"}`} />
        <Cifra etiqueta="Vencido" valor={soles(resumen.vencido)} detalle={resumen.vencidas ? `${resumen.vencidas.toLocaleString("es-PE")} factura${resumen.vencidas === 1 ? "" : "s"} vencida${resumen.vencidas === 1 ? "" : "s"}` : "Nada vencido"} alerta={resumen.vencidas > 0} />
        <Cifra etiqueta="Vence en 7 días" valor={soles(proximas7.reduce((a, c) => a + c.saldo, 0))} detalle={proximas7.length ? `${proximas7.length} factura${proximas7.length === 1 ? "" : "s"} en esta página` : "Ninguna en esta página"} />
      </div>

      <FiltrosCompras proveedores={proveedores} visibles={["busqueda", "proveedor", "vencidas", "condicion"]} principales={["busqueda", "proveedor", "vencidas"]} />

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ninguna factura por pagar coincide con esos filtros." : "No hay facturas con saldo pendiente. Todo pagado."}
        </p>
      ) : (
        <>
          {vencidas.length > 0 && (
            <Bloque titulo="Vencidas" saldo={saldoVencidoPagina} alerta>
              {vencidas.map((g) => (
                <Grupo key={g.id} grupo={g} />
              ))}
            </Bloque>
          )}
          {alDia.length > 0 && (
            <Bloque titulo="Al día" saldo={compras.filter((c) => !c.vencida).reduce((a, c) => a + c.saldo, 0)}>
              {alDia.map((g) => (
                <Grupo key={g.id} grupo={g} />
              ))}
            </Bloque>
          )}
        </>
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras/por-pagar" />
    </div>
  );
}

type GrupoProveedor = { id: string; nombre: string; saldo: number; facturas: CompraResumen[] };

function agruparPorProveedor(compras: CompraResumen[]): GrupoProveedor[] {
  const porProveedor = new Map<string, GrupoProveedor>();
  for (const c of compras) {
    const g = porProveedor.get(c.proveedorId) ?? { id: c.proveedorId, nombre: c.proveedorNombre, saldo: 0, facturas: [] };
    g.saldo += c.saldo;
    g.facturas.push(c);
    porProveedor.set(c.proveedorId, g);
  }
  return [...porProveedor.values()];
}

// El bloque "Vencidas" lleva una línea roja arriba: es el único rojo
// estructural de la pantalla, y separa a simple vista lo que ya debió
// pagarse de lo que todavía está en plazo. Arriba y no a la izquierda para
// que las tablas de los dos bloques queden del mismo ancho.
function Bloque({ titulo, saldo, alerta = false, children }: { titulo: string; saldo: number; alerta?: boolean; children: React.ReactNode }) {
  return (
    <section className={`space-y-4 border-t-2 pt-4 ${alerta ? "border-rojo" : "border-tinta/15"}`}>
      <div className="flex items-baseline justify-between">
        <h2 className={`font-display text-lg ${alerta ? "text-rojo" : "text-tinta"}`}>{titulo}</h2>
        <p className={`text-sm tabular-nums ${alerta ? "text-rojo" : "text-tinta/65"}`}>{soles(saldo)} en esta página</p>
      </div>
      {children}
    </section>
  );
}

function Grupo({ grupo: g }: { grupo: GrupoProveedor }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="label-cayla text-[11px] text-tinta/65">{g.nombre}</p>
        <p className="text-sm tabular-nums text-tinta">{soles(g.saldo)}</p>
      </div>
      <Tabla>
        <Encabezado
          plantilla={PLANTILLA}
          columnas={[{ titulo: "Documento" }, { titulo: "Emitida · Condición" }, { titulo: "Vencimiento" }, { titulo: "Pagado", alinear: "der" }, { titulo: "Saldo", alinear: "der" }, { titulo: "" }]}
        />
        {g.facturas.map((c) => (
          // La fila entera abre el detalle (el enlace del documento se
          // estira sobre toda la fila con `after:`), y el botón Pagar queda
          // por encima para no disparar el enlace. Así no hay un <button>
          // adentro de un <a>, que el navegador no permite.
          <div key={c.id} className={fila(PLANTILLA, "relative transition-colors hover:bg-tinta/[0.03]")}>
            <Link href={`/compras/${c.id}`} className={celda("izq", "text-sm tabular-nums text-tinta after:absolute after:inset-0 after:content-['']")}>
              {c.documento}
            </Link>
            <span className={celda("izq", "text-xs text-tinta/65")}>
              {fechaCorta(c.fechaEmision)} · {c.condicion === "contado" ? "contado" : "crédito"}
            </span>
            <span className={celda("izq", `label-cayla text-[11px] ${c.vencida ? "text-rojo" : diasHasta(c.fechaVencimiento ?? "") <= 7 ? "text-ambar-profundo" : "text-tinta/65"}`)}>
              {c.fechaVencimiento ? (c.vencida ? `Venció ${fechaCorta(c.fechaVencimiento)}` : etiquetaVence(c.fechaVencimiento)) : "Sin vencimiento"}
            </span>
            <span className={celda("der", "text-xs text-tinta/65")}>
              {soles(c.pagado)}
              <span className="block text-[11px] text-tinta/45">de {soles(c.total)}</span>
            </span>
            <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(c.saldo)}</span>
            <span className="relative z-10 sm:text-right">
              <BotonPagar compra={c} compacto />
            </span>
          </div>
        ))}
      </Tabla>
    </div>
  );
}

function diasHasta(iso: string): number {
  if (!iso) return Infinity;
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
