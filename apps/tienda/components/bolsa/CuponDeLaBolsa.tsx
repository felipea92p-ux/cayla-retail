"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { revisarCupon } from "@/app/acciones/bolsa";
import { codigoCompleto, normalizarCodigo, textoDelDescuento } from "@/lib/cupon";
import { Icono } from "../Icono";

type Estado = { tipo: "nada" } | { tipo: "ok"; texto: string } | { tipo: "no"; texto: string };

/**
 * «Código de cupón» de la bolsa (20261019224000): el cliente escribe (o elige) el código de su cupón del Club. Se pregunta a la base
 * recién cuando el código está completo (no por cada letra) y dice el descuento, o por qué no sirve. Va DENTRO del formulario de
 * «Separar» con `name="cupon"`: al separar, la base lo vuelve a revisar y lo RESERVA para el pedido, que nace con el total rebajado.
 * `marca`: la de la bolsa; si cambia (quitó una prenda, otra tienda), se vuelve a preguntar con el total de ahora.
 */
export function CuponDeLaBolsa({ marca, mios }: { marca: string | null; mios: { codigo: string; texto: string }[] }) {
  const id = useId();
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const [revisando, empezar] = useTransition();
  const ultimo = useRef("");

  function revisar(texto: string) {
    const codigo = normalizarCodigo(texto);
    ultimo.current = codigo;
    empezar(async () => {
      const r = await revisarCupon(codigo);
      // Una respuesta vieja (ya escribió otro código) no pisa la nueva.
      if (ultimo.current !== codigo) return;
      setEstado(r.estado === "ok" ? { tipo: "ok", texto: textoDelDescuento(r.validacion.valor, r.total) } : { tipo: "no", texto: r.mensaje });
    });
  }

  function cambiar(texto: string) {
    setValor(texto);
    if (codigoCompleto(texto)) revisar(texto);
    else {
      ultimo.current = "";
      setEstado({ tipo: "nada" });
    }
  }

  // La bolsa cambió: el descuento que se veía puede no ser el de ahora.
  useEffect(() => {
    if (codigoCompleto(valor)) revisar(valor);
    // Solo al cambiar la bolsa: escribir ya pregunta en `cambiar`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca]);

  const dato = estado.tipo === "ok" ? "hecho" : estado.tipo === "no" ? "error" : undefined;
  return (
    <div className="w-campo t-bolsa-cupon" data-estado={dato}>
      <label htmlFor={id}>
        Código de cupón <span className="w-marca">{estado.tipo === "ok" ? "✓ Listo" : "Opcional"}</span>
      </label>
      <input
        id={id}
        name="cupon"
        className="w-caja"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={16}
        placeholder="CAY-XXXX-XXXX"
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        aria-invalid={estado.tipo === "no" || undefined}
        aria-describedby={`${id}-res`}
      />
      {mios.length > 0 && !valor && (
        <div className="t-bolsa-cupon-mios" role="group" aria-label="Tus cupones">
          {mios.map((m) => (
            <button key={m.codigo} type="button" className="t-bolsa-cupon-mio" onClick={() => cambiar(m.codigo)}>
              <Icono nombre="ticket" />
              <span>
                <b>{m.codigo}</b>
                <small>{m.texto}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="w-res" id={`${id}-res`} aria-live="polite">
        {revisando ? (
          <span className="w-ayuda">Revisando tu cupón…</span>
        ) : estado.tipo === "ok" ? (
          <span className="w-res-ok">
            <Icono nombre="check" />
            {estado.texto}
          </span>
        ) : estado.tipo === "no" ? (
          <span className="w-res-error">{estado.texto}</span>
        ) : null}
      </div>
    </div>
  );
}
