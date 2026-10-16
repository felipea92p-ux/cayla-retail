"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarRecomendacion } from "@/app/acciones/recomendaciones";
import { nombreTienda } from "@/lib/pedidos";
import {
  MENSAJE_SIN_RED,
  MINIMO,
  claveDelBorrador,
  contador,
  fraseDelCupo,
  indiceConTecla,
  marcaDelTexto,
  mensajeDelEnvio,
  problemaDelTexto,
  sePuedeEnviar,
  TEXTO_DE_MARCA,
  vistaDelFormulario,
} from "@/lib/recomendaciones";
import { Icono } from "../Icono";

type Sede = { id: string; nombre: string };
type Opcion = { id: string | null; nombre: string };

/**
 * Escribir una recomendación (ADR-0408, Felipe 2026-10-15): sobre qué es —«CAYLA en general» o una tienda de las que se ven en la
 * web— y el texto libre, con las letras que se cuentan mientras se escribe (como las cuenta la base: hasta 1000). Dice antes de enviar
 * que va con su nombre, para que CAYLA pueda responderle, y al enviar lo agradece. No se manda dos veces: el botón se apaga mientras
 * viaja y cada borrador lleva su marca (la misma marca, la misma recomendación: un doble toque o un reintento sin red no la repiten).
 * Si algo falla, lo escrito se queda. Sin cupo hoy (y sin nada escrito) dice «Por hoy ya está» en vez de ofrecer una caja que no se podrá
 * enviar (`vistaDelFormulario`). «¿Sobre qué es?» se maneja con las flechas, como un grupo de botones de radio.
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
  // «Enviando…» dura lo que tarda la base en contestar, nada más: la lista de abajo se vuelve a leer aparte (`router.refresh()`). Con
  // `useTransition`, esa lectura quedaba dentro de la espera y quien tocaba «Escribir otra» enseguida veía medio segundo la caja apagada y
  // «Enviando…» de nuevo (y el foco no podía llegar a la caja).
  const [enviando, setEnviando] = useState(false);
  const marca = useRef<{ clave: string; marca: string } | null>(null);
  const enVuelo = useRef(false);
  // A dónde va el foco cuando cambia la ficha: al «¡Gracias!» recién enviada (quien usa el teclado o un lector de pantalla sigue desde
  // ahí, no desde arriba de la página: el botón que tenía el foco ya no está) y a la caja al volver con «Escribir otra».
  const foco = useRef<"gracias" | "caja" | null>(null);
  const tituloGracias = useRef<HTMLHeadingElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const botonesSobre = useRef<(HTMLButtonElement | null)[]>([]);

  const problema = problemaDelTexto(texto);
  const cuenta = contador(texto);
  const sinCupo = quedan <= 0;
  const listo = sePuedeEnviar(texto) && !sinCupo;
  const marcaCampo = marcaDelTexto(texto, sinCupo);
  const vista = vistaDelFormulario({ gracias: gracias !== null, quedan, texto });
  const opciones: Opcion[] = [{ id: null, nombre: "CAYLA en general" }, ...sedes];
  const elegida = Math.max(0, opciones.findIndex((o) => o.id === sobre));

  useEffect(() => {
    if (foco.current === "gracias") tituloGracias.current?.focus();
    if (foco.current === "caja") caja.current?.focus();
    foco.current = null;
  }, [vista]);

  async function enviar() {
    if (enVuelo.current || !listo) return;
    const clave = claveDelBorrador(texto, sobre);
    if (!marca.current || marca.current.clave !== clave) marca.current = { clave, marca: crypto.randomUUID() };
    const laMarca = marca.current.marca;
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    try {
      const r = await enviarRecomendacion(texto, sobre, laMarca);
      if (r.estado === "enviada") {
        marca.current = null;
        foco.current = "gracias";
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
      setEnviando(false);
    }
  }

  /** Las flechas mueven la elección dentro de «¿Sobre qué es?» (y el foco con ella); Tab sale del grupo. */
  function moverConTecla(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const j = indiceConTecla(opciones.length, i, e.key);
    if (j === null) return;
    e.preventDefault();
    setSobre(opciones[j].id);
    botonesSobre.current[j]?.focus();
  }

  if (vista === "gracias" && gracias) {
    return (
      <div className="r-gracias" role="status">
        <span className="r-gracias-ic" aria-hidden>
          <Icono nombre="check" />
        </span>
        <h2 className="w-titulo" ref={tituloGracias} tabIndex={-1}>
          ¡Gracias, <em>{nombreCorto}!</em>
        </h2>
        <p className="w-texto">
          Ya la recibimos. El equipo de CAYLA la va a leer y, si hace falta, te responde aquí mismo: la verás en «Lo que nos escribiste».
        </p>
        {gracias.quedanHoy > 0 ? (
          <button
            type="button"
            className="t-btn t-btn-sec"
            onClick={() => {
              foco.current = "caja";
              setGracias(null);
            }}
          >
            Escribir otra
          </button>
        ) : (
          <p className="w-texto-sec">Por hoy ya está. Mañana puedes enviarnos otra.</p>
        )}
      </div>
    );
  }

  if (vista === "sin_cupo") {
    return (
      <div className="r-gracias r-sin-cupo" role="status">
        <span className="r-sin-cupo-ic" aria-hidden>
          <Icono nombre="reloj" />
        </span>
        <h2 className="w-titulo">
          Por hoy <em>ya está.</em>
        </h2>
        <p className="w-texto">{mensajeDelEnvio({ estado: "limite", tope })}</p>
      </div>
    );
  }

  return (
    <form
      className="r-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      {/* Un grupo de botones de radio con su nombre en la leyenda; las flechas eligen (solo la elegida está en el orden de Tab). */}
      <fieldset className="r-sobre" role="radiogroup" aria-labelledby="recomendacion-sobre">
        <legend id="recomendacion-sobre">¿Sobre qué es?</legend>
        <div className="r-sobre-opciones">
          {opciones.map((s, i) => (
            <button
              key={s.id ?? "general"}
              ref={(b) => {
                botonesSobre.current[i] = b;
              }}
              type="button"
              role="radio"
              aria-checked={sobre === s.id}
              tabIndex={i === elegida ? 0 : -1}
              className="r-sobre-op"
              onClick={() => setSobre(s.id)}
              onKeyDown={(e) => moverConTecla(e, i)}
              disabled={enviando}
            >
              {s.id ? nombreTienda(s.nombre) : s.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="w-campo" data-estado={marcaCampo ?? undefined}>
        <label htmlFor="recomendacion-texto">
          Tu recomendación <span className="w-marca">{marcaCampo ? TEXTO_DE_MARCA[marcaCampo] : ""}</span>
        </label>
        <textarea
          id="recomendacion-texto"
          ref={caja}
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
        {!error && sinCupo && <span className="w-res-aviso">{mensajeDelEnvio({ estado: "limite", tope })}</span>}
      </div>

      <button className="t-btn t-btn-ancho" type="submit" disabled={!listo || enviando} aria-busy={enviando || undefined}>
        {enviando ? "Enviando…" : "Enviar recomendación"}
      </button>
    </form>
  );
}
