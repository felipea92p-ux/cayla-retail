"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeftRight, KeyRound, MapPin, PauseCircle, PlayCircle } from "lucide-react";
import type { Terminal } from "@/lib/colaboradores";
import { cuandoEntro } from "@/lib/equipo-reglas";
import { Chip } from "@/components/ui/Chip";
import { IconoAparato } from "@/components/ui/IconoAparato";
import { CajonFicha } from "@/components/colaboradores/CajonFicha";
import { PildoraRol } from "@/components/colaboradores/EquipoLista";

// La ficha de una terminal (Felipe 2026-10-05: «Terminales» se ve igual que «Todas»; antes era otra pantalla con su tabla y dos
// cajas de texto). Mismo cajón que la de una persona: una frase y sus acciones a la vista. Cada acción abre su modal de siempre
// (la clave se muestra UNA sola vez, ADR-0162), que vive en `ColaboradoresPanel`, no dentro del cajón (ADR-0128: los eventos de
// un modal abierto desde un cajón suben por el cajón).

function BotonAccion({ icono: Icono, texto, onClick, peligro = false }: { icono: typeof KeyRound; texto: string; onClick: () => void; peligro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid justify-items-center gap-1.5 rounded-xl border px-2 py-3 text-[13px] font-semibold transition-colors duration-200 ease-cayla ${
        peligro ? "border-sand text-rojo hover:border-rojo/50" : "border-sand text-tinta hover:border-taupe"
      }`}
    >
      <Icono aria-hidden className={`h-5 w-5 ${peligro ? "text-rojo" : "text-taupe"}`} strokeWidth={1.6} />
      {texto}
    </button>
  );
}

export function FichaTerminal({
  terminal,
  ahoraIso,
  onClave,
  onCambiarRol,
  onAlternar,
  onCerrar,
}: {
  terminal: Terminal;
  ahoraIso: string;
  onClave: () => void;
  /** Sin ella (roles sin leer), no se ofrece cambiar el rol. */
  onCambiarRol?: () => void;
  onAlternar: () => void;
  onCerrar: () => void;
}) {
  const t = terminal;
  return (
    <CajonFicha clave={t.id} onCerrar={onCerrar}>
      <div className="flex items-center gap-4 pr-9">
        <span className={`grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl bg-tinta text-crema ${t.activo ? "" : "opacity-60"}`}>
          <IconoAparato className="h-8 w-8" />
        </span>
        <div className="min-w-0">
          <Dialog.Title asChild>
            <h2 className="font-display text-[26px] leading-tight text-tinta">{t.nombre}</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-tinta/65">
              <MapPin aria-hidden className="h-3.5 w-3.5" />
              {t.ubicacion_nombre}
              <PildoraRol nombre={t.rol_nombre} lider={false} />
              {!t.activo && <Chip tono="apagado" tachado={false}>Desactivada</Chip>}
            </p>
          </Dialog.Description>
          {t.correo && <p className="mt-1 truncate text-xs text-tinta/55">{t.correo}</p>}
        </div>
      </div>

      <p className="rounded-xl bg-hueso px-4 py-3 text-[15px] leading-snug text-tinta">
        {!t.activo ? (
          <>
            <strong className="font-semibold">Desactivada:</strong> no puede leer ni guardar nada. Su historial se conserva.
          </>
        ) : t.ultimo_acceso ? (
          <>
            Inició sesión por última vez <strong className="font-semibold">{cuandoEntro(t.ultimo_acceso, ahoraIso)}</strong>. Lo que hace lo firma quien atiende.
          </>
        ) : (
          <>
            <strong className="font-semibold">Todavía no ha iniciado sesión.</strong> Escribe su correo y su clave en la caja o la tablet.
          </>
        )}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <BotonAccion icono={KeyRound} texto="Clave nueva" onClick={onClave} />
        {onCambiarRol && <BotonAccion icono={ArrowLeftRight} texto="Cambiar rol" onClick={onCambiarRol} />}
        {t.activo ? (
          <BotonAccion icono={PauseCircle} texto="Desactivar" onClick={onAlternar} peligro />
        ) : (
          <BotonAccion icono={PlayCircle} texto="Reactivar" onClick={onAlternar} />
        )}
      </div>
    </CajonFicha>
  );
}
