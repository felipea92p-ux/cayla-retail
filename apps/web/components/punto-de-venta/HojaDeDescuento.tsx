"use client";

import { BadgePercent } from "lucide-react";
import { type DescuentoForm, type ItemCarrito, money } from "@/components/PuntoDeVenta";
import { PanelDescuento } from "@/components/punto-de-venta/PanelDescuento";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Volver } from "@/components/ui/Volver";
import { cuentaDelDescuento } from "@/lib/descuento-cuenta-reglas";

const ID_MOTIVO = "descuento-motivo-bloqueo";

/**
 * La hoja del descuento (Felipe, 2026-11-02; maqueta `docs/maquetas/descuento-hoja-2026-11/`, «A · Hoja lateral»): al tocar «Descuento» entra
 * como una hoja de vidrio sobre el catálogo, igual que el cobro (`HojaDeCobro`), y el ticket queda quieto a la vista. Antes reemplazaba a las
 * prendas dentro de la columna de 400 px: el «%» salía tres veces, los motivos se partían y «Aplicar a» quedaba bajo el pliegue.
 *
 * Cabecera con la flecha de siempre, el cuerpo de tres pasos (`PanelDescuento`) y un pie FIJO con lo que quedaría y «Aplicar descuento»
 * (apagado dice qué falta, debajo). Sin estado propio: el formulario y el carrito son de `PuntoDeVenta`; aplicar y quitar también. Se cierra con
 * la flecha, con Esc y tocando el velo (los dos últimos los pone `PuntoDeVenta`, como en el cobro). En el celular no se usa: ahí el mismo cuerpo
 * vive dentro de la hoja del ticket.
 */
export function HojaDeDescuento({
  descuento,
  onDescuento,
  carrito,
  vale,
  bloqueado,
  onAplicar,
  onQuitar,
  onVolver,
}: {
  descuento: DescuentoForm;
  onDescuento: (cambio: Partial<DescuentoForm>) => void;
  carrito: readonly ItemCarrito[];
  /** El cupón del Club puesto: «Quedaría en» ya va sin su parte, el mismo número que quedará en «Total». */
  vale: { vale: number } | null;
  bloqueado: boolean;
  onAplicar: () => void;
  onQuitar: () => void;
  onVolver: () => void;
}) {
  const cuenta = cuentaDelDescuento(descuento, carrito, vale);
  const { porMonto, pct, monto, valorValido, elegidasCuenta, todasLasPrendas, motivoDescuento, hayDescuentoEnAlcance } = cuenta;
  const verQuedaria = valorValido && elegidasCuenta > 0;
  const texto = !valorValido ? "—" : porMonto ? `−${money(monto)}` : `−${pct}%`;
  return (
    <div className="pv-desc-raiz">
      <div className="pv-desc-cab">
        <Volver onClick={onVolver} a="Volver al ticket" deshabilitado={bloqueado} />
        <div className="anim-sube text-right">
          <TituloSeccion className="justify-end">
            <span className="inline-flex items-center gap-2.5">
              <BadgePercent className="h-5 w-5 text-tinta/70" aria-hidden />
              Descuento
            </span>
          </TituloSeccion>
          <p className="mt-1 text-sm text-tinta/60">{todasLasPrendas ? "Todo el ticket" : `${elegidasCuenta} de ${carrito.length} ${carrito.length === 1 ? "prenda" : "prendas"}`}</p>
        </div>
      </div>

      <div className="pv-desc-scroll scroll-cayla">
        <PanelDescuento descuento={descuento} onDescuento={onDescuento} carrito={carrito} cuenta={cuenta} bloqueado={bloqueado} />
      </div>

      <div className="pv-desc-pie">
        <div className="pv-desc-quedaria">
          <span className="label-cayla text-[11px] text-tinta/60">Quedaría en</span>
          <strong key={verQuedaria ? cuenta.totalConDescuento : "—"} className={`anim-asentar font-display tabular-nums ${verQuedaria ? "text-tinta" : "text-tinta/45"}`}>
            {verQuedaria ? money(cuenta.totalConDescuento) : "—"}
          </strong>
          {/* Por qué el % no da el precio «exacto»: cada prenda baja al S/ 0.10 de abajo para que se cobre sin céntimos sueltos (ADR-0403).
              En S/ no hace falta, pero con más de una prenda el monto se reparte (Felipe, 2026-10-24). */}
          <small className="text-sm text-tinta/60">
            {!verQuedaria ? "" : !porMonto ? "Cada prenda baja a un precio sin céntimos sueltos." : cuenta.unidadesAlcanzadas > 1 ? `Los ${money(monto)} se reparten entre las prendas según su precio.` : ""}
          </small>
        </div>
        <div className="pv-desc-acciones">
          <Boton
            type="button"
            peso="primario"
            onClick={onAplicar}
            disabled={bloqueado || motivoDescuento !== null}
            aria-describedby={motivoDescuento !== null ? ID_MOTIVO : undefined}
            className={`pv-desc-aplicar ${cuenta.pasoDescuento === "listo" ? "cobrar-listo" : ""}`}
          >
            <span className="pv-desc-aplicar-texto">
              <span>Aplicar descuento</span>
              <strong className="font-display text-xl">{texto}</strong>
            </span>
          </Boton>
          {/* El botón apagado dice por qué: el mismo motivo que lo apaga, debajo de él. */}
          <p id={ID_MOTIVO} className="pv-desc-motivo" aria-live="polite">
            {motivoDescuento ?? ""}
          </p>
          {hayDescuentoEnAlcance && (
            <Boton type="button" peso="peligro" onClick={onQuitar} disabled={bloqueado}>
              Quitar descuento
            </Boton>
          )}
        </div>
      </div>
    </div>
  );
}
