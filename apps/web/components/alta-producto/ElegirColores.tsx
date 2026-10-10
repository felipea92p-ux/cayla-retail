"use client";

import { useState } from "react";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Modal } from "@/components/ui/Modal";
import { NuevoColorAlta } from "@/components/alta-producto/NuevoColorAlta";
import type { ColorAlta } from "@/lib/alta-producto";
import { nombreDeColor } from "@/lib/color-alta-reglas";
import { esColorClaro, partirEnGamas } from "@/lib/color-escala";
import { coloresParecidos } from "@/lib/color-parecido";
import { bordeDeMuestra, fondoDeMuestra, textoDeFamilia } from "@/lib/colores-familias";
import { fichaDelColor } from "@/lib/ficha-del-color";
import { FichaDelColor } from "@/components/ui/FichaDelColor";
import { useEnLinea } from "@/lib/useEnLinea";
import { Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";

// Elegir los colores de un producto (spike producto-nuevo-v2, Felipe 2026-09-28).
//
// Un color elegido se ve en UN solo lugar y de UNA sola forma: la fila de elegidos, cada uno como píldora (punto +
// nombre + ×), en el orden en que se eligieron. Antes el mismo estado se veía como chip con ✓ en «los más usados» y
// como píldora en «También elegiste», y Felipe lo encontró confuso. Por eso tampoco hay fila de «más usados».
//
// Se elige de una sola manera, con dos entradas:
//   1. el buscador («petróleo», «coral», o un sinónimo): la opción «+ Crear el color «X»» va primera y fija arriba de
//      la lista, para que nadie baje 76 colores hasta el final para crear el que falta;
//   2. la carta de colores, abierta de entrada: una fila por gama (las familias en el orden del espectro; Azul, Verde y Morado, que son
//      anchas, en dos filas), de claro a oscuro (`lib/color-escala.ts`). El nombre sale al instante bajo la carta al pasar el mouse, al llegar con
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
}: {
  colores: ColorAlta[];
  grupos: { familia: string; texto: string; colores: ColorAlta[] }[];
  /** Códigos, en el orden en que se eligieron. */
  elegidos: string[];
  onAlternar: (codigo: string) => void;
  /** Un color recién creado: quien lo recibe lo suma a su lista y lo elige. */
  onCreado: (color: ColorAlta) => void;
}) {
  const [carta, setCarta] = useState(true);
  // El buscador vuelve a vacío después de cada elección: se remonta con otra `key`.
  const [vuelta, setVuelta] = useState(0);
  // El color bajo el mouse o con el foco: su nombre se lee al pie de la carta.
  const [senalado, setSenalado] = useState<ColorAlta | null>(null);
  // El formulario de color nuevo: cerrado (`null`) o abierto con el nombre que se traía del buscador. `vez` lo remonta
  // cuando se vuelve a pedir desde el buscador con otro nombre.
  const [nuevo, setNuevo] = useState<{ nombre: string; vez: number } | null>(null);
  const [pidioSinRed, setPidioSinRed] = useState(false);
  // El último color creado por alguien que no es Líder: queda pendiente de aprobación y se dice mientras siga elegido.
  const [pendiente, setPendiente] = useState<ColorAlta | null>(null);
  const enLinea = useEnLinea();

  const porCodigo = new Map(colores.map((c) => [c.codigo, c]));
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
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        {listaElegidos.length === 0 ? (
          <p className="text-[12.5px] text-taupe">Todavía ninguno. Búscalo por su nombre o tócalo en la carta de abajo.</p>
        ) : (
          listaElegidos.map((c) => (
            <span
              key={c.codigo}
              className="inline-flex min-h-9 items-center gap-[7px] rounded-full border border-tinta bg-tinta/[0.07] py-1 pl-3 pr-1.5 text-[13.5px] text-tinta"
            >
              <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />
              {c.nombre}
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

      {pendiente && elegidos.includes(pendiente.codigo) && (
        <p role="status" className="text-xs text-taupe">
          <span className="text-tinta">{pendiente.nombre}</span>: ya lo puedes usar; queda pendiente de que un Líder lo apruebe.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ComboBuscable
          key={vuelta}
          caja
          className="min-w-[13rem] flex-1"
          etiquetaAccesible="Buscar un color"
          marcador={`Busca entre los ${colores.length} colores: petróleo, coral…`}
          valor=""
          onValor={(cod) => {
            if (!elegidos.includes(cod)) onAlternar(cod);
            setVuelta((v) => v + 1);
          }}
          opciones={colores.map((c) => ({
            valor: c.codigo,
            texto: c.nombre,
            detalle: elegidos.includes(c.codigo) ? "elegido" : undefined,
            claves: c.sinonimos,
            icono: <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />,
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
          {carta ? "Ocultar la carta" : `Ver los ${colores.length} colores`}
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
        <Modal variante="hoja" ancho="max-w-[680px]" titulo="Nuevo color" subtitulo="Queda en el catálogo y se elige en esta prenda." onClose={() => setNuevo(null)}>
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
              onCreado={(color, esPendiente) => {
                setNuevo(null);
                setPendiente(esPendiente ? color : null);
                onCreado(color);
              }}
            />
          )}
        </Modal>
      )}

      {carta && (
        // La carta de color (ADR-0312, ADR-0314). Cada familia es un bloque y cada gama, una FILA propia: cada fila es una escala
        // pura de claro a oscuro (la claridad nunca «sube» a mitad de una fila). Los círculos miden 32 px (antes 26): el ojo juzga un tono por su área y por lo
        // que lo rodea, y uno chico se ve peor. El color adentro es EXACTO (el #hex de la base, sin velo); el borde es el mismo
        // tono más oscuro (`bordeDeMuestra`), así un blanco, un crudo o un negro tienen su filo. Si el BLOQUE es angosto
        // (`@container`, no la ventana), el nombre de la familia va arriba de sus círculos; si es muy ancho, las familias van en
        // dos columnas (spike: desde ~900 px).
        // El color señalado se queda mientras el mouse siga dentro de la carta (también sobre el pie: sus círculos de «combínalo con»
        // se señalan a su vez); al salir de la carta, el pie vuelve a su pista.
        <div className="@container anim-revelar rounded-xl border border-sand bg-crema px-3 py-1.5" onMouseLeave={() => setSenalado(null)}>
          <div className="grid @4xl:grid-cols-2 @4xl:gap-x-6">
            {grupos.map((g, i) => (
              <div
                key={g.familia}
                className={`grid gap-1 py-1.5 @md:grid-cols-[5rem_minmax(0,1fr)] @md:items-start @md:gap-2.5 ${
                  i === 0 ? "" : i === 1 ? "border-t border-sand @4xl:border-t-0" : "border-t border-sand"
                }`}
              >
                {/* El nombre se alinea con la PRIMERA fila (los círculos miden 32 px), no con el centro del bloque. */}
                <p className="text-[11.5px] text-taupe @md:flex @md:h-8 @md:items-center">{g.texto}</p>
                <div className="flex flex-col gap-1.5">
                  {partirEnGamas(g.colores).map((gama, k) => (
                    <div key={k} className="flex flex-wrap gap-1.5">
                      {gama.map((c) => {
                        const elegido = elegidos.includes(c.codigo);
                        return (
                          <button
                            key={c.codigo}
                            type="button"
                            onClick={() => {
                              onAlternar(c.codigo);
                              // Con el dedo no hay mouse encima ni foco (Safari no enfoca un botón al tocarlo): el toque también lo nombra.
                              setSenalado(c);
                            }}
                            aria-pressed={elegido}
                            aria-label={c.nombre}
                            onMouseEnter={() => setSenalado(c)}
                            onFocus={() => setSenalado(c)}
                            onBlur={() => setSenalado(null)}
                            style={{ background: fondoDeMuestra(c.hex, c.familiaColor, c.tipo) ?? "transparent", borderColor: bordeDeMuestra(c.hex) }}
                            className={`grid h-8 w-8 place-items-center rounded-full border border-tinta/25 text-[12px] font-bold transition-transform duration-150 hover:scale-110 ${
                              elegido ? "ring-2 ring-tinta ring-offset-2 ring-offset-crema" : ""
                            } ${esColorClaro(c.hex) ? "text-tinta" : "text-crema"}`}
                          >
                            {elegido && <span aria-hidden>✓</span>}
                            {!c.hex && !elegido && <span aria-hidden className="text-[9px] text-taupe">?</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
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
  const parecidos = senalado ? coloresParecidos(senalado.hex, senalado.familiaColor, colores, { excluir: senalado.codigo }).slice(0, 2) : [];
  const ficha = senalado ? fichaDelColor(senalado.codigo, porCodigo) : null;
  return (
    // En el celular y la tablet, pegado abajo sobre la barra de la ficha mientras se recorre la carta (Felipe, 2026-10-09): el pie
    // quedaba al final de 14 familias y el color tocado se sumaba ARRIBA, a la fila de elegidos; quien tocaba un círculo no veía ni
    // su nombre ni que quedó elegido. `--alto-barra-ficha` lo publica la barra (`FichaPrevia`): crece con la tira de parecidas.
    <div aria-hidden className="sticky bottom-[var(--alto-barra-ficha,6rem)] z-10 -mx-3 mt-1 grid h-12 grid-rows-2 content-center gap-0.5 border-t border-sand bg-crema px-3 pt-1 text-[12px] lg:static lg:mx-0 lg:bg-transparent lg:px-0">
      {senalado ? (
        <>
          <p className="flex min-w-0 items-center gap-2">
            <Punto hex={senalado.hex} familia={senalado.familiaColor} tipo={senalado.tipo} grande />
            <span className="min-w-0 truncate">
              <span className="text-tinta">{senalado.nombre}</span>
              <span className="text-taupe">
                {" "}
                · {textoDeFamilia(senalado.familiaColor)}
                {senalado.pantoneTcx ? ` · ${senalado.pantoneTcx}` : ""}
                {elegido ? " · elegido" : ""}
              </span>
              {parecidos.length > 0 && <span className="text-ambar-profundo"> · se confunde con {parecidos.map((p) => p.color.nombre).join(" y ")}</span>}
            </span>
          </p>
          <p className="flex min-w-0 items-center">
            <FichaDelColor ficha={ficha} forma="linea" />
          </p>
        </>
      ) : (
        <p className="row-span-2 self-center text-taupe">Pasa el mouse o toca un círculo: aquí sale su nombre.</p>
      )}
    </div>
  );
}

export function Punto({ hex, familia, tipo, grande = false }: { hex: string | null; familia?: string | null; tipo?: string | null; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border border-tinta/20 ${grande ? "h-5 w-5" : "h-2.5 w-2.5"}`}
      style={{ background: fondoDeMuestra(hex, familia, tipo) ?? "transparent", borderColor: bordeDeMuestra(hex) }}
    />
  );
}
