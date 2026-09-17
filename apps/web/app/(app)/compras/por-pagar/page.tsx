import { Fragment } from "react";
import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { listarPorPagar, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, getCompra, fechaCorta, soles, type CompraResumen, type ParamsCompras } from "@/lib/compras";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { BotonPagar, PagoDesdeUrl } from "@/components/CompraDetallePanel";

// Proveedor y documento · Vence · Pagado · Saldo · Pagar
const PLANTILLA = "sm:grid-cols-[1fr_11rem_10rem_8.5rem_5.5rem]";

// Por pagar (ADR-0035): las facturas vigentes con saldo, ordenadas por
// vencimiento. Sale del índice parcial `compras_por_pagar_idx`, que solo
// contiene lo que se debe — chico aunque haya millones pagadas. Las cifras
// de cabecera se suman en Postgres (`resumen_compras`), no en la página.
//
// 2026-09-14 (segunda vuelta): UNA sola tabla partida en tres tramos por
// urgencia —Vencidas, Esta semana, Más adelante— con el proveedor en cada
// fila. La versión anterior armaba una tabla por proveedor dentro de dos
// bloques, cada una con su encabezado, y repetía el mismo monto en cuatro
// niveles (tarjeta, bloque, proveedor, fila): con cinco proveedores había
// cinco filas de títulos y ninguna respuesta rápida a "¿qué pago hoy?". La
// pregunta del proveedor la responde el filtro, no la estructura. Cada fila
// lleva su "Pagar", que abre el mismo modal del detalle (un pago sigue
// siendo contra UNA factura).
export default async function PorPagarPage({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  await requirePersonaActualV2();
  // `pagar` se separa del resto: es una orden de una sola vez ("abre el modal
  // de esta factura"), no un filtro — no debe viajar en los enlaces de
  // paginación ni en los filtros.
  const { pagar, ...params } = await searchParams;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, resumen, proveedores, compraAPagar] = await Promise.all([
    listarPorPagar(filtros, cursor),
    getResumenCompras(),
    getProveedoresActivos(),
    pagar && /^[0-9a-f-]{36}$/i.test(pagar) ? getCompra(pagar) : null,
  ]);
  // Solo se abre si de verdad hay algo que pagar; un enlace viejo a una
  // factura ya saldada o anulada cae en la lista sin más.
  const abrirPago = compraAPagar && compraAPagar.estado === "vigente" && compraAPagar.saldo > 0 ? compraAPagar : null;

  // Los tramos se arman con las filas de la página: el orden global es por
  // vencimiento, así que un tramo puede seguir en la página siguiente. Solo
  // en ese caso el subtotal del tramo aclara "en esta página".
  const tramos = armarTramos(compras);
  const hayMasPaginas = !!siguiente || !!cursor;

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Por pagar</h1>
        <p className="mt-1 text-sm text-tinta/65">Lo que se debe a proveedores, de lo más urgente a lo que puede esperar. Se paga desde cada fila.</p>
      </div>

      {/* `grid-cols-2` también en celular (no solo desde `sm:`): con las tres
          tarjetas apiladas a ancho completo, la lista de facturas —lo que se
          vino a ver— quedaba a ~830px de scroll, bajo tres bloques de puro
          número. "Deuda total" ocupa las dos columnas por ser la cifra ancla;
          Vencido/Vence esta semana se emparejan debajo. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Cifra etiqueta="Deuda total" valor={soles(resumen.deuda)} detalle={contar(resumen.conSaldo, "factura", "facturas")} />
        </div>
        <Cifra
          etiqueta="Vencido"
          valor={soles(resumen.vencido)}
          detalle={resumen.vencidas ? `${contar(resumen.vencidas, "factura vencida", "facturas vencidas")} · pagar ya` : "Nada vencido"}
          tono={resumen.vencidas > 0 ? "rojo" : "neutro"}
          href={resumen.vencidas > 0 ? "#tramo-vencidas" : undefined}
        />
        <Cifra
          etiqueta="Vence esta semana"
          valor={soles(resumen.porVencerMonto)}
          detalle={resumen.porVencer ? contar(resumen.porVencer, "factura", "facturas") : "Ninguna en los próximos 7 días"}
          tono={resumen.porVencer > 0 ? "ambar" : "neutro"}
          href={resumen.porVencer > 0 ? "#tramo-semana" : undefined}
        />
      </div>

      <FiltrosCompras proveedores={proveedores} visibles={["busqueda", "proveedor", "vencidas", "condicion"]} principales={["busqueda", "proveedor", "vencidas"]} />

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ninguna factura por pagar coincide con esos filtros." : "No hay facturas con saldo pendiente. Todo pagado."}
        </p>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[{ titulo: "Proveedor · Documento" }, { titulo: "Vence" }, { titulo: "Pagado", alinear: "der" }, { titulo: "Saldo", alinear: "der" }, { titulo: "" }]}
          />
          {tramos.map((t) => (
            <Fragment key={t.clave}>
              <TramoFila tramo={t} parcial={hayMasPaginas} />
              {t.facturas.map((c) => (
                <FilaFactura key={c.id} compra={c} />
              ))}
            </Fragment>
          ))}
        </Tabla>
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras/por-pagar" />

      {abrirPago && <PagoDesdeUrl compra={abrirPago} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tramos por urgencia
// ---------------------------------------------------------------------------

type ClaveTramo = "vencidas" | "semana" | "despues";
type Tramo = { clave: ClaveTramo; titulo: string; facturas: CompraResumen[]; saldo: number };

const TITULO_TRAMO: Record<ClaveTramo, string> = {
  vencidas: "Vencidas",
  semana: "Vencen esta semana",
  despues: "Más adelante",
};

// Rojo solo para lo vencido (hay que actuar); ámbar para lo que está por
// vencer; el resto neutro. Mismos tonos que los chips del módulo.
const ESTILO_TRAMO: Record<ClaveTramo, string> = {
  vencidas: "bg-rojo/[0.05] text-rojo",
  semana: "bg-ambar/[0.08] text-ambar-profundo",
  despues: "bg-tinta/[0.03] text-tinta/65",
};

function tramoDe(c: CompraResumen): ClaveTramo {
  if (c.vencida) return "vencidas";
  if (c.fechaVencimiento && diasHasta(c.fechaVencimiento) <= 7) return "semana";
  return "despues";
}

function armarTramos(compras: CompraResumen[]): Tramo[] {
  const orden: ClaveTramo[] = ["vencidas", "semana", "despues"];
  const porClave = new Map<ClaveTramo, Tramo>();
  for (const c of compras) {
    const clave = tramoDe(c);
    const t = porClave.get(clave) ?? { clave, titulo: TITULO_TRAMO[clave], facturas: [], saldo: 0 };
    t.facturas.push(c);
    t.saldo += c.saldo;
    porClave.set(clave, t);
  }
  return orden.map((k) => porClave.get(k)).filter((t): t is Tramo => !!t);
}

function TramoFila({ tramo: t, parcial }: { tramo: Tramo; parcial: boolean }) {
  return (
    // El id es el destino de las tarjetas "Vencido"/"Vence esta semana" de
    // arriba (Cifra con `href`); `scroll-mt-24` compensa la cabecera fija,
    // mismo valor que ya usa RecepcionCompraFormV2.
    <div id={`tramo-${t.clave}`} className={`scroll-mt-24 flex items-baseline justify-between gap-4 px-5 py-2 ${ESTILO_TRAMO[t.clave]}`} role="row">
      <p className="label-cayla text-[11px]">
        {t.titulo} <span className="opacity-70">· {contar(t.facturas.length, "factura", "facturas")}</span>
      </p>
      <p className="text-sm tabular-nums">
        {soles(t.saldo)}
        {parcial && <span className="ml-1 text-xs opacity-70">en esta página</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La fila
// ---------------------------------------------------------------------------

function FilaFactura({ compra: c }: { compra: CompraResumen }) {
  const tramo = tramoDe(c);
  const colorVence = tramo === "vencidas" ? "text-rojo" : tramo === "semana" ? "text-ambar-profundo" : "text-tinta";
  return (
    // La fila entera abre el detalle (el enlace del proveedor se estira
    // sobre toda la fila con `after:`), y el botón Pagar queda por encima
    // para no disparar el enlace. Así no hay un <button> adentro de un <a>,
    // que el navegador no permite.
    <div className={fila(PLANTILLA, "relative transition-colors hover:bg-tinta/[0.03]")}>
      <Link href={`/compras/factura/${c.id}`} className={celda("izq", "after:absolute after:inset-0 after:content-['']")}>
        <span className="block text-sm text-tinta">
          {c.proveedorNombre} <span className="text-xs tabular-nums text-tinta/65">{c.documento}</span>
        </span>
        <span className="block text-xs text-tinta/55">Emitida {fechaCorta(c.fechaEmision)}</span>
      </Link>

      <span className={celda("izq")}>
        <span className={`block text-sm ${colorVence}`}>{c.fechaVencimiento ? etiquetaVence(c.fechaVencimiento, c.vencida) : "Sin fecha"}</span>
        {c.fechaVencimiento && <span className="block text-xs tabular-nums text-tinta/55">{fechaCorta(c.fechaVencimiento)}</span>}
      </span>

      <span className={celda("der")}>
        {c.pagado > 0 ? (
          <>
            <span className="block text-sm text-tinta">{soles(c.pagado)}</span>
            <span className="block text-xs text-tinta/55">de {soles(c.total)}</span>
          </>
        ) : (
          <>
            <span className="block text-sm text-tinta/55">Sin pagos</span>
            <span className="block text-xs text-tinta/55">de {soles(c.total)}</span>
          </>
        )}
      </span>

      <span className={celda("der", "font-display text-base text-tinta")}>{soles(c.saldo)}</span>

      <span className="relative z-10 sm:text-right">
        <BotonPagar compra={c} compacto />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

function contar(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? singular : plural}`;
}

function diasHasta(iso: string): number {
  if (!iso) return Infinity;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(iso.slice(0, 10) + "T00:00:00");
  return Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
}

// "Venció hace 15 días" / "Vence hoy" / "Vence en 3 días" / "Vence el 14/10":
// lo relativo es lo que se lee de un vistazo; la fecha exacta va debajo.
function etiquetaVence(iso: string, vencida: boolean): string {
  const d = diasHasta(iso);
  if (vencida || d < 0) {
    const atras = Math.abs(d);
    if (atras === 0) return "Venció hoy";
    if (atras === 1) return "Venció ayer";
    if (atras < 30) return `Venció hace ${atras} días`;
    return `Venció hace ${Math.round(atras / 30)} ${Math.round(atras / 30) === 1 ? "mes" : "meses"}`;
  }
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  if (d <= 7) return `Vence en ${d} días`;
  if (d < 30) return `Vence en ${d} días`;
  return `Vence el ${fechaCorta(iso)}`;
}

// `href` es opcional (2026-09-17): cuando la cifra tiene facturas detrás
// ("Vencido"/"Vence esta semana"), la tarjeta entera salta a ese tramo de la
// tabla — el número deja de ser un dato inerte y se vuelve el atajo más
// corto a las filas que explica. Sin facturas detrás (nada vencido, nada por
// vencer) sigue siendo una tarjeta simple: no hay adónde saltar.
function Cifra({
  etiqueta,
  valor,
  detalle,
  tono = "neutro",
  href,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: "neutro" | "rojo" | "ambar";
  href?: string;
}) {
  const color = tono === "rojo" ? "text-rojo" : tono === "ambar" ? "text-ambar-profundo" : "text-tinta";
  const colorDetalle = tono === "neutro" ? "text-tinta/65" : color;
  const contenido = (
    <>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className={`font-display mt-1 text-2xl tabular-nums ${color}`}>{valor}</p>
      <p className={`mt-0.5 text-xs ${colorDetalle}`}>{detalle}</p>
    </>
  );
  if (href) {
    return (
      <a href={href} className="card-cayla block p-4 transition-colors hover:bg-tinta/[0.03]">
        {contenido}
      </a>
    );
  }
  return <div className="card-cayla p-4">{contenido}</div>;
}
