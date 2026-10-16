"use client";

import type { ReactNode, Ref } from "react";
import { codigoLimpio, cuentaRegresiva, normalizarCorreo, type MarcaCampo } from "@/lib/cuentas";
import { buzonDelCorreo } from "@/lib/panel-entrada";
import { Icono } from "../Icono";
import { Campo, Resultado } from "./CampoGuiado";

// La forma de confirmar un correo con un código, la misma de «Crear cuenta» (Felipe 2026-10-15): el correo con «Obtener código» al lado
// y, DEBAJO, la caja del código con «Reenviar» y «✓ Correo confirmado». La usan «Cambiar mi correo» y «Restablecer mi acceso»: cada
// formulario lleva su estado y sus acciones; aquí solo se dibuja igual en los dos.

export function CorreoConCodigo({
  ids,
  etiquetaCorreo,
  correo,
  onCorreo,
  marcaCorreo,
  resultadoCorreo,
  puedeObtener,
  obteniendo,
  onObtener,
  mostrarCodigo,
  codigo,
  onCodigo,
  marcaCodigo,
  resultadoCodigo,
  confirmado,
  puedeReenviar,
  reenviando,
  onReenviar,
  restan,
  bloqueado = false,
  codigoRef,
  onFoco,
}: {
  ids: { correo: string; codigo: string };
  etiquetaCorreo: string;
  correo: string;
  onCorreo: (valor: string) => void;
  marcaCorreo: MarcaCampo;
  resultadoCorreo: ReactNode;
  puedeObtener: boolean;
  obteniendo: boolean;
  onObtener: () => void;
  mostrarCodigo: boolean;
  codigo: string;
  onCodigo: (valor: string) => void;
  marcaCodigo: MarcaCampo;
  resultadoCodigo: ReactNode;
  /** El código ya se confirmó: la caja dice «✓ Correo confirmado» y nada se puede cambiar. */
  confirmado: boolean;
  puedeReenviar: boolean;
  reenviando: boolean;
  onReenviar: () => void;
  /** Segundos que faltan para poder pedir otro código (la espera que dice la base). */
  restan: number;
  /** Mientras se guarda o ya terminó: nada se edita. */
  bloqueado?: boolean;
  codigoRef?: Ref<HTMLInputElement>;
  onFoco: (campo: "correo" | "codigo" | null) => void;
}) {
  const contando = restan > 0;
  // Un atajo a su buzón para buscar el código (se abre aparte: lo escrito aquí no se pierde).
  const buzon = buzonDelCorreo(normalizarCorreo(correo));
  return (
    <>
      <Campo
        campo="correo"
        idCaja={ids.correo}
        etiqueta={etiquetaCorreo}
        marca={confirmado ? "hecho" : marcaCorreo}
        alEntrar={() => onFoco("correo")}
        alSalir={() => onFoco(null)}
      >
        <div className="w-caja-con-boton">
          <input
            id={ids.correo}
            className="w-caja"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            placeholder="tucorreo@gmail.com" // sugerir-fijo: el ejemplo es la forma de un correo, no depende de nada elegido antes
            value={correo}
            onChange={(e) => onCorreo(e.target.value)}
            readOnly={confirmado || bloqueado}
            aria-describedby={`${ids.correo}-res`}
            aria-invalid={marcaCorreo === "error" || undefined}
          />
          <button
            type="button"
            className="t-btn t-btn-sec w-obtener"
            onClick={onObtener}
            disabled={!puedeObtener || obteniendo || contando || confirmado || bloqueado}
            aria-busy={obteniendo || undefined}
          >
            {obteniendo ? "Mandando…" : "Obtener código"}
          </button>
        </div>
        <Resultado id={ids.correo}>{resultadoCorreo}</Resultado>
      </Campo>

      {mostrarCodigo && (
        <Campo
          campo="codigo"
          idCaja={ids.codigo}
          etiqueta="Código"
          marca={confirmado ? "hecho" : marcaCodigo}
          textoMarca={confirmado ? "✓ Correo confirmado" : undefined}
          alEntrar={() => onFoco("codigo")}
          alSalir={() => onFoco(null)}
        >
          <input
            ref={codigoRef}
            id={ids.codigo}
            className="w-caja num w-codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 números" // sugerir-fijo: el código siempre tiene 6 números, no depende de nada elegido antes
            value={codigo}
            onChange={(e) => onCodigo(codigoLimpio(e.target.value))}
            readOnly={confirmado || bloqueado}
            aria-describedby={`${ids.codigo}-res`}
            aria-invalid={marcaCodigo === "error" || undefined}
          />
          <Resultado id={ids.codigo}>{resultadoCodigo}</Resultado>
          {!confirmado && (
            // Fuera de la línea que se anuncia: la cuenta regresiva cambia cada segundo y no debe leerse en voz alta cada vez.
            <span className="w-res-acc w-codigo-acc">
              <button type="button" className="w-enlace" onClick={onReenviar} disabled={!puedeReenviar || contando || reenviando || bloqueado}>
                {reenviando ? "Mandando otro código…" : contando ? `Reenviar en ${cuentaRegresiva(restan)}` : "Reenviar"}
              </button>
              {buzon && (
                <a className="w-enlace en-buzon" href={buzon.href} target="_blank" rel="noopener noreferrer">
                  Abrir {buzon.nombre}
                  <Icono nombre="flecha" />
                </a>
              )}
            </span>
          )}
        </Campo>
      )}
    </>
  );
}
