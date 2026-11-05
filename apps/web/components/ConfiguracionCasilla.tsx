"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { VISTO_MS, cambioLaCasilla } from "@/lib/configuracion-casilla";

// La casilla de Configuración ▸ Metas y ▸ Empresa y tiendas (ADR-0195 F1), compartida por las metas de la semana tipo, las de cada mes y las de
// cada fecha (ADR-0435): un número que se guarda SOLO al salir de ella si su texto cambió.
// Con el vidrio (ADR-0596, Felipe 2026-11-02, docs/maquetas/configuracion-vidrio-2026-11/): la casilla es el pozo de las hojas en chico
// («A · Pozo en la celda»: con el cursor adentro sube a vidrio y dibuja su hilo) y, si la base dijo que sí, un ✓ verde se dibuja junto
// al número y se va solo en 1,6 s («A · Visto en la celda»). El aviso de la esquina sigue saliendo: dice qué más cambió (la meta del mes).

/** Lo que cada casilla llama para guardar: firma con el responsable, avisa y refresca. `true` si la base lo aceptó. */
export type Guardar = (hacer: () => PromiseLike<{ error: unknown; data?: unknown }>, que: string, listo: string | ((data: unknown) => string)) => Promise<boolean>;

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
    const { error, data } = (await firmar(hacer() as never, responsable.firma())) as { error: unknown; data?: unknown };
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    avisar.exito(typeof listo === "function" ? listo(data) : listo);
    router.refresh();
    return true;
  };

  return { responsable, guardando, guardar };
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

/**
 * Una casilla numérica que se guarda al salir (blur) si su texto cambió. Si el guardado falla, vuelve a lo de antes. Mientras guarda no se edita (/chaos 2026-10-14): con la red
 * lenta, dos cambios seguidos llegaban en desorden y quedaba el primero aunque se escribió el segundo.
 */
export function Casilla({ valor, etiqueta, ancho, alGuardar, placeholder = "—" }: { valor: string; etiqueta: string; ancho: string; alGuardar: (nuevo: string) => Promise<boolean>; placeholder?: string }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
  const [guardando, setGuardando] = useState(false);
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
        readOnly={guardando}
        aria-busy={guardando || undefined}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape" && !guardando) setT(valor);
        }}
        onBlur={async () => {
          if (guardando || !cambioLaCasilla(t, valor)) return;
          setGuardando(true);
          const ok = await alGuardar(t);
          setGuardando(false);
          if (ok) visto.marcar();
          else setT(valor);
        }}
        className={`fin-control fin-num inline-block ${ancho}`}
      />
    </MarcoCasilla>
  );
}

/** Una casilla que NO se guarda sola: lo tipeado vive afuera hasta que se aprieta «Guardar». Enter guarda; Escape devuelve lo guardado. */
export function CasillaManual({ valor, guardado, onValor, onEnter, etiqueta, ancho, placeholder = "—", bloqueada }: { valor: string; guardado: string; onValor: (nuevo: string) => void; onEnter: () => void; etiqueta: string; ancho: string; placeholder?: string; bloqueada: boolean }) {
  return (
    <MarcoCasilla vez={0}>
      <input
        aria-label={etiqueta}
        inputMode="decimal"
        value={valor}
        placeholder={placeholder}
        readOnly={bloqueada}
        aria-busy={bloqueada || undefined}
        onChange={(e) => onValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
          if (e.key === "Escape" && !bloqueada) onValor(guardado);
        }}
        className={`fin-control fin-num inline-block ${ancho}`}
      />
    </MarcoCasilla>
  );
}
