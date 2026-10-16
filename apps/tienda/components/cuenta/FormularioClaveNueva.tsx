"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { guardarClaveNueva, type RespuestaClave } from "@/app/acciones/cuenta";
import { CLAVE_MAXIMA, estadoClave, faltanCaracteres, MENSAJES } from "@/lib/cuentas";
import { CajaClave } from "./CajaClave";
import { usePasoDelPanel } from "./EntradaViva";

// «Crea tu contraseña nueva» (maqueta, `vOlvide` paso 3), desde el enlace del correo. El código del enlace se canjea recién al
// tocar «Guardar y entrar» (`guardarClaveNueva`): abrir la página no lo gasta.
export function FormularioClaveNueva({ codigo }: { codigo: string }) {
  const [clave, setClave] = useState("");
  const [respuesta, setRespuesta] = useState<RespuestaClave | null>(null);
  const [enviando, iniciar] = useTransition();
  const lista = estadoClave(clave) === "ok";
  // Si el enlace ya no sirve, el panel de al lado vuelve al primer paso: pedir otro.
  usePasoDelPanel(respuesta?.vencido ? 0 : null);

  function guardar() {
    if (!lista || enviando) return;
    setRespuesta(null);
    iniciar(async () => {
      // Si sale bien, la acción ya llevó a «Mi cuenta»; si vuelve, algo no se pudo.
      const r = await guardarClaveNueva(codigo, clave).catch((): RespuestaClave => ({ mensaje: MENSAJES.claveNoDisponible, vencido: false }));
      if (r) setRespuesta(r);
    });
  }

  if (respuesta?.vencido) {
    return (
      <div className="w-ficha">
        <div>
          <span className="t-ceja">Contraseña nueva</span>
          <h1 className="w-titulo">
            Este enlace <em>ya no sirve.</em>
          </h1>
        </div>
        <p className="w-texto">{respuesta.mensaje}</p>
        <Link className="t-btn t-btn-ancho" href="/olvide-mi-contrasena">
          Pedir otro enlace
        </Link>
      </div>
    );
  }

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div>
        <span className="t-ceja">Contraseña nueva</span>
        <h1 className="w-titulo">
          Crea tu contraseña <em>nueva.</em>
        </h1>
      </div>
      <div className="w-campo">
        <label htmlFor="clave-nueva">Contraseña nueva</label>
        <CajaClave id="clave-nueva" valor={clave} onCambio={setClave} autoComplete="new-password" describedBy="clave-nueva-res" />
        <div className="w-res" id="clave-nueva-res">
          <p className="w-ayuda">{clave.length > CLAVE_MAXIMA ? MENSAJES.claveLarga : (faltanCaracteres(clave) ?? "8 caracteres o más.")}</p>
        </div>
      </div>
      {respuesta && (
        <div className="w-res" role="alert">
          <span className="w-res-error">{respuesta.mensaje}</span>
        </div>
      )}
      <button className="t-btn t-btn-ancho" type="submit" disabled={!lista || enviando} aria-busy={enviando || undefined}>
        {enviando ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
