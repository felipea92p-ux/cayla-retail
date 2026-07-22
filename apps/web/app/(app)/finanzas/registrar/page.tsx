import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { FinanzasNav } from "@/components/FinanzasNav";
import { RegistroContableForm } from "@/components/RegistroContableForm";

// Registro simple → partida doble (Fase 2 del motor contable). El Líder describe
// el hecho en su idioma y el sistema arma el asiento cuadrado por detrás.
export default async function RegistrarContablePage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const supabase = await createClient();
  const [cuentasRes, sedesRes] = await Promise.all([
    supabase
      .from("cuentas_contables")
      .select("codigo, nombre, elemento, es_contra, orden")
      .eq("activo", true)
      .order("orden"),
    supabase
      .from("sedes")
      .select("id, codigo, nombre, tipo")
      .eq("activo", true)
      .in("tipo", ["tienda", "fabrica", "corporativo"])
      .order("codigo"),
  ]);

  const cuentas = cuentasRes.data ?? [];
  const unidades = sedesRes.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Finanzas</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Registrar</h1>
        <p className="mt-1 text-sm text-tinta/55">
          Dilo en simple; el sistema arma la contabilidad de doble entrada por ti.
        </p>
      </div>

      <FinanzasNav />

      {cuentas.length === 0 ? (
        <div className="card-cayla p-6">
          <p className="font-display text-base italic text-tinta/50">
            Aún no está el plan de cuentas.
          </p>
          <p className="mt-1 text-xs text-tinta/45">
            Corre la migración 0020 en Supabase para crear las cuentas, y vuelve a esta pantalla.
          </p>
        </div>
      ) : (
        <div className="max-w-xl">
          <RegistroContableForm
            unidades={unidades}
            cuentas={cuentas}
            defaultUnidadId={persona.sedeId}
          />
        </div>
      )}
    </div>
  );
}
