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
import { etiquetaReparto, textoPct, validarPct, type FilaReparto } from "@/lib/reparto-claure-reglas";

// Configuración ▸ Gastos con CLAURE (ADR-0560, actividad 17): qué parte de cada categoría de gasto de Tienda Lima es de CLAURE (la empresa de Claudia). Esa parte baja lo que se le debe y sale
// del gasto de CAYLA. Como en «Caja y avisos», cada casilla se guarda sola al salir de ella, firmada con el responsable, y el cambio queda en la historia. Solo el líder lo ve y lo cambia.

export function ConfiguracionRepartoClaure({ filas }: { filas: FilaReparto[] | null }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const base = Object.fromEntries((filas ?? []).map((f) => [f.categoria, textoPct(f.pct)]));
  const [firmaBase, setFirmaBase] = useState(JSON.stringify(base));
  const [valores, setValores] = useState<Record<string, string>>(base);
  // Cuando la pantalla se rehace con lo que guardó la base, las casillas vuelven a mostrar lo guardado.
  if (JSON.stringify(base) !== firmaBase) {
    setFirmaBase(JSON.stringify(base));
    setValores(base);
  }

  if (filas === null) {
    return <p className="nota-cayla">No se pudo leer el reparto de gastos con CLAURE. Revisa que esté pegada en la base la migración 20261029161000 y vuelve a entrar.</p>;
  }

  async function guardar(f: FilaReparto) {
    const escrito = valores[f.categoria] ?? "";
    if (escrito.trim() === base[f.categoria]) return;
    const v = validarPct(escrito);
    if (!v.ok) {
      avisar.error(v.error);
      setValores((x) => ({ ...x, [f.categoria]: base[f.categoria] ?? "" }));
      return;
    }
    if (v.valor === f.pct) {
      setValores((x) => ({ ...x, [f.categoria]: base[f.categoria] ?? "" }));
      return;
    }
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      setValores((x) => ({ ...x, [f.categoria]: base[f.categoria] ?? "" }));
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("guardar_reparto_claure" as never, { p_categoria: f.categoria, p_pct: v.valor } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "guardar el reparto de gastos"));
      setValores((x) => ({ ...x, [f.categoria]: base[f.categoria] ?? "" }));
      return;
    }
    avisar.exito(`${f.nombre}: ${etiquetaReparto(v.valor)}.`);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-xl text-[13px] text-taupe">
          Cada casilla se guarda sola al salir de ella, a nombre de quien figure como responsable, y queda en la historia. Cambiar un porcentaje vale también para los gastos de antes: la parte de CLAURE se calcula con el de hoy.
        </p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>
      <Superficie pad className="anim-sube" guia="config.claure-reparto">
        <CabeceraBloque
          titulo="Gastos que se reparten con CLAURE"
          bajada="Qué parte de cada gasto de la tienda es de Claudia: 0 es todo de CAYLA, 100 es todo de CLAURE. Esa parte baja lo que se le debe."
        />
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((f) => (
            <CampoFin key={f.categoria} etiqueta={f.nombre} htmlFor={`reparto-${f.categoria}`} ayuda={`${etiquetaReparto(Number(valores[f.categoria]?.replace(",", ".")) || 0)}${f.ejemplos ? ` · ${f.ejemplos}` : ""}`}>
              <div className="fin-con-unidad">
                <InputFin
                  id={`reparto-${f.categoria}`}
                  inputMode="decimal"
                  value={valores[f.categoria] ?? ""}
                  onChange={(e) => setValores((x) => ({ ...x, [f.categoria]: e.target.value }))}
                  onBlur={() => guardar(f)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  disabled={guardando}
                />
                <span>%</span>
              </div>
            </CampoFin>
          ))}
        </div>
      </Superficie>
    </>
  );
}
