import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getPatrimonio } from "@/lib/finanzas-nucleo";
import { FinanzasNav } from "@/components/FinanzasNav";
import { PatrimonioEditor } from "@/components/PatrimonioEditor";

function money(n: number) {
  return "S/" + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ETIQUETA_CATEGORIA: Record<string, string> = {
  muebles: "Muebles y enseres",
  equipos: "Equipos",
  intangible: "Intangibles",
  banco: "Cuenta bancaria",
  otro_activo: "Otro activo",
  deuda_proveedor: "Deuda a proveedor",
  prestamo: "Préstamo",
  impuesto: "Impuesto por pagar",
  otro_pasivo: "Otra deuda",
};

// Patrimonio v1: cuánto vale CAYLA hoy. Efectivo e inventario los calcula el
// sistema; banco/deudas/activos fijos los mantiene el Líder como partidas.
export default async function PatrimonioPage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const p = await getPatrimonio(persona);
  if (!p) redirect("/");

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Finanzas</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Patrimonio</h1>
      </div>

      <FinanzasNav />

      <div className="border border-tinta/10 bg-papel p-6 text-center">
        <p className="label-cayla text-[10px] text-tinta/45">Patrimonio neto</p>
        <p className={`font-display mt-2 text-5xl ${p.patrimonioNeto >= 0 ? "text-tinta" : "text-rojo"}`}>
          {money(p.patrimonioNeto)}
        </p>
        <p className="mt-2 text-sm text-tinta/45">
          Activos {money(p.totalActivos)} − Pasivos {money(p.totalPasivos)}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="label-cayla mb-3 text-[10px] text-tinta/45">Activos</h2>
          <div className="divide-y divide-tinta/5 border border-tinta/10 bg-papel">
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-tinta/60">Efectivo en sedes (teórico)</span>
              <span className="font-medium text-tinta">{money(p.efectivoTeorico)}</span>
            </div>
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-tinta/60">Inventario a costo</span>
              <span className="font-medium text-tinta">{money(p.inventarioCosto)}</span>
            </div>
            {p.itemsActivo.map((i) => (
              <div key={i.id} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-tinta/60">
                  {i.nombre}
                  {i.categoria && <span className="label-cayla ml-2 text-[8px] text-taupe">{ETIQUETA_CATEGORIA[i.categoria] ?? i.categoria}</span>}
                  {i.nota && <span className="text-tinta/35"> · {i.nota}</span>}
                </span>
                <span className="font-medium text-tinta">{money(i.monto)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="label-cayla mb-3 text-[10px] text-tinta/45">Pasivos</h2>
          {p.itemsPasivo.length === 0 ? (
            <p className="font-display border border-tinta/10 bg-papel py-8 text-center text-base italic text-tinta/40">
              Sin deudas registradas.
            </p>
          ) : (
            <div className="divide-y divide-tinta/5 border border-tinta/10 bg-papel">
              {p.itemsPasivo.map((i) => (
                <div key={i.id} className="flex justify-between px-4 py-3 text-sm">
                  <span className="text-tinta/60">{i.nombre}{i.nota && <span className="text-tinta/35"> · {i.nota}</span>}</span>
                  <span className="font-medium text-rojo">−{money(i.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PatrimonioEditor />

      <p className="text-xs text-tinta/40">
        Los dos primeros activos los calcula el sistema en vivo. Las demás partidas (cuentas
        bancarias, deudas, activos fijos) las mantienes tú con &ldquo;+ Agregar partida&rdquo;.
      </p>
    </div>
  );
}
