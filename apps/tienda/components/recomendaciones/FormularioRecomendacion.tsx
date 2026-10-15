"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enviarRecomendacion } from "@/app/acciones/recomendaciones";
import { nombreTienda } from "@/lib/pedidos";
import {
  MENSAJE_SIN_RED,
  MINIMO,
  claveDelBorrador,
  contador,
  fraseDelCupo,
  mensajeDelEnvio,
  problemaDelTexto,
  sePuedeEnviar,
} from "@/lib/recomendaciones";
import { Icono } from "../Icono";

type Sede = { id: string; nombre: string };

/**
 * Escribir una recomendación (ADR-0408, Felipe 2026-10-15): sobre qué es —«CAYLA en general» o una tienda de las que se ven en la
 * web— y el texto libre, con las letras que se cuentan mientras se escribe (como las cuenta la base: hasta 1000). Dice antes de enviar
 * que va con su nombre, para que CAYLA pueda responderle, y al enviar lo agradece. No se manda dos veces: el botón se apaga mientras
 * viaja y cada borrador lleva su marca (la misma marca, la misma recomendación: un doble toque o un reintento sin red no la repiten).
 * Si algo falla, lo escrito se queda.
 */
export function FormularioRecomendacion({
  sedes,
  nombre,
  nombreCorto,
  quedanHoy: quedanAlEntrar,
  tope,
}: {
  sedes: readonly Sede[];
  nombre: string;
  nombreCorto: string;
  quedanHoy: number;
  tope: number;
}) {
  const router = useRouter();
  const [sobre, setSobre] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gracias, setGracias] = useState<{ quedanHoy: number } | null>(null);
  const [quedan, setQuedan] = useState(quedanAlEntrar);
  const [enviando, iniciar] = useTransition();
  const marca = useRef<{ clave: string; marca: string } | null>(null);
  const enVuelo = useRef(false);

  const problema = problemaDelTexto(texto);
  const cuenta = contador(texto);
  const sinCupo = quedan <= 0;
  const listo = sePuedeEnviar(texto) && !sinCupo;

  function enviar() {
    if (enVuelo.current || !listo) return;
    const clave = claveDelBorrador(texto, sobre);
    if (!marca.current || marca.current.clave !== clave) marca.current = { clave, marca: crypto.randomUUID() };
    const laMarca = marca.current.marca;
    enVuelo.current = true;
    setError(null);
    iniciar(async () => {
      try {
        const r = await enviarRecomendacion(texto, sobre, laMarca);
        if (r.estado === "enviada") {
          marca.current = null;
          setTexto("");
          setSobre(null);
          setQuedan(r.quedanHoy);
          setGracias({ quedanHoy: r.quedanHoy });
          router.refresh();
          return;
        }
        if (r.estado === "limite") setQuedan(0);
        setError(mensajeDelEnvio(r));
      } catch {
        // La acción ni llegó (sin red): lo escrito se queda y la marca también (si llegó, reintentar no la repite).
        setError(MENSAJE_SIN_RED);
      } finally {
        enVuelo.current = false;
      }
    });
  }

  if (gracias) {
    return (
      <div className="r-gracias" role="status">
        <span className="r-gracias-ic" aria-hidden>
          <Icono nombre="check" />
        </span>
        <h2 className="w-titulo">
          ¡Gracias, <em>{nombreCorto}!</em>
        </h2>
        <p className="w-texto">
          Ya la recibimos. El equipo de CAYLA la va a leer y, si hace falta, te responde aquí mismo: la verás en «Lo que nos escribiste».
        </p>
        {gracias.quedanHoy > 0 ? (
          <button type="button" className="t-btn t-btn-sec" onClick={() => setGracias(null)}>
            Escribir otra
          </button>
        ) : (
          <p className="w-texto-sec">Por hoy ya está. Mañana puedes enviarnos otra.</p>
        )}
      </div>
    );
  }

  return (
    <form
      className="r-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <fieldset className="r-sobre">
        <legend>¿Sobre qué es?</legend>
        <div className="r-sobre-opciones" role="radiogroup" aria-label="Sobre qué es">
          {[{ id: null, nombre: "CAYLA en general" } as { id: string | null; nombre: string }, ...sedes].map((s) => (
            <button
              key={s.id ?? "general"}
              type="button"
              role="radio"
              aria-checked={sobre === s.id}
              className="r-sobre-op"
              onClick={() => setSobre(s.id)}
              disabled={enviando}
            >
              {s.id ? nombreTienda(s.nombre) : s.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="w-campo" data-estado={problema ? "error" : texto.trim() ? "hecho" : "sigue"}>
        <label htmlFor="recomendacion-texto">
          Tu recomendación <span className="w-marca">{problema ? "Revisa" : texto.trim() ? "✓ Listo" : ""}</span>
        </label>
        <textarea
          id="recomendacion-texto"
          className="w-caja r-caja"
          rows={6}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          placeholder="Escribe lo que quieras: una idea, algo que te gustaría encontrar o algo que podamos hacer mejor."
          aria-describedby="recomendacion-cuenta recomendacion-error"
          aria-invalid={problema ? true : undefined}
          disabled={enviando}
        />
        <div className="r-bajo">
          <span className="w-ayuda">
            {problema === "corto"
              ? `Escribe al menos ${MINIMO} letras.`
              : problema === "largo"
                ? "Acórtala un poco para poder enviarla."
                : "Escribe con tus palabras: la leemos tal cual."}
          </span>
          <span id="recomendacion-cuenta" className="r-cuenta" data-tono={cuenta.tono}>
            <span aria-hidden>{cuenta.texto}</span>
            <span className="t-sr">{cuenta.lector}</span>
          </span>
        </div>
      </div>

      <p className="r-firma">
        <Icono nombre="persona" />
        <span>
          Va con tu nombre, <b>{nombre}</b>, para que podamos responderte aquí. {fraseDelCupo(tope, quedan)}
        </span>
      </p>

      <div className="w-res" id="recomendacion-error" aria-live="polite">
        {error && <span className="w-res-error">{error}</span>}
        {!error && sinCupo && <span className="w-res-aviso">Hoy ya nos enviaste {tope}. Mañana puedes enviarnos otra: las leemos todas.</span>}
      </div>

      <button className="t-btn t-btn-ancho" type="submit" disabled={!listo || enviando} aria-busy={enviando || undefined}>
        {enviando ? "Enviando…" : "Enviar recomendación"}
      </button>
    </form>
  );
}
