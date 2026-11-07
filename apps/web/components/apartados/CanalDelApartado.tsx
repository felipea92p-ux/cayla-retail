"use client";

import { Store } from "lucide-react";
import { Campo } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { DIRECCION_ENVIO_MAX, MODOS_DE_ENTREGA, esCanalOnline, type CanalVenta, type ModoEntrega } from "@/lib/canales-venta-reglas";

// «¿Por dónde se vende?» y «Cómo se entrega» de un apartado (ADR-0607). La prenda sale siempre de la sede donde está quien aparta; lo que
// cambia es el canal (la tienda o un canal online como TikTok) y, en uno online, si la clienta recoge en la tienda o se le envía.
// Solo se dibuja si la cuenta opera algo más que la tienda (`ofreceCanal`): para quien solo opera la tienda el formulario queda como siempre.

export function CanalDelApartado({
  canales,
  canal,
  modoEntrega,
  direccionEnvio,
  errorDireccion,
  onCanal,
  onModo,
  onDireccion,
  onTocarDireccion,
  deshabilitado = false,
}: {
  /** Los canales que opera la cuenta. */
  canales: readonly CanalVenta[];
  canal: string;
  modoEntrega: ModoEntrega;
  direccionEnvio: string;
  errorDireccion?: string;
  onCanal: (clave: string) => void;
  onModo: (modo: ModoEntrega) => void;
  onDireccion: (texto: string) => void;
  onTocarDireccion?: () => void;
  deshabilitado?: boolean;
}) {
  const online = esCanalOnline(canales, canal);
  return (
    <fieldset disabled={deshabilitado} className="space-y-3.5" data-guia="apartados.canal">
      <legend className="mb-2 flex items-center gap-1.5 text-sm text-tinta/50">
        <Store className="h-3.5 w-3.5" aria-hidden /> La venta
      </legend>

      <Campo etiqueta="¿Por dónde se vende?" sinPie>
        {canales.length === 1 ? (
          // Un rol que opera un solo canal online: se ve fijo, para que se note por dónde vende.
          <p className="rounded-xl bg-sand/50 px-3.5 py-2.5 text-[15px] text-tinta">{canales[0].nombre}</p>
        ) : (
          <SegmentoDeslizante
            etiqueta="¿Por dónde se vende?"
            valor={canal}
            onCambio={onCanal}
            opciones={canales.map((c) => ({ clave: c.clave, etiqueta: c.nombre }))}
          />
        )}
      </Campo>

      {online && (
        <>
          <Campo etiqueta="Cómo se entrega" sinPie>
            <SegmentoDeslizante
              etiqueta="Cómo se entrega"
              valor={modoEntrega}
              onCambio={(k) => onModo(k as ModoEntrega)}
              opciones={MODOS_DE_ENTREGA.map((m) => ({ clave: m.clave, etiqueta: m.etiqueta }))}
            />
          </Campo>
          {modoEntrega === "envio" && (
            <Campo etiqueta="Dirección y agencia" tono={errorDireccion ? "error" : "neutro"} pie={errorDireccion}>
              <input
                value={direccionEnvio}
                onChange={(e) => onDireccion(e.target.value)}
                onBlur={onTocarDireccion}
                maxLength={DIRECCION_ENVIO_MAX}
                autoComplete="off"
                // sugerir-fijo: la dirección y la agencia del envío no dependen de nada elegido antes
                placeholder="Jr. Pizarro 123, Trujillo · Olva Courier"
                aria-label="Dirección y agencia de envío"
                aria-invalid={!!errorDireccion}
                className="caja-campo-input"
              />
            </Campo>
          )}
        </>
      )}
    </fieldset>
  );
}
