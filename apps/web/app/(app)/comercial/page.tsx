import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente } from "@/lib/inteligencia";
import { createClient } from "@/lib/supabase/server";
import { Ayuda } from "@/components/Ayuda";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

const DIA_MS = 86400000;

function desdeISO(dias: number) {
  return new Date(Date.now() - dias * DIA_MS).toISOString();
}

// Comercial (rediseño UX 2026-07-18): mata el dolor #2 de Felipe — "no tener datos
// concretos para el área comercial, depender de intuición para decidir qué comprar".
// Cuatro respuestas: qué reponer YA, qué familias/categorías rotan, cómo compara
// cada sede, y cuánto dinero hay parado en stock.
export default async function ComercialPage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const supabase = await createClient();
  const { variantes, ventanaDias } = await getCatalogoInteligente(persona);

  const desde = desdeISO(ventanaDias);
  const [{ data: sedesData }, { data: ventasMov }] = await Promise.all([
    supabase.from("sedes").select("id, codigo, tipo"),
    supabase
      .from("movimientos")
      .select("sede_id, cantidad, monto")
      .eq("tipo", "salida")
      .eq("motivo", "venta")
      .gte("created_at", desde),
  ]);
  const codigoPorId = new Map((sedesData ?? []).map((s) => [s.id, s.codigo]));

  // ==================== Sugerencias de reposición ====================
  // Compra sugerida: cubrir el punto de reorden con 50% de colchón. Es un punto de
  // partida honesto con poca historia de ventas — se afina solo a medida que el
  // sistema acumula datos reales.
  const sugerencias = variantes
    .filter((v) => v.reponerYa)
    .map((v) => ({
      ...v,
      deficit: Math.round((v.reorderPoint - v.stockTotal) * 10) / 10,
      sugerida: Math.max(1, Math.ceil(v.reorderPoint * 1.5 - v.stockTotal)),
    }))
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 15);

  // ==================== Rotación por familia y categoría ====================
  type Agregado = { unidades: number; monto: number; stock: number; valorCosto: number };
  const porFamilia = new Map<string, Agregado>();
  const porCategoria = new Map<string, Agregado>();
  const acumular = (mapa: Map<string, Agregado>, clave: string, v: (typeof variantes)[number]) => {
    const a = mapa.get(clave) ?? { unidades: 0, monto: 0, stock: 0, valorCosto: 0 };
    a.unidades += v.vendidasVentana;
    a.monto += v.montoVentana ?? 0;
    a.stock += v.stockTotal;
    a.valorCosto += (v.costo ?? 0) * v.stockTotal;
    mapa.set(clave, a);
  };
  variantes.forEach((v) => {
    acumular(porFamilia, v.familia ?? "sin familia", v);
    acumular(porCategoria, `${v.familia ?? "—"} · ${v.categoria ?? "sin categoría"}`, v);
  });
  const familiasOrdenadas = [...porFamilia.entries()].sort((a, b) => b[1].monto - a[1].monto);
  const categoriasTop = [...porCategoria.entries()].sort((a, b) => b[1].monto - a[1].monto).slice(0, 10);

  // ==================== Comparativo entre sedes (ventas reales de la ventana) ====================
  const porSede = new Map<string, { unidades: number; monto: number }>();
  (ventasMov ?? []).forEach((m) => {
    const codigo = codigoPorId.get(m.sede_id) ?? "?";
    const a = porSede.get(codigo) ?? { unidades: 0, monto: 0 };
    a.unidades += Math.abs(m.cantidad);
    a.monto += Number(m.monto) || 0;
    porSede.set(codigo, a);
  });
  const sedesOrdenadas = [...porSede.entries()].sort((a, b) => b[1].monto - a[1].monto);

  const valorTotal = variantes.reduce((a, v) => a + (v.costo ?? 0) * v.stockTotal, 0);

  const th = "label-cayla px-4 py-2 text-left text-[9px] text-tinta/40";
  const td = "px-4 py-2.5 text-sm";

  return (
    <div className="space-y-10">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Comercial · últimos {ventanaDias} días</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Decisiones con datos</h1>
      </div>

      {/* Sugerencias de reposición */}
      <div>
        <h2 className="label-cayla mb-3 text-[10px] text-rojo">Qué reponer ya
          <Ayuda titulo="Qué reponer ya">
            Las prendas que se están por agotar según qué tan rápido se venden. El sistema calcula
            cuántas comprar para no quedarte sin ellas antes de que llegue el próximo pedido. Deja de
            comprar por intuición: aquí está el dato.
          </Ayuda>
        </h2>
        {sugerencias.length === 0 ? (
          <p className="font-display border border-tinta/10 bg-papel py-8 text-center text-base italic text-tinta/40">
            Nada urgente — el stock cubre la demanda actual.
          </p>
        ) : (
          <div className="overflow-x-auto border border-tinta/10 bg-papel">
            <table className="w-full">
              <thead className="border-b border-tinta/10">
                <tr>
                  <th className={th}>Prenda</th>
                  <th className={th}>Stock</th>
                  <th className={th}>Vende/día</th>
                  <th className={th}>Compra sugerida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {sugerencias.map((v) => (
                  <tr key={v.varianteId}>
                    <td className={td}>
                      <Link href={`/producto/${v.varianteId}`} className="text-tinta hover:text-rojo">
                        {v.referencia} <span className="text-tinta/45">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                      </Link>
                    </td>
                    <td className={`${td} text-tinta/60`}>{v.stockTotal}</td>
                    <td className={`${td} text-tinta/60`}>{v.velocidadDiaria > 0 ? v.velocidadDiaria : "—"}</td>
                    <td className={`${td} font-display text-lg text-rojo`}>{v.sugerida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-tinta/40">
          Sugerencia = cubrir el punto de reorden con 50% de colchón. Se vuelve más precisa sola, a medida que se acumulan ventas reales.
        </p>
      </div>

      {/* Rotación por familia */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="label-cayla mb-3 text-[10px] text-tinta/55">Rotación por familia
            <Ayuda titulo="Rotación">
              Qué tan rápido se convierte tu mercadería en dinero. Una familia que rota mucho (se
              vende rápido) merece más de tu presupuesto de compra; una que rota poco, menos. Te dice
              dónde meter la plata.
            </Ayuda>
          </h2>
          <div className="overflow-x-auto border border-tinta/10 bg-papel">
            <table className="w-full">
              <thead className="border-b border-tinta/10">
                <tr>
                  <th className={th}>Familia</th>
                  <th className={th}>Vendidas</th>
                  <th className={th}>Monto</th>
                  <th className={th}>Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {familiasOrdenadas.map(([nombre, a]) => (
                  <tr key={nombre}>
                    <td className={`${td} capitalize text-tinta`}>{nombre}</td>
                    <td className={`${td} text-tinta/60`}>{a.unidades}</td>
                    <td className={`${td} text-tinta/60`}>{money(a.monto)}</td>
                    <td className={`${td} text-tinta/60`}>{a.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="label-cayla mb-3 text-[10px] text-tinta/55">Top categorías por venta</h2>
          <div className="overflow-x-auto border border-tinta/10 bg-papel">
            <table className="w-full">
              <thead className="border-b border-tinta/10">
                <tr>
                  <th className={th}>Categoría</th>
                  <th className={th}>Vendidas</th>
                  <th className={th}>Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {categoriasTop.map(([nombre, a]) => (
                  <tr key={nombre}>
                    <td className={`${td} text-tinta`}>{nombre}</td>
                    <td className={`${td} text-tinta/60`}>{a.unidades}</td>
                    <td className={`${td} text-tinta/60`}>{money(a.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Comparativo sedes + valor */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="label-cayla mb-3 text-[10px] text-tinta/55">Ventas por sede</h2>
          <div className="overflow-x-auto border border-tinta/10 bg-papel">
            <table className="w-full">
              <thead className="border-b border-tinta/10">
                <tr>
                  <th className={th}>Sede</th>
                  <th className={th}>Unidades</th>
                  <th className={th}>Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {sedesOrdenadas.length === 0 ? (
                  <tr><td className={`${td} italic text-tinta/40`} colSpan={3}>Sin ventas en la ventana.</td></tr>
                ) : (
                  sedesOrdenadas.map(([codigo, a]) => (
                    <tr key={codigo}>
                      <td className={`${td} text-tinta`}>{codigo}</td>
                      <td className={`${td} text-tinta/60`}>{a.unidades}</td>
                      <td className={`${td} text-tinta/60`}>{money(a.monto)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="label-cayla mb-3 text-[10px] text-tinta/55">Dinero parado en stock (a costo)
            <Ayuda titulo="Dinero parado en stock">
              Cuánta plata tuya está metida en mercadería sin vender, valorada a lo que te costó. Es
              dinero que no rinde hasta que se vende — por eso conviene que rote, no que se acumule.
            </Ayuda>
          </h2>
          <div className="border border-tinta/10 bg-papel p-5">
            <p className="font-display text-4xl text-tinta">{money(valorTotal)}</p>
            <div className="mt-3 space-y-1">
              {familiasOrdenadas
                .filter(([, a]) => a.valorCosto > 0)
                .sort((a, b) => b[1].valorCosto - a[1].valorCosto)
                .map(([nombre, a]) => (
                  <p key={nombre} className="flex justify-between text-sm">
                    <span className="capitalize text-tinta/55">{nombre}</span>
                    <span className="text-tinta">{money(a.valorCosto)}</span>
                  </p>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
