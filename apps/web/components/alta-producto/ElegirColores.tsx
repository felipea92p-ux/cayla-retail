"use client";

import { useState } from "react";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Modal } from "@/components/ui/Modal";
import { NuevoColorAlta } from "@/components/alta-producto/NuevoColorAlta";
import { ArmarMezcla } from "@/components/alta-producto/ArmarMezcla";
import type { ColorAlta } from "@/lib/alta-producto";
import { nombreDeColor } from "@/lib/color-alta-reglas";
import { esColorClaro } from "@/lib/color-escala";
import { coloresParecidos } from "@/lib/color-parecido";
import { fondoDeColor } from "@/components/ui/MuestraColor";
import { bordeDeMuestra, textoDeFamilia } from "@/lib/colores-familias";
import { fichaDelColor } from "@/lib/ficha-del-color";
import { FichaDelColor } from "@/components/ui/FichaDelColor";
import { useEnLinea } from "@/lib/useEnLinea";
import { Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { Punto } from "@/components/alta-producto/Punto";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { esEstampado, GRUPO_ESTAMPADOS } from "@/lib/color-estampado-reglas";
import { esCombinado, GRUPO_COMBINADOS, MAX_ACOMPANANTES, puedeAcompanar, tonosDeMezcla } from "@/lib/color-combinado";

// `Punto` vive en su propio archivo (la tabla de cantidades lo usa sin arrastrar este selector); se sigue exportando de aquí para quien ya lo importaba.
export { Punto };

// Elegir los colores de un producto (spike producto-nuevo-v2, Felipe 2026-09-28).
//
// Un color elegido se ve en UN solo lugar y de UNA sola forma: la fila de elegidos, cada uno como píldora (punto +
// nombre + ×), en el orden en que se eligieron. Antes el mismo estado se veía como chip con ✓ en «los más usados» y
// como píldora en «También elegiste», y Felipe lo encontró confuso. Por eso tampoco hay fila de «más usados».
//
// Se elige de una sola manera, con dos entradas:
//   1. el buscador («petróleo», «coral», o un sinónimo): la opción «+ Crear el color «X»» va primera y fija arriba de
//      la lista, para que nadie baje 76 colores hasta el final para crear el que falta;
//   2. la carta de colores, abierta de entrada: una fila por familia (las familias en el orden del espectro), del más claro al más
//      oscuro (`lib/color-escala.ts`; Felipe 2026-11-12: «todos en una sola línea iniciando por intensidad más suave a más fuerte»). El nombre sale al instante bajo la carta al pasar el mouse, al llegar con
//      Tab o al tocarlo (el `title` del navegador tardaba ~1 s y en tablet no salía), junto con su Pantone —la referencia real
//      de la tela— y con qué otro color se confunde. El elegido lleva anillo y ✓.
// «+ Nuevo color» abre un modal (`NuevoColorAlta`) sin salir de la pantalla; el color creado
// queda elegido (lo hace quien recibe `onCreado`: suma el color a su lista y lo elige).
//
// El título del bloque («Colores» y su bajada) lo pone el formulario, no este componente.

export function ElegirColores({
  colores,
  grupos,
  elegidos,
  onAlternar,
  onCreado,
  cartaAbierta = true,
  sinElegidos = false,
  enfocarBuscador = false,
  conMezclas = false,
}: {
  colores: ColorAlta[];
  grupos: { familia: string; texto: string; colores: ColorAlta[] }[];
  /** Códigos, en el orden en que se eligieron. */
  elegidos: string[];
  onAlternar: (codigo: string) => void;
  /** Un color recién creado: quien lo recibe lo suma a su lista y lo elige. */
  onCreado: (color: ColorAlta) => void;
  /** La carta arranca abierta (ADR-0312/0314, así sigue Nuevo producto). «Modelo nuevo» de la orden la abre cerrada: ahí el color es opcional y 89 círculos tapaban lo obligatorio. */
  cartaAbierta?: boolean;
  /** No dibuja la fila de elegidos (las píldoras con su ×): quien lo pide ya los muestra en otro lugar (en «Nueva orden», cada color elegido es una FILA de la tabla de cantidades, con su propio ×). De fábrica se dibuja. */
  sinElegidos?: boolean;
  /** El cursor llega al buscador al abrirse (y vuelve a él tras cada color elegido): para agregar varios seguidos tecleando. De fábrica no se mueve el foco. */
  enfocarBuscador?: boolean;
  /** Cada color elegido trae «+ acompañante»: lo vuelve una mezcla («Hueso con azul», ADR-0643) que se elige en su lugar. Nuevo producto y Recibir. */
  conMezclas?: boolean;
}) {
  const [carta, setCarta] = useState(cartaAbierta);
  // Crear un color nuevo sí remonta el buscador (queda vacío mientras la hoja de «Nuevo color» está abierta); elegir uno de la lista NO: el buscador se vacía solo (`varios`) y la lista
  // sigue donde estaba, sin cerrarse ni volver al inicio (Felipe, 2026-11-02: «busco y selecciono un color y se recarga el apartado de colores y me regresa al inicio»).
  const [vuelta, setVuelta] = useState(0);
  // El color bajo el mouse o con el foco: su nombre se lee al pie de la carta.
  const [senalado, setSenalado] = useState<ColorAlta | null>(null);
  // El formulario de color nuevo: cerrado (`null`) o abierto con el nombre que se traía del buscador. `vez` lo remonta
  // cuando se vuelve a pedir desde el buscador con otro nombre.
  const [nuevo, setNuevo] = useState<{ nombre: string; vez: number } | null>(null);
  const [pidioSinRed, setPidioSinRed] = useState(false);
  // La base a la que se le arma una mezcla («+ acompañante»), o `null`. Mientras se arma, la carta y el buscador suman ACOMPAÑANTES
  // en vez de elegir colores (Felipe 2026-11-12: sin otra hoja encima; `ArmarMezcla` es el panel sobre la carta).
  const [mezclaDe, setMezclaDe] = useState<ColorAlta | null>(null);
  const [acompanantes, setAcompanantes] = useState<string[]>([]);
  const enLinea = useEnLinea();

  const porCodigo = new Map(colores.map((c) => [c.codigo, c]));
  // Las mezclas guardadas («Celeste con blanco») no se ofrecen en la carta ni en el buscador (Felipe 2026-11-12: son una referencia de esa
  // prenda, casi nunca se repiten y nadie recuerda que existen; «mejor se ingresa siempre nuevamente viendo la prenda»). Si se arma una que
  // ya existe, `ArmarMezcla` la reusa. Las ya elegidas en esta prenda siguen a la vista en la fila de elegidos.
  const ofrecibles = colores.filter((c) => !esCombinado(c));

  function abrirMezcla(base: ColorAlta) {
    setMezclaDe(base);
    setAcompanantes([]);
    setCarta(true);
  }
  function cerrarMezcla() {
    setMezclaDe(null);
    setAcompanantes([]);
  }
  /** Un toque en la carta (o una opción del buscador): elige el color, o, armando una mezcla, lo suma o lo quita como acompañante. */
  function tocar(codigo: string) {
    if (!mezclaDe) {
      onAlternar(codigo);
      return;
    }
    const c = porCodigo.get(codigo);
    if (!c || !puedeAcompanar(c, mezclaDe.codigo)) return;
    setAcompanantes((xs) => (xs.includes(codigo) ? xs.filter((x) => x !== codigo) : xs.length >= MAX_ACOMPANANTES ? xs : [...xs, codigo]));
  }
  // Un código que la lista todavía no trae (recién creado, antes de que llegue a `colores`) se muestra igual, con su
  // código por nombre: nunca queda un color elegido sin su × para quitarlo.
  const listaElegidos = elegidos.map((cod) => porCodigo.get(cod) ?? { codigo: cod, nombre: cod, hex: null, familiaColor: "" });

  // Crear un color escribe en la base: sin red, el botón lo explica en vez de abrir un formulario que no va a poder
  // guardar (`navigator.onLine` solo es seguro cuando dice «sin red»: si miente, el guardado falla y lo dice).
  function abrirNuevo(nombre: string, remontar: boolean) {
    if (!enLinea) {
      setPidioSinRed(true);
      return;
    }
    setPidioSinRed(false);
    setNuevo((n) => (n && !remontar ? n : { nombre, vez: (n?.vez ?? 0) + 1 }));
  }

  return (
    <div className="space-y-2.5">
      {!sinElegidos && (
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        {listaElegidos.length === 0 ? (
          <p className="text-[12.5px] text-taupe">Todavía ninguno. Búscalo por su nombre o tócalo en la carta de abajo.</p>
        ) : (
          listaElegidos.map((c) => (
            <span
              key={c.codigo}
              className="inline-flex min-h-9 items-center gap-[7px] rounded-full border border-tinta bg-tinta/[0.07] py-1 pl-3 pr-1.5 text-[13.5px] text-tinta"
            >
              <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} tonos={tonosDeMezcla(c, porCodigo)} />
              {c.nombre}
              {conMezclas && !esCombinado(c) && porCodigo.has(c.codigo) && (
                <button
                  type="button"
                  onClick={() => {
                    const base = porCodigo.get(c.codigo);
                    if (base) abrirMezcla(base);
                  }}
                  aria-label={`Agregar un color que acompaña al ${c.nombre.toLocaleLowerCase("es")}`}
                  title="Si la prenda tiene otro color además de este (hueso con azul), agrégalo aquí"
                  className="btn-cayla btn-enlace ml-0.5 text-[12.5px]"
                >
                  + acompañante
                </button>
              )}
              <button
                type="button"
                onClick={() => onAlternar(c.codigo)}
                aria-label={`Quitar ${c.nombre}`}
                className="grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none text-tinta/60 hover:bg-tinta/[0.07] hover:text-tinta"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ComboBuscable
          key={vuelta}
          caja
          className="min-w-[13rem] flex-1"
          etiquetaAccesible={mezclaDe ? `Buscar un color que acompaña al ${mezclaDe.nombre.toLocaleLowerCase("es")}` : "Buscar un color"}
          autoFocus={enfocarBuscador}
          marcador={mezclaDe ? `Busca el color que acompaña al ${mezclaDe.nombre.toLocaleLowerCase("es")}` : `Busca entre los ${ofrecibles.length} colores: petróleo, coral…`}
          valor=""
          varios
          onValor={(cod) => {
            if (mezclaDe) tocar(cod);
            else if (!elegidos.includes(cod)) onAlternar(cod);
          }}
          opciones={(mezclaDe ? ofrecibles.filter((c) => puedeAcompanar(c, mezclaDe.codigo)) : ofrecibles).map((c) => ({
            valor: c.codigo,
            texto: c.nombre,
            detalle: (mezclaDe ? acompanantes : elegidos).includes(c.codigo) ? "elegido" : undefined,
            claves: c.sinonimos,
            icono: <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} tonos={tonosDeMezcla(c, porCodigo)} />,
          }))}
          crearArriba
          crear={{
            etiqueta: (t) => (t ? `+ Crear el color «${nombreDeColor(t)}»` : "+ Crear un color nuevo"),
            onCrear: (t) => {
              abrirNuevo(t, true);
              setVuelta((v) => v + 1);
            },
          }}
        />
        <button type="button" onClick={() => setCarta((v) => !v)} aria-expanded={carta} className="btn-cayla btn-secundario">
          {carta ? "Ocultar la carta" : `Ver los ${ofrecibles.length} colores`}
        </button>
        <Boton type="button" onClick={() => abrirNuevo("", false)} aria-expanded={nuevo !== null} title={enLinea ? undefined : "Crear un color necesita internet"}>
          + Nuevo color
        </Boton>
      </div>

      {pidioSinRed && !enLinea && nuevo === null && (
        <Aviso tono="atencion" chico>
          Crear un color necesita internet. Cuando vuelva la conexión, toca «+ Nuevo color» otra vez; los colores de la carta
          se pueden elegir igual.
        </Aviso>

      )}

      {/* «+ Nuevo color» es un modal (Felipe, 2026-10-02): el formulario en línea empujaba la carta hacia abajo y, con ella abierta,
          quedaba lejos del botón. Cinco datos (nombre, tono, familia, código y su aviso de parecidos) merecen su propia hoja. */}
      {nuevo && (
        <Modal variante="hoja" tamano="ancha" titulo="Nuevo color" subtitulo="Queda en el catálogo y se elige en esta prenda." onClose={() => setNuevo(null)}>
          {(cerrar) => (
            <NuevoColorAlta
              key={nuevo.vez}
              enModal
              colores={colores}
              elegidos={elegidos}
              nombreInicial={nuevo.nombre}
              onCerrar={cerrar}
              onElegir={(cod) => {
                if (!elegidos.includes(cod)) onAlternar(cod);
                setNuevo(null);
              }}
              onCreado={(color) => {
                setNuevo(null);
                onCreado(color);
              }}
            />
          )}
        </Modal>
      )}

      {/* Armando una mezcla: su panel va sobre la carta, que queda abierta para elegir los acompañantes (Felipe 2026-11-12). */}
      {mezclaDe && (
        <ArmarMezcla
          base={mezclaDe}
          colores={colores}
          acompanantes={acompanantes}
          onQuitar={tocar}
          onCerrar={cerrarMezcla}
          onLista={(mezcla) => {
            // La prenda es UNA: la mezcla reemplaza a la base entre los elegidos.
            onAlternar(mezclaDe.codigo);
            if (!elegidos.includes(mezcla.codigo)) onCreado(mezcla);
            cerrarMezcla();
          }}
        />
      )}

      {carta && (
        // La carta de color (ADR-0312, ADR-0314). Cada familia es UNA fila, una escala pura de claro a oscuro (la claridad nunca «sube» a
        // mitad de una fila; desde el 2026-11-12 sin partir Azul, Verde y Morado en gamas, que la abrían en tres o cuatro filas). Los círculos miden 32 px (antes 26): el ojo juzga un tono por su área y por lo
        // que lo rodea, y uno chico se ve peor. El color adentro es EXACTO (el #hex de la base, sin velo); el borde es el mismo
        // tono más oscuro (`bordeDeMuestra`), así un blanco, un crudo o un negro tienen su filo. Si el BLOQUE es angosto
        // (`@container`, no la ventana), el nombre de la familia va arriba de sus círculos; si es muy ancho, las familias van en
        // dos columnas (spike: desde ~900 px).
        // El color señalado se queda mientras el mouse siga dentro de la carta (también sobre el pie: sus círculos de «combínalo con»
        // se señalan a su vez); al salir de la carta, el pie vuelve a su pista.
        <div className="@container anim-revelar rounded-xl border border-sand bg-crema px-3 py-1.5" onMouseLeave={() => setSenalado(null)}>
          <div className="grid @4xl:grid-cols-2 @4xl:gap-x-6">
            {grupos.filter((g) => g.familia !== GRUPO_COMBINADOS).map((g, i) => (
              <div
                key={g.familia}
                className={`grid gap-1 py-1.5 @md:grid-cols-[5rem_minmax(0,1fr)] @md:items-start @md:gap-2.5 ${
                  i === 0 ? "" : i === 1 ? "border-t border-sand @4xl:border-t-0" : "border-t border-sand"
                }`}
              >
                {/* El nombre se alinea con la PRIMERA fila (los círculos miden 32 px), no con el centro del bloque. */}
                <p className="text-[11.5px] text-taupe @md:flex @md:h-8 @md:items-center">{g.texto}</p>
                {g.familia === GRUPO_ESTAMPADOS || g.familia === GRUPO_COMBINADOS ? (
                  // Un estampado se elige por su nombre (ADR-0634): su punto solo dice el color dominante, y dos azules distintos se verían iguales.
                  // Una mezcla también (ADR-0643): «Hueso con azul» y «Hueso con celeste» se distinguen por su nombre, no por medio círculo.
                  <div className="flex flex-wrap gap-1.5">
                    {g.colores.map((c) => (
                      <ChipOpcion key={c.codigo} elegido={(mezclaDe ? acompanantes : elegidos).includes(c.codigo)} onClick={() => { tocar(c.codigo); setSenalado(c); }}>
                        <span className="inline-flex items-center gap-1.5">
                          <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} tonos={tonosDeMezcla(c, porCodigo)} />
                          {c.nombre}
                        </span>
                      </ChipOpcion>
                    ))}
                  </div>
                ) : (
                <div className="flex flex-wrap gap-1.5">
                      {g.colores.map((c) => {
                        // Armando una mezcla, la marca es de acompañante y la base no se toca (no se acompaña a sí misma).
                        const elegido = (mezclaDe ? acompanantes : elegidos).includes(c.codigo);
                        const esLaBase = mezclaDe?.codigo === c.codigo;
                        return (
                          <button
                            key={c.codigo}
                            type="button"
                            disabled={esLaBase}
                            onClick={() => {
                              tocar(c.codigo);
                              // Con el dedo no hay mouse encima ni foco (Safari no enfoca un botón al tocarlo): el toque también lo nombra.
                              setSenalado(c);
                            }}
                            aria-pressed={elegido}
                            aria-label={c.nombre}
                            onMouseEnter={() => setSenalado(c)}
                            onFocus={() => setSenalado(c)}
                            onBlur={() => setSenalado(null)}
                            style={{ background: fondoDeColor(c.hex, c.familiaColor, c.tipo), borderColor: bordeDeMuestra(c.hex) }}
                            // El círculo es el color de la prenda, que no cambia con el tema: el visto de encima usa la tinta y la crema fijas (ADR-0336). Con las del tema, en oscuro el ✓ sobre Blanco no se veía.
                            className={`grid h-8 w-8 place-items-center rounded-full border border-tinta/25 text-[12px] font-bold transition-transform duration-150 hover:scale-110 ${
                              elegido ? "ring-2 ring-tinta ring-offset-2 ring-offset-crema" : ""
                            } ${esColorClaro(c.hex) ? "text-tinta-fija" : "text-crema-fija"}`}
                          >
                            {elegido && <span aria-hidden>✓</span>}
                            {!c.hex && !elegido && <span aria-hidden className="text-[9px] text-taupe">?</span>}
                          </button>
                        );
                      })}
                </div>
                )}
              </div>
            ))}
          </div>
          {/* Alto fijo: el pie no empuja la carta al aparecer o cambiar de nombre. `aria-hidden` porque cada círculo ya
              se anuncia con su `aria-label`; leerlo dos veces sería ruido para un lector de pantalla. */}
          <PieDeLaCarta senalado={senalado} elegido={senalado ? elegidos.includes(senalado.codigo) : false} colores={colores} porCodigo={porCodigo} />
        </div>
      )}
    </div>
  );
}

/**
 * Lo que dice la carta del color señalado, en dos renglones de alto fijo. Arriba: su muestra grande, el nombre, la familia y el
 * código Pantone —la referencia real de la tela: el círculo es una aproximación en pantalla— y, si lo hay, con qué otro color se
 * confunde (ΔE2000 < 8, `color-parecido.ts`), para que nadie elija el «Perla» creyendo que es distinto del «Crudo». Abajo, su ficha
 * (ADR-0316; Felipe 2026-10-10): con qué se combina, como círculos que dicen su nombre al pasar o tocar, y la primera frase de lo que
 * transmite. Un color sin ficha deja el segundo renglón vacío: nunca un «sin datos».
 */
function PieDeLaCarta({ senalado, elegido, colores, porCodigo }: { senalado: ColorAlta | null; elegido: boolean; colores: ColorAlta[]; porCodigo: ReadonlyMap<string, ColorAlta> }) {
  // Un estampado lleva el tono de su color dominante (ADR-0634): ni «se confunde» con otros ni otros con él.
  // Una mezcla guarda el hex de su base (ADR-0643): tampoco se confunde con nada, ni nada con ella.
  const lisos = (c: ColorAlta) => !esEstampado(c) && !esCombinado(c);
  const parecidos = senalado && lisos(senalado) ? coloresParecidos(senalado.hex, senalado.familiaColor, colores.filter(lisos), { excluir: senalado.codigo }).slice(0, 2) : [];
  const ficha = senalado ? fichaDelColor(senalado.codigo, porCodigo) : null;
  return (
    // En el celular y la tablet de Nuevo producto, pegado abajo sobre la barra de la ficha mientras se recorre la carta (Felipe, 2026-10-09):
    // el pie quedaba al final de 14 familias y el color tocado se sumaba ARRIBA, a la fila de elegidos; quien tocaba un círculo no veía ni
    // su nombre ni que quedó elegido. `--alto-barra-ficha` lo publica la barra (`FichaPrevia`): crece con la tira de parecidas.
    // DENTRO DE UNA HOJA (Recibir, Agregar colores…) va quieto al pie de la carta (Felipe 2026-11-12: «queda muy arriba y no se mantiene en
    // el fondo»): ahí no hay barra que publique su alto, y el respaldo lo dejaba flotando a media carta, tapando dos filas.
    // El círculo es la muestra grande (40 px) y la letra, de lectura (14 px).
    <div aria-hidden className="sticky bottom-[var(--alto-barra-ficha,6rem)] z-10 -mx-3 mt-1 grid min-h-14 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-t border-sand bg-crema px-3 py-1.5 text-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0 [[role=dialog]_&]:static [[role=dialog]_&]:mx-0 [[role=dialog]_&]:bg-transparent [[role=dialog]_&]:px-0">
      {senalado ? (
        <>
          <Punto hex={senalado.hex} familia={senalado.familiaColor} tipo={senalado.tipo} tonos={tonosDeMezcla(senalado, porCodigo)} muestra />
          <div className="grid min-w-0 gap-0.5">
          <p className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate">
              <span className="text-tinta">{senalado.nombre}</span>
              <span className="text-taupe">
                {" "}
                · {senalado.familiaColor ? textoDeFamilia(senalado.familiaColor) : "Varios colores"}
                {senalado.pantoneTcx ? ` · ${senalado.pantoneTcx}` : ""}
                {elegido ? " · elegido" : ""}
              </span>
              {parecidos.length > 0 && <span className="text-ambar-profundo"> · se confunde con {parecidos.map((p) => p.color.nombre).join(" y ")}</span>}
            </span>
          </p>
          <p className="flex min-w-0 items-center">
            <FichaDelColor ficha={ficha} forma="linea" />
          </p>
          </div>
        </>
      ) : (
        // Sin un color señalado, lo justo (Felipe 2026-11-12: «ese texto es muy largo e innecesario»).
        <p className="col-span-2 text-taupe">Toca un color para ver su nombre.</p>
      )}
    </div>
  );
}

