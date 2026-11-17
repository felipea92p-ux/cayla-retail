"use client";

import { useId, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Feather, Moon, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { cambiarTema, suscribirTema, temaDelDocumento } from "@/lib/tema-cliente";
import { cambiarMovimiento, movimientoDelDocumento, suscribirMovimiento } from "@/lib/movimiento-cliente";
import { cambiarLiviano, livianoDelDocumento, livianoEsAutomaticoAqui, suscribirLiviano, volverLivianoAutomatico } from "@/lib/liviano-cliente";
import { TEMA_POR_DEFECTO } from "@/lib/tema-reglas";
import { MOVIMIENTO_POR_DEFECTO } from "@/lib/movimiento-reglas";

// «Apariencia» (Felipe 2026-11-17, ficha `docs/milimetro/apariencia.md`): la hoja que junta lo que cambia CÓMO SE VE el ERP en este aparato
// —modo oscuro (ADR-0336), animaciones (ADR-0625) y modo liviano (ADR-0674)—. Se abre desde la fila «Apariencia» al pie del menú, la ve
// toda cuenta (también una terminal, que no tiene «Mi perfil») y no es un módulo (ADR-0306): son preferencias del aparato, no de la persona.
//
// Todo se aplica al tocar: no hay «Guardar», por eso la hoja solo lleva su × (`conCerrar`, familia `modal`). Cada ajuste lee el atributo de
// <html> que el script del `<head>` ya fijó, igual que lo hacían los botones de la cabecera: el servidor pinta el valor de fábrica y
// `useSyncExternalStore` corrige al hidratar.

/** `alCerrarEnfocar`: la fila que la abrió. Al cerrar, el foco vuelve ahí (con el teclado no se pierde al inicio de la página). */
export function HojaApariencia({ onClose, alCerrarEnfocar }: { onClose: () => void; alCerrarEnfocar?: RefObject<HTMLElement | null> }) {
  const tema = useSyncExternalStore(suscribirTema, temaDelDocumento, () => TEMA_POR_DEFECTO);
  const movimiento = useSyncExternalStore(suscribirMovimiento, movimientoDelDocumento, () => MOVIMIENTO_POR_DEFECTO);
  const liviano = useSyncExternalStore(suscribirLiviano, livianoDelDocumento, () => "no" as const);
  const automatico = useSyncExternalStore(suscribirLiviano, livianoEsAutomaticoAqui, () => true);

  return (
    <Modal titulo="Apariencia" subtitulo="Cómo se ve el ERP en este aparato." onClose={onClose} alCerrarEnfocar={alCerrarEnfocar} conCerrar>
      {/* Una sola placa con las tres filas, separadas por la luz del vidrio (la «Lámina de vidrio» de una hoja, `vidrio/hoja.css`). */}
      <div className="card-cayla divide-y divide-sand overflow-hidden">
        <Ajuste
          icono={<Moon className="h-5 w-5" />}
          nombre="Modo oscuro"
          linea="Descansa la vista con poca luz."
          activo={tema === "oscuro"}
          onActivo={(v) => cambiarTema(v ? "oscuro" : "claro")}
        />
        <Ajuste
          icono={<Sparkles className="h-5 w-5" />}
          nombre="Animaciones"
          linea="Hojas y cifras que se mueven."
          activo={movimiento === "vivo"}
          onActivo={(v) => cambiarMovimiento(v ? "vivo" : "quieto")}
        />
        <Ajuste
          icono={<Feather className="h-5 w-5" />}
          nombre="Modo liviano"
          estado={
            automatico ? (
              <Chip tono="pizarra" title="Este aparato lo decide por su memoria.">
                Automático
              </Chip>
            ) : null
          }
          linea="Más rápido en teléfonos sencillos."
          activo={liviano === "si"}
          onActivo={(v) => cambiarLiviano(v ? "si" : "no")}
          debajo={
            automatico ? null : (
              <button type="button" onClick={volverLivianoAutomatico} className="btn-cayla btn-enlace">
                Volver a automático
              </button>
            )
          }
        />
      </div>
    </Modal>
  );
}

/** Una fila de la placa: su ícono (lucide de fábrica, 20 px junto a un título: familia `icono`), su nombre (con su estado, si lo tiene), una línea corta y el interruptor a la derecha. Toda la fila
 *  es la etiqueta del interruptor: tocar el nombre también lo cambia, como en los ajustes del teléfono. */
function Ajuste({
  icono,
  nombre,
  estado,
  linea,
  activo,
  onActivo,
  debajo,
}: {
  icono: ReactNode;
  nombre: string;
  estado?: ReactNode;
  linea: string;
  activo: boolean;
  onActivo: (v: boolean) => void;
  debajo?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="px-3.5 py-3">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center text-tinta/65">
          {icono}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span id={`${id}-nombre`} className="text-[15px] font-medium text-tinta">
              {nombre}
            </span>
            {estado}
          </span>
          <span id={`${id}-linea`} className="texto-detalle block text-tinta/65">
            {linea}
          </span>
        </span>
        <button
          id={id}
          type="button"
          role="switch" // unificar-fijo: la cara del interruptor del sistema, con su título a la izquierda en la fila
          aria-checked={activo}
          aria-labelledby={`${id}-nombre`}
          aria-describedby={`${id}-linea`}
          onClick={() => onActivo(!activo)}
          className="interruptor"
        >
          <span aria-hidden className="interruptor-perilla" />
        </button>
      </label>
      {debajo ? <div className="mt-1.5 pl-11">{debajo}</div> : null}
    </div>
  );
}
