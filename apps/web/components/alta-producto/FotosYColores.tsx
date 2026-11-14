"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ImagePlus } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, HiloEnEspera } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { Punto } from "@/components/alta-producto/Punto";
import { NuevoColorAlta } from "@/components/alta-producto/NuevoColorAlta";
import { BotonFoto, BotonQuitarFoto, type FotoPendiente } from "@/components/alta-producto/FotosAlta";
import { useFirmaDeMitad } from "@/components/alta-producto/IdentidadAlta";
import type { CatalogoIAAlta } from "@/components/alta-producto/useCatalogoIAAlta";
import { pixelesDeLaFoto } from "@/components/alta-producto/pixelesDeLaFoto";
import type { ColorAlta } from "@/lib/alta-producto";
import { colorDeRespuesta } from "@/lib/color-alta-reglas";
import { componentesDeMezcla, mezclaExistente, tonosDeMezcla } from "@/lib/color-combinado";
import { leerColores, propuestaInicial, type Lectura } from "@/lib/colores-de-la-foto";
import { codigosParaReintentar, motivoDeFalla, segundaOpcionDelDibujo, sumarFotoUnaVez } from "@/lib/fotos-y-colores-reglas";
import { objecionFotoProducto } from "@/lib/producto-fotos";

// «Fotos y colores» (ADR-0663, Felipe 2026-11-13): los colores de la prenda salen de sus fotos. Se sube una foto por color («Otra foto»,
// y otra, y otra) y cada una se lee en el navegador (`leerColores`, < 1 s, sin IA): un tono es ese color de la carta; 2 a 4 en zonas
// grandes, UNA mezcla («Crudo con cobalto», ADR-0643: se busca o se crea por el mismo camino que «+ acompañante»). Lo que no está claro se
// pregunta, nunca se pone a escondidas: un tono lejos de la carta («Usar X» o «Crear este color»), un dibujo (el estampado), más de 4
// colores o una foto sin prenda. Una foto del mismo color que otra tarjeta (la espalda) se suma a esa tarjeta: no es otro color.
//
// La fuente de verdad sigue siendo la del formulario: los colores elegidos (en orden) y las fotos con su `colorCodigo`. Las fotos que todavía
// se leen o esperan una respuesta las guarda la PANTALLA (`useFotosEnCurso`), no esta pieza: así una foto que la IA está preparando no se pierde
// si la persona cambia de paso mientras tanto (antes se perdía, ya pagada; Felipe 2026-11-14). La usan Nuevo producto (paso 3) y Recibir ▸
// Nueva prenda (paso 2).

type Grupos = { familia: string; texto: string; colores: ColorAlta[] }[];

type Pendiente = {
  clave: string;
  archivo: File;
  vista: string;
  estado: "ia" | "leyendo" | "pregunta" | "armando";
  /** La versión de catálogo, si «Catálogo con IA» está encendido y respondió: la foto que se ve, se lee y se sube (con la real). */
  ia?: NonNullable<FotoPendiente["ia"]>;
  lectura?: Lectura<ColorAlta>;
  /** El color de cada parte, la base primero; `null` = la parte que hay que preguntar. */
  eleccion?: (string | null)[];
  motivo?: string;
};

/**
 * Las fotos que todavía se leen o esperan una respuesta, con su cola y lo ya asentado. Va en la PANTALLA, fuera del paso: «Fotos y colores»
 * se desmonta al ir a otro paso, y si esto viviera ahí, la respuesta de la IA llegaría a una pieza que ya no está y la foto se perdería.
 */
