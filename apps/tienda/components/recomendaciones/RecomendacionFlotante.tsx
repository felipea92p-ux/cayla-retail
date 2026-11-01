"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icono } from "../Icono";
import "@/app/estilos/recomendaciones-ventana.css";

// La ventana (formulario, respuestas y sus estilos) se descarga recién al primer toque: el botón es lo único que pesa en cada página.
const Ventana = dynamic(() => import("./VentanaRecomendaciones").then((m) => m.VentanaRecomendaciones), { ssr: false });

/** Donde no va el botón: la propia página de Recomendaciones y el recorrido de entrar, crear o recuperar la cuenta (ahí estorba). */
const SIN_BOTON = ["/recomendaciones", "/entrar", "/crear-cuenta", "/olvide-mi-contrasena", "/restablecer-acceso", "/nueva-contrasena", "/auth"];

/**
 * «Recomendaciones» a un toque desde cualquier pantalla (Felipe 2026-10-31, maqueta «A · Esquina»): un botón abajo a la derecha que abre
 * una ventana sobre la tienda, sin sacar al cliente de lo que miraba. No lee la sesión (por eso no vuelve dinámica ninguna página): la
 * ventana la pregunta al abrirse, y sin cuenta manda a «Entrar».
 */
export function RecomendacionFlotante() {
  const ruta = usePathname();
  const [abierta, setAbierta] = useState(false);
  const [vista, setVista] = useState(false); // ya se abrió alguna vez: de ahí en adelante la ventana se queda montada y conserva el borrador
  if (SIN_BOTON.some((r) => ruta === r || ruta.startsWith(`${r}/`))) return null;
  return (
    <>
      <button
        type="button"
        className="rv-boton"
        data-abierta={abierta || undefined}
        aria-haspopup="dialog"
        aria-expanded={abierta}
        onClick={() => {
          setVista(true);
          setAbierta(true);
        }}
      >
        <Icono nombre="chat" />
        <span className="rv-boton-txt">Recomendaciones</span>
      </button>
      {vista && <Ventana abierta={abierta} alCerrar={() => setAbierta(false)} />}
    </>
  );
}
