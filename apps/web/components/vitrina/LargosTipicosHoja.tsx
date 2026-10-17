"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeTipicos } from "@/lib/vitrina-probador-guia";
import { avisoDeRedondeo, errorDeLargo, leerLargo, type TipicoDeCategoria } from "@/lib/vitrina-probador-reglas";

/**
 * Los largos típicos de Vitrina ▸ Probador (ADR-0434, actividad 3): el largo con que el probador dibuja una prenda de cada categoría
 * hasta que se anote el suyo. Vacío: la categoría no tiene típico y sus prendas entran solo con su largo propio (así nacen vestidos,
 * faldas, conjuntos y enterizos: Felipe, 2026-10-16). Se guarda todo junto y firma el «Responsable» (ADR-0162).
 */
export function LargosTipicosHoja({
  tipicos,
  onClose,
  onGuardado,
}: {
  tipicos: TipicoDeCategoria[];
  onClose: () => void;
  onGuardado: (tipicos: TipicoDeCategoria[]) => void;
}) {
  const responsable = useResponsable();
  const [escritos, setEscritos] = useState<Record<string, string>>(() =>
    Object.fromEntries(tipicos.map((t) => [t.categoriaId, t.largo === null ? "" : String(t.largo)])),
  );
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);
  // Primero las categorías con prendas en la web (las que cambian algo hoy), después las demás; cada grupo, por nombre.
  const enOrden = [...tipicos].sort((a, b) => Number(b.prendas > 0) - Number(a.prendas > 0) || a.nombre.localeCompare(b.nombre, "es"));
  const leidos = enOrden.map((t) => ({ t, leido: leerLargo(escritos[t.categoriaId] ?? "") }));
  const malEscritos = leidos.filter((x) => "error" in x.leido).length;
  const cambios = leidos.filter((x) => !("error" in x.leido) && x.leido.valor !== x.t.largo);
  const guia = useGuiaCampos(camposDeTipicos({ malEscritos, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar) return;
    if (cambios.length === 0) {
      onClose();
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    const p_largos = cambios.map((x) => ({ categoria_id: x.t.categoriaId, largo_cm: "error" in x.leido ? null : x.leido.valor }));
    const { error } = await firmar(createClient().rpc("vitrina_guardar_largos_tipicos", { p_largos }), responsable.firma());
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(errorDeLargo(`${error.message ?? ""} ${error.hint ?? ""}`) ?? traducirError(error, "guardar los largos típicos"));
      return;
    }
    onGuardado(tipicos.map((t) => {
      const x = leidos.find((l) => l.t.categoriaId === t.categoriaId);
      return x && !("error" in x.leido) ? { ...t, largo: x.leido.valor } : t;
    }));
    avisar.exito(cambios.length === 1 ? "Listo: cambió 1 largo típico." : `Listo: cambiaron ${cambios.length} largos típicos.`);
    onClose();
  }

  return (
    <Modal
      titulo="Largos típicos"
      subtitulo="Con este largo sale una prenda en el probador hasta que se anote el suyo. Vacío: esa categoría no tiene típico y sus prendas entran solo con su largo."
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      bloqueado={guardando}
    >
      <form onSubmit={guardar} className="space-y-5">
        <CampoGuiado id="tipicos" guia={guia} titulo="Por categoría" ayuda="En cm, de arriba abajo como cae puesta">
          <ul className="grid gap-x-4 sm:grid-cols-2" data-guia="tipicos.lista" aria-label="Los largos típicos por categoría">
            {leidos.map(({ t, leido }) => (
              <li key={t.categoriaId}>
                <CampoTexto
                  etiqueta={`${t.nombre}${t.prendas ? ` · ${t.prendas} en la web` : ""}`}
                  inputMode="numeric"
                  value={escritos[t.categoriaId] ?? ""}
                  onChange={(e) => setEscritos((m) => ({ ...m, [t.categoriaId]: e.target.value }))}
                  placeholder="Sin típico" // sugerir-fijo: dice qué pasa con la caja vacía; un «Ej.» invitaba a ponerles típico a vestidos y faldas (/formidable)
                  tono={"error" in leido ? "error" : undefined}
                  pie={"error" in leido ? leido.error : (avisoDeRedondeo(escritos[t.categoriaId] ?? "") ?? undefined)}
                  disabled={guardando}
                />
              </li>
            ))}
          </ul>
        </CampoGuiado>

        <CampoGuiado id="responsable" guia={guia}>
          <div data-guia="tipicos.responsable">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </div>
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} listo={cambios.length === 0 ? "No cambiaste nada." : "Todo listo."} />
          <div className="ml-auto pie-acciones" data-guia="tipicos.guardar">
            <Boton type="button" onClick={onClose} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Guardar
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