export function useFotosEnCurso() {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  // Una foto a la vez: dos fotos con la misma mezcla nueva no la piden dos veces a la base.
  const cola = useRef<Promise<void>>(Promise.resolve());
  // Las fotos que ya quedaron en su color: un clic repetido («Usar X», «Volver a intentar») no las asienta dos veces (/chaos 2026-11-14).
  const asentadas = useRef(new Set<string>());
  // Las vistas previas (blob:) abiertas: se liberan al salir de la PANTALLA, no del paso (si no, la tarjeta volvería sin foto).
  const vistas = useRef(new Set<string>());
  useEffect(() => {
    const abiertas = vistas.current;
    return () => abiertas.forEach((v) => URL.revokeObjectURL(v));
  }, []);
  return useMemo(
    () => ({
      pendientes,
      setPendientes,
      /** Pone un trabajo al final de la cola: las fotos se asientan de a una. */
      encolar: (trabajo: () => Promise<void> | void) => {
        cola.current = cola.current.then(trabajo);
      },
      /** ¿Esta foto ya quedó en su color? */
      asentada: (clave: string) => asentadas.current.has(clave),
      marcarAsentada: (clave: string) => void asentadas.current.add(clave),
      /** Una vista previa (blob:) que hay que liberar al salir de la pantalla, o que ya no (pasó al formulario o se liberó). */
      abrirVista: (url: string) => void vistas.current.add(url),
      soltarVista: (url: string) => void vistas.current.delete(url),
    }),
    [pendientes],
  );
}
export type FotosEnCurso = ReturnType<typeof useFotosEnCurso>;

/** Lo que la tarjeta muestra de cómo se leyó: el color de cada parte y cuánto ocupa. */
function Partes({ lectura }: { lectura: Lectura<ColorAlta> }) {
  if (lectura.tipo === "sin-prenda") return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-tinta/70">
      {lectura.partes.map((p) => (
        <span key={p.color.codigo} className="inline-flex items-center gap-1.5">
          <Punto hex={p.color.hex} familia={p.color.familiaColor} tipo={p.color.tipo} />
          {p.color.nombre} {Math.round(p.parte * 100)} %
        </span>
      ))}
    </p>
  );
}

/** «Crudo con ¿?»: el nombre de una mezcla a la que le falta una parte, para que se vea qué se está preguntando. */
function nombreParcial(nombres: string[]): string {
  const [base, ...resto] = nombres;
  const chicos = resto.map((n) => (n === "¿?" ? n : n.charAt(0).toLocaleLowerCase("es") + n.slice(1)));
  return chicos.length ? `${base} con ${chicos.length === 1 ? chicos[0] : `${chicos.slice(0, -1).join(", ")} y ${chicos[chicos.length - 1]}`}` : base;
}

/** La distancia al color de la carta, en palabras de tienda (la cifra ΔE no le dice nada a quien sube la foto). */
function cercania(distancia: number): string {
  return distancia < 3 ? "igual al de la lista de colores" : distancia <= 8 ? "muy parecido al de la lista de colores" : "distinto a todos los de la lista";
}

