"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { cargarEtiquetasClub, guardarPreferencias } from "@/lib/club-ficha-acciones";
import {
  GRUPOS_PREFERENCIA,
  alternar,
  cuantasMarcadas,
  estaMarcada,
  mismasPreferencias,
  opcionesDelGrupo,
  type EtiquetaClub,
  type Preferencias,
} from "@/lib/preferencias-clienta-reglas";

// «Preferencias» de la ficha de una socia (CL-5, ADR-0288 «Actualización 2026-09-30 (f)»; spike del club, `modalFicha`): tres
// listas fijas —Ocasión, Estilo y Evita (un color o una tela)— con los valores de `retail.club_etiquetas`. Se marcan tocando y
// se guardan con UN botón (no en cada toque: cada guardado sube la versión de la ficha y abre el loader). Solo de una socia
// (la base lo exige: `preferencias_solo_socia`); en una ficha archivada se ven y no se tocan.
//
// Vive aparte de `ClientaFichaModal.tsx` a propósito: la ficha la cambian otras tandas del club y aquí solo se engancha con
// una línea. Cuando guarda, le devuelve a la ficha la versión nueva (el candado optimista de «Editar» la necesita).

type Props = {
  clientaId: string;
  version: number;
  guardadas: Preferencias;
  /** Archivada: se ven, no se tocan. */
  soloLectura?: boolean;
  onGuardada: (version: number, preferencias: Preferencias) => void;
};

export function PreferenciasClienta({ clientaId, version, guardadas, soloLectura = false, onGuardada }: Props) {
  const [catalogo, setCatalogo] = useState<EtiquetaClub[] | null>(null);
  const [marcadas, setMarcadas] = useState<Preferencias>(guardadas);
  const [base, setBase] = useState<Preferencias>(guardadas);
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();

  // Si la ficha trae otras preferencias (se volvió a leer tras otra acción), se toman, salvo que haya algo sin guardar.
  if (!mismasPreferencias(guardadas, base) && mismasPreferencias(marcadas, base)) {
    setBase(guardadas);
    setMarcadas(guardadas);
  }

  useEffect(() => {
    let vigente = true;
    void cargarEtiquetasClub().then(({ etiquetas, error }) => {
      // Sin catálogo (la base sin la tanda 1f) no se dibuja nada: mejor nada que una lista vacía que parece rota.
      if (vigente) setCatalogo(error ? [] : etiquetas);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (catalogo === null || (catalogo.length === 0 && cuantasMarcadas(guardadas) === 0)) return null;

  const cambiadas = !mismasPreferencias(marcadas, base);

  async function guardar() {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién lo hace.");
      return;
    }
    setGuardando(true);
    const { version: nueva, error } = await guardarPreferencias(clientaId, marcadas, version, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error || nueva === null) {
      avisar.error(traducirError(error, "guardar sus preferencias"));
      return;
    }
    setBase(marcadas);
    onGuardada(nueva, marcadas);
    avisar.exito("Preferencias guardadas");
  }

  return (
    <div className="card-cayla space-y-3 p-4" data-campo="preferencias">
      <p className="label-cayla text-[11px] text-tinta/65">Preferencias</p>
      {GRUPOS_PREFERENCIA.map((g) => {
        const opciones = opcionesDelGrupo(catalogo, g.clave, marcadas);
        const conAlgo = (marcadas[g.clave] ?? []).length > 0;
        // Guía de foco (ADR-0284, regla 4): un grupo que ya venía marcado no lleva marca (la ficha no se llena de ✓, como
        // el spike); uno vacío dice «opcional» y, al marcarlo aquí, ✓. Nada de esto es un «falta»: son opcionales.
        const venia = (base[g.clave] ?? []).length > 0;
        return (
          <div key={g.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1.5" role="group" aria-label={g.titulo}>
            <span className="label-cayla w-32 shrink-0 text-[10.5px] text-tinta/55">
              <ConMarca estado={soloLectura || venia ? null : conAlgo ? "hecho" : "opcional"}>{g.titulo}</ConMarca>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {opciones.map((o) => {
                const marcada = estaMarcada(marcadas, g.clave, o.valor);
                return (
                  <button
                    key={o.valor}
                    type="button"
                    aria-pressed={marcada}
                    disabled={soloLectura || guardando || (!o.enLaLista && !marcada)}
                    title={o.enLaLista ? undefined : "Ya no está en la lista: se conserva mientras siga marcada."}
                    onClick={() => setMarcadas((p) => alternar(p, g.clave, o.valor))}
                    className={`h-8 rounded-md border px-3 text-xs transition-colors duration-200 ease-cayla disabled:cursor-not-allowed ${
                      marcada ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel text-tinta/70 hover:bg-sand/40"
                    } ${o.enLaLista ? "" : "border-dashed"}`}
                  >
                    {o.valor}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {cambiadas && !soloLectura && (
        <div className="anim-revelar flex flex-wrap items-center justify-end gap-3 border-t border-sand pt-3">
          {!responsable.listo && <ComboResponsable control={responsable} compacto className="mr-auto" />}
          <Boton type="button" className="!py-2" onClick={() => setMarcadas(base)} disabled={guardando}>
            Deshacer
          </Boton>
          <Boton type="button" peso="primario" className="!py-2" onClick={guardar} cargando={guardando}>
            Guardar preferencias
          </Boton>
        </div>
      )}
      <p className="text-xs text-tinta/55">Solo listas, sin notas libres: así no se guardan datos de salud (Ley 29733).</p>
    </div>
  );
}
