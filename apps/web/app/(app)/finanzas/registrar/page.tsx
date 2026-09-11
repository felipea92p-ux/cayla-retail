import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/server";
import { FinanzasNav } from "@/components/FinanzasNav";
import { RegistroContableForm } from "@/components/RegistroContableForm";

// Registro simple → partida doble (Fase 2 del motor contable). El Líder describe
// el hecho en su idioma y el sistema arma el asiento cuadrado por detrás.
export default async function RegistrarContablePage() {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const supabase = await createClient();
  const [cuentasRes, todasSedes] = await Promise.all([
    supabase
      .from("cuentas_contables")
      .select("codigo, nombre, elemento, es_contra, orden")
      .eq("activo", true)
      .order("orden"),
    getSedes(),
  ]);

  const cuentas = cuentasRes.data ?? [];
  // Sin `s.activo`: esa columna es de Dynamic (`retail.sedes` la expone como vista sobre
  // `public.sedes.activa`), y su criterio no es el de retail — la tienda de Lima está
  // abierta y operando, pero allá figura inactiva. Filtrar por ella dejaba una sede donde
  // se puede vender pero no cargarle el alquiler, que es el estado inconsistente que el
  // principio 2 prohíbe. Decisión de Felipe, 2026-09-10: retail no mira ese flag (ADR-0029).
  // El día que se cierre una sede de verdad, esto se resuelve con una columna propia en
  // `retail.sede_meta` — NO volviendo a colgarse del flag de Dynamic.
  const unidades = todasSedes.filter((s) => (["tienda", "fabrica", "corporativo"] as string[]).includes(s.tipo));

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Finanzas</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Registrar</h1>
        <p className="mt-1 text-sm text-tinta/70">
          Dilo en simple; el sistema arma la contabilidad de doble entrada por ti.
        </p>
      </div>

      <FinanzasNav />

      {cuentas.length === 0 ? (
        <div className="card-cayla p-6">
          <p className="font-display text-base italic text-tinta/70">
            Aún no está el plan de cuentas.
          </p>
          <p className="mt-1 text-xs text-tinta/65">
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
