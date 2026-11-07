"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import "@/app/estilos/recomendaciones-ventana.css";

// La ventana (formulario, respuestas y sus estilos) se descarga recién al primer toque: el botón es lo único que pesa en cada página.
const Ventana = dynamic(() => import("./VentanaRecomendaciones").then((m) => m.VentanaRecomendaciones), { ssr: false });

/**
 * «Recomendaciones», desde el pie de toda página (rediseño Premium, 2026-11-07). Antes era un botón flotante abajo a la derecha (Felipe
 * 2026-10-31, «A · Esquina»): en el celular tapaba el precio y la disponibilidad de las tarjetas (auditoría de la maqueta). Abre la misma
 * ventana, sin sacar al cliente de lo que miraba. No lee la sesión: la ventana la pregunta al abrirse, y sin cuenta manda a «Entrar».
 */
export function RecomendacionEnElPie() {
  const [abierta, setAbierta] = useState(false);
  const [vista, setVista] = useState(false); // ya se abrió alguna vez: de ahí en adelante la ventana se queda montada y conserva el borrador
  return (
    <>
      <button
        type="button"
        className="t-pie-boton"
        aria-haspopup="dialog"
        aria-expanded={abierta}
        onClick={() => {
          setVista(true);
          setAbierta(true);
        }}
      >
        Envíanos una sugerencia
      </button>
      {vista && <Ventana abierta={abierta} alCerrar={() => setAbierta(false)} />}
    </>
  );
}
