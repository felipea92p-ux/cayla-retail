import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getCuadreEfectivo } from "@/lib/finanzas-nucleo";
import { createClient } from "@/lib/supabase/server";
import { FinanzasNav } from "@/components/FinanzasNav";
import { EfectivoPanel } from "@/components/EfectivoPanel";

// Cuadre de efectivo continuo (F1): responde en todo momento "¿cuánto efectivo
// DEBERÍA haber en cada tienda?" — lo que SINATRA nunca pudo responder por día
// (sus cuadres daban -S/6,122 acumulados sin fecha de origen).
export default async function EfectivoPage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const supabase = await createClient();
  const [cuadre, { data: sedes }, { data: depositos }] = await Promise.all([
    getCuadreEfectivo(),
    supabase.from("sedes").select("id, codigo").eq("tipo", "tienda").order("codigo"),
    supabase
      .from("depositos_bancarios")
      .select("id, fecha, monto, nota, sedes(codigo)")
      .order("fecha", { ascending: false })
      .limit(15),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Finanzas</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Cuadre de efectivo</h1>
        <p className="mt-1 text-sm text-tinta/50">
          Lo que debería haber en cada cajón, siempre al día. Registra el saldo inicial con
          &ldquo;Ajuste&rdquo; la primera vez.
        </p>
      </div>

      <FinanzasNav />

      <EfectivoPanel cuadre={cuadre} sedes={sedes ?? []} />

      <div>
        <h2 className="label-cayla mb-3 text-[10px] text-tinta/45">Últimos depósitos al banco</h2>
        {!depositos || depositos.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/40">
            Aún no hay depósitos registrados.
          </p>
        ) : (
          <div className="divide-y divide-tinta/5 card-cayla">
            {depositos.map((d) => {
              const sede = Array.isArray(d.sedes) ? d.sedes[0] : d.sedes;
              return (
                <div key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-tinta/55">{d.fecha}</span>
                  <span className="font-medium text-tinta">{sede?.codigo}</span>
                  <span className="text-tinta/55">{d.nota ?? "—"}</span>
                  <span className="font-medium text-tinta">S/{Number(d.monto).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