/** «¿Por qué?»: qué vio, qué juntó, qué dejó fuera y qué tan cerca quedó de la carta. */
function PorQue({ lectura, id }: { lectura: Lectura<ColorAlta>; id: string }) {
  if (lectura.tipo === "sin-prenda") return null;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const lineas = [
    lectura.transparente ? "La foto viene sin fondo: miré solo la prenda." : "La foto tiene fondo: dejé fuera lo que se parece al borde.",
    `Vi ${lectura.tonosVistos} tonos y junté los del mismo color con otra luz.`,
    ...lectura.partes.map((p) => `${p.color.nombre}: ${pct(p.parte)} de la prenda, ${cercania(p.distancia)}.`),
    ...(lectura.detalles.some((d) => d.parte >= 0.005) ? [`No cuenta, por chico: ${lectura.detalles.filter((d) => d.parte >= 0.005).map((d) => `${d.color.nombre} ${pct(d.parte)}`).join(", ")}.`] : []),
    ...(lectura.fondoComo ? [`El fondo se parece a ${lectura.fondoComo.nombre}: si la prenda lo tiene, pudo quedar fuera.`] : []),
  ];
  return (
    <ul id={id} className="nota-cayla sin-i space-y-1 text-sm">
      {lineas.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

export function FotosYColores({
  carta,
  grupos,
  elegidos,
  fotos,
  onFotos,
  onColorNuevo,
  onAgregarColor,
  onQuitarColor,
  onCambiarColor,
  disabled = false,
  guia,
  catalogo,
  enCurso,
}: {
  /** Toda la carta, también las mezclas guardadas (de ahí se reconoce una mezcla que ya existe). */
  carta: ColorAlta[];
  grupos: Grupos;
  /** Los colores elegidos, en orden. */
  elegidos: string[];
  fotos: FotoPendiente[];
  onFotos: (cambiar: (actuales: FotoPendiente[]) => FotoPendiente[]) => void;
  /** Un color o una mezcla recién creados: entran a la carta de la pantalla (sin elegirlos). */
  onColorNuevo: (color: ColorAlta) => void;
  /** Elige un color (si ya está elegido, no hace nada). */
  onAgregarColor: (codigo: string) => void;
  /** Quita un color y sus fotos. */
  onQuitarColor: (codigo: string) => void;
  /** Cambia un color por otro, con sus fotos (si el otro ya estaba, se juntan). */
  onCambiarColor: (de: string, a: string) => void;
  disabled?: boolean;
  /** El `data-guia` del bloque (la guía interactiva de la pantalla). */
  guia?: string;
  /** «Catálogo con IA»: encendido, cada foto pasa primero por la IA y el color se lee de su PNG sin fondo (sale más exacto). */
  catalogo?: CatalogoIAAlta;
  /** Las fotos que todavía no tienen color, guardadas por la pantalla (`useFotosEnCurso`): no se pierden al cambiar de paso, y la pantalla
   *  no deja crear mientras haya alguna. */
  enCurso: FotosEnCurso;
}) {
  const { pendientes, setPendientes, encolar, asentada, marcarAsentada, abrirVista, soltarVista } = enCurso;
  const [porQue, setPorQue] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  // La carta para elegir a mano: para cambiar el color de una tarjeta, para contestar una pregunta o «Elegir sin foto».
  const [carteando, setCarteando] = useState<{ para: "cambiar"; de: string } | { para: "pendiente"; clave: string } | { para: "sin-foto" } | null>(null);
  const [creando, setCreando] = useState<{ clave: string; parte: number } | null>(null);
  const firma = useFirmaDeMitad("alta_producto_color");

  // La lectura corre después de que el formulario ya sumó lo anterior: la carta y las fotos se leen de AHORA, no del render que la lanzó.
  const cartaRef = useRef(carta);
  const elegidosRef = useRef(elegidos);
  useEffect(() => {
    cartaRef.current = carta;
    elegidosRef.current = elegidos;
  }, [carta, elegidos]);
  const porCodigo = useMemo(() => new Map(carta.map((c) => [c.codigo, c])), [carta]);
  const cambiar = (clave: string, cambio: Partial<Pendiente> | null) =>
    setPendientes((ps) => (cambio === null ? ps.filter((p) => p.clave !== clave) : ps.map((p) => (p.clave === clave ? { ...p, ...cambio } : p))));

  /** La foto queda en su color: entra al formulario y sale de las pendientes. */
  function asentar(p: Pendiente, codigo: string) {
    if (asentada(p.clave)) return;
    marcarAsentada(p.clave);
    onAgregarColor(codigo);
    onFotos((fs) => sumarFotoUnaVez(fs, { clave: p.clave, archivo: p.archivo, vista: p.ia?.vistaIA ?? p.vista, colorCodigo: codigo, lectura: p.lectura, ia: p.ia }));
    soltarVista(p.vista);
    if (p.ia) soltarVista(p.ia.vistaIA);
    cambiar(p.clave, null);
  }

  /** Un color o una mezcla recién creados: a la carta de la pantalla y a la que leen las fotos en curso. */
  function sumarALaCarta(color: ColorAlta) {
    onColorNuevo(color);
    cartaRef.current = [...cartaRef.current, color];
  }

  /** De los colores de cada parte al color de la prenda: uno, o la mezcla (la que ya existe o una nueva). */
  async function resolver(p: Pendiente, codigos: string[]) {
    if (asentada(p.clave)) return;
    const unicos = codigos.filter((c, i) => codigos.indexOf(c) === i);
    if (unicos.length === 1) return asentar(p, unicos[0]);
    const componentes = componentesDeMezcla(unicos[0], unicos.slice(1, 4));
    const existe = mezclaExistente(cartaRef.current, componentes);
    if (existe) return asentar(p, existe.codigo);
    if (!firma.listo) {
      cambiar(p.clave, { estado: "pregunta", eleccion: codigos, motivo: firma.motivo ?? "Elige quién registra para armar la mezcla." });
      return;
    }
    cambiar(p.clave, { estado: "armando", motivo: undefined });
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...firma.encabezados() },
        body: JSON.stringify({ componentes }),
      });
      const datos = await res.json().catch(() => null);
      const leido = res.ok ? colorDeRespuesta(datos) : null;
      if (!leido) throw new Error((datos as { error?: string } | null)?.error ?? "No se pudo armar la mezcla.");
      sumarALaCarta(leido.color);
      asentar(p, leido.color.codigo);
    } catch (e) {
      cambiar(p.clave, { estado: "pregunta", eleccion: codigos, motivo: motivoDeFalla(e, "No se pudo armar la mezcla.") });
    }
  }

  // Las fotos se preparan y se leen en paralelo; solo se ASIENTAN de a una (`cola`), para no pedir dos veces la misma mezcla nueva.
  async function leer(p: Pendiente) {
    try {
      let conIA = p;
      if (catalogo?.encendido) {
        const png = await catalogo.prepararFoto(p.archivo);
        if (png) {
          const vistaIA = URL.createObjectURL(png);
          abrirVista(vistaIA);
          conIA = { ...p, ia: { png, vistaIA, vistaReal: p.vista, usar: true } };
        }
        cambiar(p.clave, { estado: "leyendo", ia: conIA.ia });
      }
      const lectura = leerColores(await pixelesDeLaFoto(conIA.ia?.png ?? p.archivo), cartaRef.current);
      const eleccion = propuestaInicial(lectura);
      const conTodo = { ...conIA, lectura, eleccion };
      if (eleccion.length && eleccion.every((c): c is string => c !== null)) encolar(() => resolver(conTodo, eleccion));
      else cambiar(p.clave, { estado: "pregunta", lectura, eleccion, ia: conIA.ia });
    } catch (e) {
      cambiar(p.clave, { estado: "pregunta", motivo: motivoDeFalla(e, "No se pudo leer esta foto.") });
    }
  }

  function agregar(archivos: File[]) {
    if (disabled) return;
    const malas: string[] = [];
    const nuevas: Pendiente[] = [];
    for (const archivo of archivos) {
      const objecion = objecionFotoProducto(archivo);
      if (objecion) malas.push(`${archivo.name}: ${objecion}`);
      else {
        const vista = URL.createObjectURL(archivo);
        abrirVista(vista);
        nuevas.push({ clave: crypto.randomUUID(), archivo, vista, estado: catalogo?.encendido ? "ia" : "leyendo" });
      }
    }
    if (malas.length) avisar.error(malas.length === 1 ? "Una foto no se puede usar" : `${malas.length} fotos no se pueden usar`, { detalle: malas.join(" · ") });
    if (!nuevas.length) return;
    setPendientes((ps) => [...ps, ...nuevas]);
    for (const p of nuevas) void leer(p);
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setEncima(false);
    agregar(Array.from(e.dataTransfer.files));
  }

  function quitarFoto(f: FotoPendiente) {
    URL.revokeObjectURL(f.vista);
    const quedan = fotos.filter((x) => x.colorCodigo === f.colorCodigo && x.clave !== f.clave);
    // La última foto de un color se lleva su color: el color salió de la foto.
    if (!quedan.length && f.colorCodigo) onQuitarColor(f.colorCodigo);
    else onFotos((fs) => fs.filter((x) => x.clave !== f.clave));
  }

  /** Contestar la parte que no estaba en la carta (o elegir el color entero, desde la carta). */
  function contestar(p: Pendiente, parte: number | null, codigo: string) {
    if (parte === null) {
      encolar(() => resolver(p, [codigo]));
      return;
    }
    const eleccion = [...(p.eleccion ?? [])];
    eleccion[parte] = codigo;
    if (eleccion.every((c): c is string => c !== null)) encolar(() => resolver({ ...p, eleccion }, eleccion));
    else cambiar(p.clave, { eleccion });
  }

  const pendienteCreando = creando ? (pendientes.find((x) => x.clave === creando.clave) ?? null) : null;
  // El tono que se vio en la foto para la parte que no está en la carta: la hoja «Nuevo color» arranca ahí (su paleta lo ajusta).
  const lecturaCreando = pendienteCreando?.lectura;
  const tonoACrear = creando && lecturaCreando && lecturaCreando.tipo !== "sin-prenda" ? lecturaCreando.partes[creando.parte]?.visto : undefined;
  const multicolor = carta.find((c) => c.nombre.trim().toLocaleLowerCase("es") === "multicolor");
  const nombreDe = (codigo: string) => {
    const c = porCodigo.get(codigo);
    return c?.nombre ?? codigo;
  };
  const tonosDe = (c: ColorAlta) => tonosDeMezcla(c, porCodigo);
  const nada = elegidos.length === 0 && pendientes.length === 0;

  return (
    <div
      className="space-y-3"
      data-guia={guia}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
    >
      {nada ? (
        <div className={`flex flex-col items-center gap-2 rounded-2xl border border-dashed px-5 py-8 text-center transition-colors ${encima ? "border-tinta bg-hueso" : "border-borde-control bg-hueso/50"}`}>
          <span className="grid h-12 w-12 place-items-center rounded-full border border-sand bg-papel">
            <ImagePlus aria-hidden className="h-5 w-5" />
          </span>
          <p className="font-serif text-[21px] leading-tight">Sube la foto de cada color</p>
          <p className="text-sm text-tinta/70">El color sale solo de la foto.</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <BotonFoto onArchivos={agregar} disabled={disabled} etiqueta="Subir fotos" className="btn-cayla btn-primario">
              <ImagePlus aria-hidden className="h-4 w-4" />
              Subir fotos
            </BotonFoto>
            <button type="button" className="btn-cayla btn-enlace" disabled={disabled} onClick={() => setCarteando({ para: "sin-foto" })}>
              Elegir sin foto
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
            {/* Lo que espera una respuesta va primero: es lo que toca hacer (/formidable 2026-11-14). */}
            {pendientes.map((p) => {
              const L = p.lectura;
              const partes = L && L.tipo !== "sin-prenda" ? L.partes.slice(0, 4) : [];
              return (
                <li key={p.clave} className="relative flex flex-col overflow-hidden rounded-2xl border border-[color:var(--vidrio-claro-borde)] [background:var(--vidrio-claro-fondo)]">
                  <div className="relative aspect-[4/5] bg-hueso/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.ia?.vistaIA ?? p.vista} alt="Foto de la prenda" className="h-full w-full object-contain" />
                    <BotonQuitarFoto
                      grande
                      etiqueta="Quitar esta foto"
                      disabled={disabled || p.estado === "armando" || p.estado === "ia"}
                      onClick={() => {
                        URL.revokeObjectURL(p.vista);
                        soltarVista(p.vista);
                        if (p.ia) {
                          URL.revokeObjectURL(p.ia.vistaIA);
                          soltarVista(p.ia.vistaIA);
                        }
                        cambiar(p.clave, null);
                      }}
                      className="absolute right-2 top-2"
                    />
                    {p.estado !== "pregunta" && (
                      <span className="absolute inset-x-0 bottom-0 bg-papel/90 px-3 py-2 text-sm" role="status">
                        {p.estado === "ia" ? "Arreglando la foto con IA…" : p.estado === "leyendo" ? "Leyendo los colores…" : "Armando la mezcla…"}
                        <HiloEnEspera />
                      </span>
                    )}
                  </div>
                  {p.estado === "pregunta" && (
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      {p.motivo && <p className="text-sm text-tinta/80">{p.motivo}</p>}
                      {L?.tipo === "estampado" && !p.motivo ? (
                        <>
                          {/* Con dibujo, lo de casi siempre es la mezcla de sus tonos: el dibujo ya lo dice el patrón (Felipe 2026-11-14). */}
                          <p className="text-[15px] font-medium">Tiene dibujo</p>
                          <Partes lectura={L} />
                          <div className="flex flex-wrap gap-2">
                            <Boton
                              type="button"
                              peso="primario"
                              className="btn-chico"
                              disabled={disabled}
                              onClick={() => {
                                const eleccion = partes.map((x) => x.color.codigo);
                                encolar(() => resolver({ ...p, eleccion }, eleccion));
                              }}
                            >
                              Es una mezcla
                            </Boton>
                            <Boton type="button" peso="fantasma" className="btn-chico" disabled={disabled} onClick={() => setCarteando({ para: "pendiente", clave: p.clave })}>
                              {segundaOpcionDelDibujo(carta)}
                            </Boton>
                          </div>
                        </>
                      ) : L?.tipo === "muchos" && !p.motivo ? (
                        <>
                          <p className="text-[15px] font-medium">Tiene {L.partes.length} colores</p>
                          <div className="flex flex-wrap gap-2">
                            {multicolor && (
                              <Boton type="button" peso="primario" className="btn-chico" disabled={disabled} onClick={() => contestar(p, null, multicolor.codigo)}>
                                Multicolor
                              </Boton>
                            )}
                            <Boton type="button" peso="fantasma" className="btn-chico" disabled={disabled} onClick={() => setCarteando({ para: "pendiente", clave: p.clave })}>
                              Elegir otro color
                            </Boton>
                          </div>
                        </>
                      ) : p.eleccion?.some((c) => c === null) ? (
                        <>
                          {partes.length > 1 && (
                            <p className="text-[15px] font-medium">
                              {nombreParcial(p.eleccion.map((c) => (c ? nombreDe(c) : "¿?")))}
                            </p>
                          )}
                          {partes.map((x, i) =>
                            p.eleccion?.[i] ? null : (
                              <div key={x.color.codigo} className="space-y-2">
                                <p className="text-[15px] font-medium">{partes.length > 1 ? "Un color no está creado" : "Este color no está creado"}</p>
                                <div className="flex items-center gap-2.5 text-sm text-tinta/80">
                                  {/* El tono medido es dato de la prenda, no del tema. */}
                                  <span data-color-dato aria-hidden className="h-9 w-9 shrink-0 rounded-xl border border-tinta/20" style={{ background: x.visto }} />
                                  <span>Se parece a {x.color.nombre}.</span>
                                </div>
                                {/* Lo seguro primero (Felipe 2026-11-14): usar el que ya existe; crear uno es la excepción. Un solo botón
                                    negro por tarjeta: el de la primera parte que falta. */}
                                <div className="flex flex-wrap gap-2">
                                  <Boton
                                    type="button"
                                    peso={i === p.eleccion!.indexOf(null) ? "primario" : "fantasma"}
                                    className="btn-chico"
                                    disabled={disabled}
                                    onClick={() => contestar(p, i, x.color.codigo)}
                                  >
                                    Usar {x.color.nombre}
                                  </Boton>
                                  <Boton type="button" peso="fantasma" className="btn-chico" disabled={disabled} onClick={() => setCreando({ clave: p.clave, parte: i })}>
                                    Crear este color
                                  </Boton>
                                </div>
                              </div>
                            ),
                          )}
                        </>
                      ) : p.eleccion?.length && p.motivo ? (
                        <Boton type="button" peso="primario" className="btn-chico" disabled={disabled} onClick={() => {
                            // Con TODOS los colores elegidos: reintentar con el primero dejaba una mezcla en un color liso (/chaos 2026-11-14).
                            const codigos = codigosParaReintentar(p.eleccion);
                            if (codigos) encolar(() => resolver(p, codigos));
                          }}
                        >
                          Volver a intentar
                        </Boton>
                      ) : (
                        <>
                          {!p.motivo && <p className="text-[15px] font-medium">No se ve la prenda en la foto</p>}
                          <Boton type="button" peso="primario" className="btn-chico w-fit" disabled={disabled} onClick={() => setCarteando({ para: "pendiente", clave: p.clave })}>
                            Elegir el color
                          </Boton>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}

            {elegidos.map((codigo) => {
              const color = porCodigo.get(codigo);
              const suyas = fotos.filter((f) => f.colorCodigo === codigo);
              // Lo leído se muestra solo si sigue siendo este color: después de «Cambiar», la foto decía otra cosa.
              const leida = suyas.find((f) => f.lectura)?.lectura;
              const deEste = new Set(color?.componentes?.length ? color.componentes : [codigo]);
              const lectura = leida && leida.tipo !== "sin-prenda" && leida.partes.slice(0, 4).every((p) => deEste.has(p.color.codigo)) ? leida : undefined;
              const nombre = color?.nombre ?? codigo;
              return (
                <li key={codigo} className="relative flex flex-col overflow-hidden rounded-2xl border border-[color:var(--vidrio-claro-borde)] [background:var(--vidrio-claro-fondo)]">
                  {suyas.length ? (
                    <div className="relative aspect-[4/5] bg-hueso/60">
                      {/* La foto que se sube tal cual (blob: local); next/image no aplica a una vista previa. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={suyas[0].vista} alt={`Foto de ${nombre}`} className="h-full w-full object-contain" />
                      {suyas.length > 1 && (
                        <span className="absolute left-2 top-2">
                          <Chip tono="neutro" versalitas={false}>
                            {suyas.length} fotos
                          </Chip>
                        </span>
                      )}
                      <BotonQuitarFoto grande etiqueta={`Quitar la foto de ${nombre}`} disabled={disabled} onClick={() => quitarFoto(suyas[0])} className="absolute right-2 top-2" />
                    </div>
                  ) : null}
                  {suyas.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                      {suyas.slice(1).map((f, i) => (
                        <span key={f.clave} className="relative h-12 w-10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.vista} alt={`Foto ${i + 2} de ${nombre}`} className="h-full w-full overflow-hidden rounded-lg border border-sand bg-hueso/60 object-contain" />
                          <BotonQuitarFoto etiqueta={`Quitar la foto ${i + 2} de ${nombre}`} disabled={disabled} onClick={() => quitarFoto(f)} className="absolute -right-1 -top-1" />
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-center gap-2.5">
                      <Punto hex={color?.hex ?? null} familia={color?.familiaColor} tipo={color?.tipo} tonos={color ? tonosDe(color) : null} grande />
                      <span className="min-w-0 flex-1 text-[15px] font-medium leading-tight">{nombre}</span>
                      {!suyas.length && <BotonQuitarFoto etiqueta={`Quitar ${nombre}`} disabled={disabled} onClick={() => onQuitarColor(codigo)} />}
                    </div>
                    {lectura && lectura.partes.length > 1 && <Partes lectura={lectura} />}
                    {lectura && porQue === codigo && <PorQue lectura={lectura} id={`por-que-${codigo}`} />}
                    <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1">
                      <button type="button" className="btn-cayla btn-enlace" disabled={disabled} onClick={() => setCarteando({ para: "cambiar", de: codigo })}>
                        Cambiar
                      </button>
                      {/* La foto de «Catálogo con IA» y la real quedan las dos: si la de IA no gusta, se vuelve a la tuya (y al revés). */}
                      {suyas[0]?.ia && catalogo && (
                        <button type="button" className="btn-cayla btn-enlace" disabled={disabled} onClick={() => catalogo.alternar(suyas[0].clave)}>
                          {suyas[0].ia.usar ? "Usar mi foto" : "Usar la de IA"}
                        </button>
                      )}
                      {lectura && (
                        <button
                          type="button"
                          className="btn-cayla btn-enlace"
                          aria-expanded={porQue === codigo}
                          aria-controls={`por-que-${codigo}`}
                          onClick={() => setPorQue((x) => (x === codigo ? null : codigo))}
                        >
                          {porQue === codigo ? "Ocultar" : "¿Por qué?"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}

            <li>
              <BotonFoto
                onArchivos={agregar}
                disabled={disabled}
                etiqueta="Otra foto"
                className={`flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-[15px] font-medium transition-colors hover:border-tinta disabled:opacity-40 ${encima ? "border-tinta bg-hueso" : "border-borde-control bg-hueso/40"}`}
              >
                <span className="grid h-11 w-11 place-items-center rounded-full border border-sand bg-papel">
                  <ImagePlus aria-hidden className="h-5 w-5" />
                </span>
                Otra foto
              </BotonFoto>
            </li>
          </ul>
          <button type="button" className="btn-cayla btn-enlace" disabled={disabled} onClick={() => setCarteando({ para: "sin-foto" })}>
            Elegir sin foto
          </button>
        </>
      )}

      {carteando && (
        <Modal
          variante="hoja"
          tamano="ancha"
          titulo={carteando.para === "cambiar" ? `Cambiar ${nombreDe(carteando.de)}` : carteando.para === "sin-foto" ? "Elegir sin foto" : "Elige el color"}
          conCerrar
          onClose={() => setCarteando(null)}
        >
          <ElegirColores
            colores={carta}
            grupos={grupos}
            elegidos={carteando.para === "sin-foto" ? elegidos : carteando.para === "cambiar" ? [carteando.de] : []}
            conMezclas
            onAlternar={(codigo) => {
              if (carteando.para === "sin-foto") {
                if (elegidosRef.current.includes(codigo)) onQuitarColor(codigo);
                else onAgregarColor(codigo);
                return;
              }
              if (carteando.para === "cambiar") {
                if (codigo !== carteando.de) onCambiarColor(carteando.de, codigo);
              } else {
                const p = pendientes.find((x) => x.clave === carteando.clave);
                if (p) contestar(p, null, codigo);
              }
              setCarteando(null);
            }}
            onCreado={(color) => {
              sumarALaCarta(color);
              if (carteando.para === "sin-foto") return onAgregarColor(color.codigo);
              if (carteando.para === "cambiar") onCambiarColor(carteando.de, color.codigo);
              else {
                const p = pendientes.find((x) => x.clave === carteando.clave);
                if (p) contestar(p, null, color.codigo);
              }
              setCarteando(null);
            }}
          />
        </Modal>
      )}

      {creando && pendienteCreando && (
        <Modal variante="hoja" tamano="ancha" titulo="Nuevo color" subtitulo="Queda en el catálogo y se elige en esta prenda." onClose={() => setCreando(null)}>
          {(cerrar) => (
            <NuevoColorAlta
              enModal
              colores={carta}
              elegidos={elegidos}
              tonoInicial={tonoACrear}
              fotoDeReferencia={pendienteCreando.vista}
              onCerrar={cerrar}
              onElegir={(codigo) => {
                setCreando(null);
                contestar(pendienteCreando, creando.parte, codigo);
              }}
              onCreado={(color) => {
                setCreando(null);
                sumarALaCarta(color);
                contestar(pendienteCreando, creando.parte, color.codigo);
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

