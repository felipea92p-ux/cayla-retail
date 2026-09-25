"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CabeceraBloque, CampoFin, InputFin, Superficie } from "@/components/finanzas/kit";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { validarParametrosFinanzas, type ParametrosFinanzas } from "@/lib/configuracion-reglas";

// Configuración ▸ Caja y avisos (spike `cfgCaja`, 20260925103000): el mínimo de caja que vigilan el Flujo y el Resumen, y
// cuándo el sistema llama la atención. Cada casilla se guarda sola al salir de ella, firmada con el responsable.

type Borrador = { minimoCaja: string; avisoGastoPct: string; avisoVenceDias: string };
const aBorrador = (p: ParametrosFinanzas): Borrador => ({ minimoCaja: String(p.minimoCaja), avisoGastoPct: String(p.avisoGastoPct), avisoVenceDias: String(p.avisoVenceDias) });

export function ConfiguracionCajaAvisos({ parametros }: { parametros: ParametrosFinanzas | null }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const inicial = parametros ? aBorrador(parametros) : { minimoCaja: "", avisoGastoPct: "", avisoVenceDias: "" };
  const [b, setB] = useState<Borrador>(inicial);
  const [base, setBase] = useState(inicial);
  if (parametros && JSON.stringify(aBorrador(parametros)) !== JSON.stringify(base)) {
    setBase(aBorrador(parametros));
    setB(aBorrador(parametros));
  }

  if (!parametros) {
    return <p className="nota-cayla">Falta pegar en la base la migración de Caja y avisos (20260925103000).</p>;
  }

  async function guardar(campo: keyof Borrador) {
    if (b[campo].trim() === base[campo].trim()) return;
    const v = validarParametrosFinanzas(b);
    if (!v.ok) {
      avisar.error(v.error);
      setB(base);
      return;
    }
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      setB(base);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("guardar_parametros_finanzas" as never, { p_minimo_caja: v.valor.minimoCaja, p_aviso_gasto_pct: v.valor.avisoGastoPct, p_aviso_vence_dias: v.valor.avisoVenceDias } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "guardar la configuración"));
      setB(base);
      return;
    }
    avisar.exito(
      campo === "minimoCaja"
        ? `Mínimo de caja: S/ ${Math.round(v.valor.minimoCaja).toLocaleString("es-PE")}.`
        : campo === "avisoGastoPct"
          ? `Un gasto avisa si supera su promedio en ${v.valor.avisoGastoPct} %.`
          : `Los vencimientos se avisan con ${v.valor.avisoVenceDias} días.`,
    );
    router.refresh();
  }

  const casilla = (campo: keyof Borrador, etiqueta: string, ayuda: string, pre?: string, suf?: string) => (
    <CampoFin etiqueta={etiqueta} htmlFor={`cfg-${campo}`} ayuda={ayuda}>
      <div className="fin-con-unidad">
        {pre && <span>{pre}</span>}
        <InputFin
          id={`cfg-${campo}`}
          inputMode="decimal"
          value={b[campo]}
          onChange={(e) => setB((x) => ({ ...x, [campo]: e.target.value }))}
          onBlur={() => guardar(campo)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          disabled={guardando}
        />
        {suf && <span>{suf}</span>}
      </div>
    </CampoFin>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">Cada casilla se guarda sola al salir de ella, a nombre de quien figure como responsable. Cada cambio queda en la historia.</p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>
      <section className="fin-dos-col">
        <Superficie pad className="anim-sube">
          <CabeceraBloque titulo="Caja" bajada="El piso que no quieres perforar." />
          {casilla("minimoCaja", "Mínimo de caja", "Si la proyección de alguna semana baja de aquí, el Resumen y el Flujo de caja avisan.", "S/")}
        </Superficie>
        <Superficie pad className="anim-sube">
          <CabeceraBloque titulo="Avisos" bajada="Cuándo el sistema te llama la atención." />
          {casilla("avisoGastoPct", "Un gasto está «fuera de lo normal» si supera su promedio en", "Compara con los últimos 6 meses del mismo proveedor y tienda.", undefined, "%")}
          {casilla("avisoVenceDias", "Avisar los vencimientos con", "Las facturas que vencen dentro de ese plazo suben al Resumen.", undefined, "días")}
        </Superficie>
      </section>
    </>
  );
}
