"use client";

import { estadoDeLaFila } from "@/lib/instalar";
import { Icono } from "../Icono";
import { IconoApp } from "./IconoApp";
import { useInstalar } from "./ProveedorInstalar";

/**
 * «Siempre a mano» (plantilla F, ADR-0431): la fila fija de «Tu cuenta» en «Mi perfil». No insiste nunca (ignora los «Ahora no»): es
 * adonde llega quien dijo que no y cambió de idea. No sale en computadora ni a quien ya abre CAYLA desde su pantalla de inicio.
 */
export function FilaInstalar() {
  const instalar = useInstalar();
  if (!instalar.listo) return null;
  const estado = estadoDeLaFila(instalar.situacion);
  if (estado === "oculta") return null;
  return (
    <div className="t-inst-fila">
      <IconoApp />
      <span className="t-inst-fila-txt">
        <b>Instalar CAYLA</b>
        <small>{estado === "ya-la-tienes" ? "Ya la tienes en tu pantalla de inicio" : "Acceso directo en tu pantalla de inicio"}</small>
      </span>
      {estado === "ya-la-tienes" ? (
        <span className="t-inst-fila-ok" aria-hidden="true">
          <Icono nombre="check" />
        </span>
      ) : (
        <button type="button" className="t-btn t-btn-sec t-btn-chico" onClick={() => void instalar.instalar()}>
          {estado === "anadir" ? "Añadir" : "Ver cómo"}
        </button>
      )}
    </div>
  );
}
