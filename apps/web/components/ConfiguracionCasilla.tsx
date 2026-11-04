"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { VISTO_MS, cambioLaCasilla } from "@/lib/configuracion-casilla";

// La casilla de Configuración ▸ Metas y ▸ Empresa y tiendas (ADR-0195 F1), compartida por las metas de la semana tipo, las de cada mes y las de
// cada fecha (ADR-0435): un número que se guarda SOLO al salir de ella si su texto cambió.
// Con el vidrio (ADR-0596, Felipe 2026-11-02, docs/maquetas/configuracion-vidrio-2026-11/): la casilla es el pozo de las hojas en chico
// («A · Pozo en la celda»: con el cursor adentro sube a vidrio y dibuja su hilo) y, si la base dijo que sí, un ✓ verde se dibuja junto
// al número y se va solo en 1,6 s («A · Visto en la celda»). El aviso de la esquina sigue saliendo: dice qué más cambió (la meta del mes).

/** Lo que cada casilla llama para guardar: firma con el responsable, avisa y refresca. `true` si la base lo aceptó. */
export type Guardar = (hacer: () => PromiseLike<{ error: unknown }>, que: string, listo: string) => Promise<boolean>;

/** El guardado de las casillas: exige el responsable, firma, avisa y refresca. Lo comparten Metas y Empresa y tiendas. */
export function useGuardarCasilla() {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);

  const guardar: Guardar = async (hacer, que, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(hacer() as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    avisar.exito(listo);
    router.refresh();
    return true;
  };

  return { responsable, guardando, guardar };
}

/** La frase de «se guarda sola» con el combo de quién firma. `guia`: el ancla de la guía interactiva, si esta fila es la que explica. */
export function FilaResponsable({ responsable, guardando, guia }: { responsable: ReturnType<typeof useResponsable>; guardando: boolean; guia?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3" data-guia={guia}>
      <p className="max-w-md text-sm text-taupe">Cada casilla se guarda sola al salir de ella y queda en la historia.</p>
      <div className="w-full max-w-xs">
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </div>
    </div>
  );
}

/** El ✓ de «se guardó»: `vez` cuenta los guardados (0 = no se ve). Cada guardado nuevo lo vuelve a dibujar desde cero (otra `key`). */
export function useVistoGuardado() {
  const [vez, setVez] = useState(0);
  useEffect(() => {
    if (!vez) return;
    const t = window.setTimeout(() => setVez(0), VISTO_MS);
    return () => window.clearTimeout(t);
  }, [vez]);
  return { vez, marcar: () => setVez((v) => v + 1) };
}

/** El marco de una casilla de la planilla: el pozo (la clase `cfg-casilla`, en `estilos/vidrio/campos-y-botones.css`), su hilo y su ✓.
 *  Solo esta pestaña lo usa: el `fin-control` del resto de Finanzas no cambia. */
export function MarcoCasilla({ vez, children }: { vez: number; children: ReactNode }) {
  return (
    <span className="cfg-casilla">
      {children}
      <span className="cfg-casilla-hilo" aria-hidden />
      {vez > 0 && (
        <span key={vez} className="cfg-casilla-visto" aria-hidden>
          <Check /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

/** Una casilla numérica que se guarda al salir (blur) si su texto cambió. Si el guardado falla, vuelve a lo de antes. */
export function Casilla({ valor, etiqueta, ancho, alGuardar, placeholder = "—" }: { valor: string; etiqueta: string; ancho: string; alGuardar: (nuevo: string) => Promise<boolean>; placeholder?: string }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
  const visto = useVistoGuardado();
  // Si la base trae otro valor (otro guardado, un refresco), la casilla lo toma.
  if (valor !== antes) {
    setAntes(valor);
    setT(valor);
  }
  return (
    <MarcoCasilla vez={visto.vez}>
      <input
        aria-label={etiqueta}
        inputMode="decimal"
        value={t}
        placeholder={placeholder}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setT(valor);
        }}
        onBlur={async () => {
          if (!cambioLaCasilla(t, valor)) return;
          const ok = await alGuardar(t);
          if (ok) visto.marcar();
          else setT(valor);
        }}
        className={`fin-control fin-num inline-block ${ancho}`}
      />
    </MarcoCasilla>
  );
}
