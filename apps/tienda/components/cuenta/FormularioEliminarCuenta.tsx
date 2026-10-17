"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { eliminarMiCuenta, type RespuestaEliminar } from "@/app/acciones/mi-cuenta";
import { marcaDe } from "@/lib/cuentas";
import { estadoClaveActual, nadaQueFrene, QUE_QUEDA, QUE_SE_BORRA, TEXTOS_CUENTA, type LoQueFrena } from "@/lib/mi-cuenta";
import { CajaClave } from "./CajaClave";
import { Campo, Resultado } from "./CampoGuiado";
import { LoQueFrenaEliminar } from "./LoQueFrenaEliminar";

// «Eliminar mi cuenta» (Felipe 2026-10-15): borra su cuenta de la tienda online Y sus datos de la ficha del Club, con la anonimización de
// siempre (deja de ser miembro). Dice clarito qué se borra y qué queda, y pide su contraseña para confirmar que es ella. Con un pedido
// web en curso o un apartado abierto, todavía no: dice cuáles y qué hacer.

const ID = "eliminar-clave";

export function FormularioEliminarCuenta({ correo, frena: frenaInicial }: { correo: string; frena: LoQueFrena }) {
  const [clave, setClave] = useState("");
  const [enFoco, setEnFoco] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; campo: "clave" | null } | null>(null);
  const [frena, setFrena] = useState<LoQueFrena>(frenaInicial);
  const [eliminando, iniciar] = useTransition();
  // Una contraseña que el servidor rechazó cuenta como «falta» hasta que la cambie: así no se vuelve a probar la misma (gastaría un intento).
  const estado = mensaje?.campo === "clave" ? "falta" : estadoClaveActual(clave);
  const marca = mensaje?.campo === "clave" ? "error" : marcaDe(estado, !enFoco && estado !== "ok");

  function eliminar() {
    if (estado !== "ok" || eliminando) return;
    setMensaje(null);
    iniciar(async () => {
      // Si sale bien, la acción ya llevó a la portada; si vuelve, algo no se pudo (o hay algo en curso).
      const r: RespuestaEliminar = await eliminarMiCuenta({ clave }).catch(() => ({ mensaje: TEXTOS_CUENTA.noDisponible, campo: null }));
      if ("frena" in r) setFrena(r.frena);
      else setMensaje({ texto: r.mensaje, campo: r.campo });
    });
  }

  if (!nadaQueFrene(frena)) {
    return (
      <div className="w-ficha">
        <div>
          <span className="t-ceja">Mi perfil</span>
          <h1 className="w-titulo">
            Eliminar tu cuenta, <em>todavía no.</em>
          </h1>
        </div>
        <LoQueFrenaEliminar frena={frena} />
        <div className="w-pie-form">
          <Link className="t-btn t-btn-ancho t-btn-sec" href="/cuenta">
            Volver a mi perfil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        eliminar();
      }}
    >
      <div>
        <span className="t-ceja">Mi perfil</span>
        <h1 className="w-titulo">
          Eliminar tu <em>cuenta.</em>
        </h1>
        <p className="w-texto-sec">
          Entras con <b className="w-correo">{correo}</b>. Si la eliminas, se borra esto:
        </p>
      </div>
      <ul className="w-se-borra">
        {QUE_SE_BORRA.map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ul>
      <p className="w-nota">{QUE_QUEDA}</p>

      <Campo campo="clave" idCaja={ID} etiqueta="Tu contraseña" marca={marca} alEntrar={() => setEnFoco(true)} alSalir={() => setEnFoco(false)}>
        <CajaClave
          id={ID}
          valor={clave}
          onCambio={(v) => {
            setClave(v);
            if (mensaje?.campo === "clave") setMensaje(null);
          }}
          autoComplete="current-password"
          describedBy={`${ID}-res`}
          invalida={mensaje?.campo === "clave"}
        />
        <Resultado id={ID}>
          {mensaje?.campo === "clave" ? <span className="w-res-error">{mensaje.texto}</span> : <p className="w-ayuda">Para confirmar que eres tú.</p>}
        </Resultado>
      </Campo>

      <div className="w-pie-form">
        {mensaje && mensaje.campo === null && (
          <p className="w-error-general" role="alert">
            {mensaje.texto}
          </p>
        )}
        <p className="w-faltan" aria-live="polite">
          {estado === "ok" ? (
            <>No se puede deshacer.</>
          ) : (
            <>
              Falta: <b>tu contraseña</b>
            </>
          )}
        </p>
        <button className="t-btn t-btn-ancho t-btn-peligro" type="submit" disabled={estado !== "ok" || eliminando} aria-busy={eliminando || undefined}>
          {eliminando ? "Eliminando…" : "Eliminar mi cuenta"}
        </button>
        <Link className="w-enlace" href="/cuenta">
          No, volver a mi perfil
        </Link>
      </div>
    </form>
  );
}
