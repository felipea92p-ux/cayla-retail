"use client";

import { useState } from "react";
import { puedeOfrecerSola, textoDelBoton } from "@/lib/instalar";
import { IconoApp } from "./IconoApp";
import { useInstalar } from "./ProveedorInstalar";

/**
 * «El momento justo» (plantilla E, ADR-0431): tras separar un pedido, cuando la persona ya ganó algo y quiere volver a verlo, se le
 * ofrece tener CAYLA a un toque. Va DEBAJO de lo que importa (el WhatsApp y el pedido) y sin velo. Se calla igual que los demás avisos.
 */
export function TarjetaInstalar() {
  const instalar = useInstalar();
  const [cerrada, setCerrada] = useState(false);
  if (!instalar.listo || cerrada || !puedeOfrecerSola(instalar.situacion)) return null;
  return (
    <section className="t-inst-tarjeta" aria-label="Instalar CAYLA">
      <div className="t-inst-tarjeta-cab">
        <IconoApp />
        <h2>Sigue tu pedido a un toque</h2>
      </div>
      <p>Añade CAYLA a tu pantalla de inicio y entra a tu pedido con un toque.</p>
      <div className="t-inst-tarjeta-acc">
        <button
          type="button"
          className="t-btn t-btn-chico"
          onClick={() => {
            setCerrada(true);
            void instalar.instalar();
          }}
        >
          {textoDelBoton(instalar.como)}
        </button>
        <button
          type="button"
          className="t-enlace"
          onClick={() => {
            setCerrada(true);
            instalar.cerrar();
          }}
        >
          Ahora no
        </button>
      </div>
    </section>
  );
}
