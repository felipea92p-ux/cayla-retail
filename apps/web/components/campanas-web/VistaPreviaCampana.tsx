"use client";

import { useRef, useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { enlaceDeVistaPrevia, errorDeCampanas, vencimientoDicho } from "@/lib/campanas-web-editor";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * Tienda web ▸ Campañas ▸ «Vista previa privada»: crea un enlace para ver el diseño guardado en la tienda de verdad —con sus prendas, sin que lo vea
 * nadie más— durante 7 días. La base guarda solo la huella de la llave: el enlace sale UNA vez, aquí, y si se pierde se crea otro. Es una hoja con un
 * solo paso (crear el enlace y copiarlo), sin campos que llenar más allá del «Responsable» de siempre (guía de foco: no aplica).
 */
export function VistaPreviaCampana({
  etiquetaId,
  nombre,
  tiendaUrl,
  responsable,
  cambiosSinGuardar,
  onClose,
}: {
  etiquetaId: string;
  nombre: string;
  /** La dirección de la tienda online (la misma base de datos que este ERP). */
  tiendaUrl: string | null;
  responsable: ControlResponsable;
  /** Hay cambios en pantalla que todavía no se guardaron: el enlace muestra lo último que se guardó. */
  cambiosSinGuardar: boolean;
  onClose: () => void;
}) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ enlace: string; vence: string | null } | null>(null);
  // Un doble clic no crea dos enlaces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);

  async function crear() {
    if (enVuelo.current || !responsable.listo) return;
    if (!tiendaUrl) {
      setError("No se sabe cuál es la dirección de la tienda online en este entorno. Avísale al líder.");
      return;
    }
    enVuelo.current = true;
    setCreando(true);
    setError(null);
    const { data, error: e } = await firmar(createClient().rpc("crear_campana_vista_previa", { p_etiqueta_id: etiquetaId }), responsable.firma());
    enVuelo.current = false;
    setCreando(false);
    responsable.despues(e);
    const respuesta = data as { llave?: unknown; expira_en?: unknown } | null;
    if (e || !respuesta) {
      const propio = errorDeCampanas(`${e?.message ?? ""} ${e?.hint ?? ""}`);
      setError(propio ? `${propio.titulo}. ${propio.detalle ?? ""}`.trim() : traducirError(e ?? { message: "sin respuesta" }, "crear la vista previa"));
      return;
    }
    const enlace = typeof respuesta.llave === "string" ? enlaceDeVistaPrevia(tiendaUrl, respuesta.llave) : null;
    if (!enlace) {
      setError("La vista previa se creó, pero no se pudo armar el enlace. Crea otra.");
      return;
    }
    setCreado({ enlace, vence: typeof respuesta.expira_en === "string" ? vencimientoDicho(respuesta.expira_en) : null });
  }

  return (
    <Modal
      titulo="Vista previa privada"
      subtitulo={`Mira «${nombre}» en la tienda de verdad, sin que la vea nadie más.`}
      onClose={onClose}
      conCerrar={creado !== null}
    >
      <div className="space-y-4">
        {creado === null ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-tinta/80">
              Se crea un enlace que muestra este diseño, tal como lo guardaste, con las prendas de la tienda. Quien lo tenga lo ve durante 7 días; sin el enlace, nadie.
            </p>
            {cambiosSinGuardar && (
              <Aviso tono="atencion" chico>
                Tienes cambios sin guardar: la vista previa muestra lo último que guardaste.
              </Aviso>
            )}
            <ComboResponsable control={responsable} deshabilitado={creando} />
            {error && (
              <Aviso tono="error" titulo="No se pudo crear la vista previa">
                {error}
              </Aviso>
            )}
            <div className="pie-acciones">
              <Boton type="button" peso="fantasma" onClick={onClose} disabled={creando}>
                Cancelar
              </Boton>
              <Boton type="button" peso="primario" cargando={creando} textoCargando="Creando…" disabled={!responsable.listo} title={responsable.motivo ?? undefined} onClick={crear}>
                Crear enlace
              </Boton>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CampoTexto etiqueta="Enlace" caja sinPie mono readOnly value={creado.enlace} aria-label="Enlace de la vista previa" onFocus={(e) => e.currentTarget.select()} />
              </div>
              <BotonCopiar texto={creado.enlace} que="el enlace" icono="enlace" />
            </div>
            <p className="text-[13px] text-tinta/80">
              Vale {creado.vence ?? "7 días"}. Cópialo ahora: por seguridad no se vuelve a mostrar (si lo pierdes, creas otro).
            </p>
            <p>
              <a className="btn-cayla btn-enlace" href={creado.enlace} target="_blank" rel="noreferrer">
                Abrirlo en otra pestaña
              </a>
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
