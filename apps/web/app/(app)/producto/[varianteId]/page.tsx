import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente } from "@/lib/inteligencia";
import { createClient } from "@/lib/supabase/server";

const ETIQUETA_TIPO: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  traslado: "Traslado",
};

const ETIQUETA_MOTIVO: Record<string, string> = {
  venta: "Venta",
  merma: "Merma / pérdida",
  regalo: "Regalo o cortesía",
  muestra: "Muestra",
  otro: "Otro",
};

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function StockSparkline({ serie }: { serie: { fecha: string; stock: number }[] }) {
  if (serie.length < 2) {
    return <p className="text-xs italic text-neutral-400">No hay suficiente historial para graficar la tendencia.</p>;
  }
  const w = 300;
  const h = 72;
  const pad = 4;
  const valores = serie.map((p) => p.stock);
  const min = Math.min(...valores, 0);
  const max = Math.max(...valores, 1);
  const rango = max - min || 1;
  const paso = (w - pad * 2) / (serie.length - 1);
  const puntos = serie
    .map((p, i) => {
      const x = pad + i * paso;
      const y = h - pad - ((p.stock - min) / rango) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth={2} className="text-neutral-900" />
    </svg>
  );
}

export default async function ProductoDetallePage({ params }: { params: Promise<{ varianteId: string }> }) {
  const { varianteId } = await params;
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const { variantes } = await getCatalogoInteligente(persona);
  const v = variantes.find((x) => x.varianteId === varianteId);
  if (!v) notFound();

  const { data: sedesData } = await supabase.from("sedes").select("id, codigo");
  const sedePorId = new Map((sedesData ?? []).map((s) => [s.id, s.codigo]));

  const { data: movimientos } = await supabase
    .from("movimientos")
    .select("id, tipo, cantidad, motivo, sede_id, sede_destino_id, usuario_id, nota, created_at")
    .eq("variante_id", varianteId)
    .order("created_at", { ascending: false })
    .limit(200);

  const usuarioIds = [...new Set((movimientos ?? []).map((m) => m.usuario_id).filter(Boolean))] as string[];
  const { data: personasData } = usuarioIds.length
    ? await supabase.from("personas").select("id, nombre").in("id", usuarioIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombrePorId = new Map((personasData ?? []).map((p) => [p.id, p.nombre]));

  // Serie de stock: se ancla al total actual conocido (v.stockTotal) y camina hacia
  // atrás con los deltas de entrada/salida/ajuste (traslado no cambia el total de red).
  const ascendente = [...(movimientos ?? [])].reverse();
  const deltaDe = (m: (typeof ascendente)[number]) => {
    if (m.tipo === "salida") return -Math.abs(m.cantidad);
    if (m.tipo === "traslado") return 0;
    return m.cantidad;
  };
  const sumaDeltas = ascendente.reduce((acc, m) => acc + deltaDe(m), 0);
  let acumulado = v.stockTotal - sumaDeltas;
  const serie = [{ fecha: ascendente[0]?.created_at ?? new Date().toISOString(), stock: acumulado }];
  ascendente.forEach((m) => {
    acumulado += deltaDe(m);
    serie.push({ fecha: m.created_at, stock: acumulado });
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-neutral-400 hover:underline">← Volver al catálogo</Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">{v.referencia}</h1>
        <p className="text-xs text-neutral-500">
          {[v.talla, v.color, v.categoria, v.marca].filter(Boolean).join(" · ")}
        </p>
        <p className="font-mono text-[11px] text-neutral-300">{v.sku}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Stock total</p>
          <p className="text-lg font-semibold text-neutral-900">{v.stockTotal}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Velocidad</p>
          <p className="text-lg font-semibold text-neutral-900">{v.velocidadDiaria}/día</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Días de inventario</p>
          <p className="text-lg font-semibold text-neutral-900">{v.diasInventario ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Días sin salida</p>
          <p className="text-lg font-semibold text-neutral-900">{v.diasSinSalida ?? "—"}</p>
        </div>
        {v.sellThrough != null && (
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs text-neutral-400">Sell-through</p>
            <p className="text-lg font-semibold text-neutral-900">{Math.round(v.sellThrough * 100)}%</p>
          </div>
        )}
        {v.claseABC && (
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs text-neutral-400">Clase ABC</p>
            <p className="text-lg font-semibold text-neutral-900">{v.claseABC}</p>
          </div>
        )}
        {(v.estancado || v.reponerYa) && (
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs text-neutral-400">Alertas</p>
            <p className="text-sm font-medium text-red-600">
              {[v.reponerYa && "Reponer ya", v.estancado && "Estancado"].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
      </div>

      {v.sugerenciaTraslado && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Sugerencia: {v.sugerenciaTraslado.sedeDestinoCodigo} está en 0 y {v.sugerenciaTraslado.sedeOrigenCodigo} tiene{" "}
          {v.sugerenciaTraslado.stockOrigen} unidades de sobra — considera trasladar.
        </p>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Stock por sede</h2>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(v.stockPorSede).map(([codigo, cantidad]) => (
            <span key={codigo} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
              {codigo} <b>{cantidad}</b>
            </span>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Tendencia de stock</h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <StockSparkline serie={serie} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Historial de movimientos</h2>
        {!movimientos || movimientos.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-neutral-400">Sin movimientos registrados.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Sede</th>
                  <th className="px-3 py-2 font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                  <th className="px-3 py-2 font-medium">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2 text-neutral-600">{formatearFecha(m.created_at)}</td>
                    <td className="px-3 py-2 text-neutral-900">{ETIQUETA_TIPO[m.tipo] ?? m.tipo}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {sedePorId.get(m.sede_id) ?? "—"}
                      {m.tipo === "traslado" && m.sede_destino_id && ` → ${sedePorId.get(m.sede_destino_id) ?? "—"}`}
                    </td>
                    <td className="px-3 py-2 text-neutral-900">{m.cantidad}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {m.tipo === "salida" ? ETIQUETA_MOTIVO[m.motivo ?? ""] ?? m.motivo : m.motivo || "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {m.usuario_id ? nombrePorId.get(m.usuario_id) ?? "—" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
