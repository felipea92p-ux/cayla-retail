import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getCuadreEfectivo } from "@/lib/finanzas-nucleo";
import { getSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/server";
import { FinanzasNav } from "@/components/FinanzasNav";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { EfectivoPanel } from "@/components/EfectivoPanel";

// Cuadre de efectivo continuo (F1): responde en todo momento "¿cuánto efectivo
// DEBERÍA haber en cada tienda?" — lo que SINATRA nunca pudo responder por día
// (sus cuadres daban -S/6,122 acumulados sin fecha de origen).
export default async function EfectivoPage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  // La cabecera y la navegación de Finanzas no dependen de ninguna consulta.
  // Antes esperaban a que llegaran todos los datos de la pantalla. — ADR-0021.
  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Finanzas</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Cuadre de efectivo</h1>
        <p className="mt-1 text-sm text-tinta/70">
          Lo que debería haber en cada cajón, siempre al día. Registra el saldo inicial con
          &ldquo;Ajuste&rdquo; la primera vez.
        </p>
      </div>

      <FinanzasNav />

      <Suspense fallback={<EsqueletoTabla filas={4} />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

/** Todo lo que sí espera la red. */
async function Contenido() {

  const supabase = await createClient();
  const [cuadre, todasSedes, { data: depositos }] = await Promise.all([
    getCuadreEfectivo(),
    getSedes(),
    supabase
      .from("depositos_bancarios")
      .select("id, fecha, monto, nota, sede_id")
      .order("fecha", { ascending: false })
      .limit(15),
  ]);
  const sedes = todasSedes.filter((s) => s.tipo === "tienda");
  return (
    <>

      <EfectivoPanel cuadre={cuadre} sedes={sedes ?? []} />

      <div>
        <h2 className="label-cayla mb-3 text-[11px] text-tinta/65">Últimos depósitos al banco</h2>
        {!depositos || depositos.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Aún no hay depósitos registrados. Cuando lleves el efectivo al banco, anótalo con
            «Depósito al banco» — es lo que baja el efectivo que el sistema espera encontrar en la tienda.
          </p>
        ) : (
          <div className="divide-y divide-tinta/5 card-cayla">
            {depositos.map((d) => {
              const sede = (sedes ?? []).find((s) => s.id === d.sede_id);
              return (
                <div key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-tinta/70">{d.fecha}</span>
                  <span className="font-medium text-tinta">{sede?.codigo}</span>
                  <span className="text-tinta/70">{d.nota ?? "—"}</span>
                  <span className="font-medium text-tinta">S/{Number(d.monto).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
