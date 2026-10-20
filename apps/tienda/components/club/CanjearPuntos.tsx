"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { canjearPuntos } from "@/app/acciones/puntos";
import { montoDicho } from "@/lib/club";
import { MENSAJES_PUNTOS, opcionesDeCanje, puntosDichos, valorDePuntos, type ConfigPuntos } from "@/lib/puntos";
import { Icono } from "../Icono";
import { useAvisoBreve } from "./useAvisoBreve";
import "@/app/estilos/puntos.css";

/**
 * «Canjear mis puntos»: elige cuánto (de a 100, desde el mínimo, hasta su saldo) y lo cambia por un cupón con código que vale 7 días y lo
 * puede usar quien lo traiga. Los números salen de la configuración que cobra la caja (`config`); la base vuelve a comprobarlos. La clave de
 * la operación se queda igual mientras la cantidad no cambia: un doble toque o un reintento devuelve el MISMO cupón y no gasta dos veces.
 * Al terminar se vuelve a leer la página (`router.refresh()`): el saldo baja y el cupón aparece en «Tus cupones».
 */
export function CanjearPuntos({ saldo, config }: { saldo: number; config: ConfigPuntos }) {
  const opciones = opcionesDeCanje(saldo, config);
  const [puntos, setPuntos] = useState(opciones.tipo === "posible" ? opciones.min : 0);
  const [problema, setProblema] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const { aviso, mostrar } = useAvisoBreve();
  const clave = useRef<{ puntos: number; token: string }>({ puntos: -1, token: "" });

  if (opciones.tipo === "saldo_corto") {
    return (
      <p className="pt-nota">
        Con {puntosDichos(config.canjeMinimo)} ya puedes canjear. Te faltan <b>{puntosDichos(opciones.faltan)}</b>.
      </p>
    );
  }
  const { min, max, paso } = opciones;
  // Si el saldo cambió (se refrescó la página tras canjear), la cantidad se queda dentro de lo que alcanza.
  const elegidos = Math.min(Math.max(puntos, min), max);
  const valor = valorDePuntos(elegidos, config);

  function cambiar(delta: number) {
    setProblema(null);
    setPuntos(Math.min(max, Math.max(min, elegidos + delta)));
  }

  function canjear() {
    if (pendiente) return;
    if (clave.current.puntos !== elegidos) clave.current = { puntos: elegidos, token: crypto.randomUUID() };
    const token = clave.current.token;
    setProblema(null);
    iniciar(async () => {
      const r = await canjearPuntos(elegidos, token);
      if (r.estado !== "ok") {
        setProblema(MENSAJES_PUNTOS[r.estado]);
        return;
      }
      mostrar(`Listo: tu cupón de ${montoDicho(r.cupon.valor)} es ${r.cupon.codigo}.`, true);
      clave.current = { puntos: -1, token: "" };
      setPuntos(min);
      router.refresh();
    });
  }

  return (
    <div className="pt-canje">
      <p className="pt-canje-t">Cambia tus puntos por un cupón</p>
      <div className="pt-paso" role="group" aria-label="Cuántos puntos canjear">
        <button type="button" className="pt-paso-b" onClick={() => cambiar(-paso)} disabled={pendiente || elegidos <= min} aria-label="Canjear 100 puntos menos">
          <Icono nombre="menos" />
        </button>
        <div className="pt-paso-v" aria-live="polite">
          <b>{montoDicho(valor)}</b>
          <small>{puntosDichos(elegidos)}</small>
        </div>
        <button type="button" className="pt-paso-b" onClick={() => cambiar(paso)} disabled={pendiente || elegidos >= max} aria-label="Canjear 100 puntos más">
          <Icono nombre="mas" />
        </button>
      </div>
      <p className="pt-canje-s">
        Te quedan {puntosDichos(saldo - elegidos)}. El cupón vale {config.vigenciaDias} días, para una compra desde {montoDicho(Math.ceil(valor * config.compraMinimaX))}, y lo puede
        usar quien lo traiga.
      </p>
      {problema && (
        <p className="pt-problema" role="alert">
          {problema}
        </p>
      )}
      <button type="button" className="t-btn t-btn-ancho" onClick={canjear} disabled={pendiente} aria-busy={pendiente || undefined}>
        {pendiente ? "Creando tu cupón…" : `Canjear ${montoDicho(valor)}`}
      </button>
      {aviso}
    </div>
  );
}
