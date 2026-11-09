"use client";

import { useEffect, useId, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Campo, CampoTexto, Desplegable, Boton } from "@/components/ui/campos";
import { SelectorColor } from "@/components/SelectorColor";
import type { ColorAlta } from "@/lib/alta-producto";
import { colorDeRespuesta, coloresQueYaExisten, faltaParaCrear, familiaSugerida, nombreDeColor } from "@/lib/color-alta-reglas";
import { normalizarCodigo, sugerirCodigoColor } from "@/lib/color-codigo";
import { esHexValido } from "@/lib/color-parecido";
import { FAMILIAS_COLOR, textoDeFamilia } from "@/lib/colores-familias";
import { camposDeNuevoColor, coloresDominantes, ejemploDeEstampado, faltaParaEstampado, nombreDeEstampado, patronesDeEstampado } from "@/lib/color-estampado-reglas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Punto } from "@/components/alta-producto/Punto";
import { vistaDeCoincidencias } from "@/lib/atributo-parecido";
import { ExisteTambien, faltaPorExistente, useExisteTambien } from "@/components/ui/ExisteTambien";
import { createClient } from "@/lib/supabase/client";
import { sugerirColor } from "@/lib/sugerencias-alta-producto";
import { useEnLinea } from "@/lib/useEnLinea";
import { AvisoSinIdentidad, ResponsableEnHoja, useFirmaDeMitad, useHayResponsableDeMitad } from "@/components/alta-producto/IdentidadAlta";
import { Aviso } from "@/components/ui/Aviso";

// «+ Nuevo color» sin salir de Nuevo producto (spike producto-nuevo-v2, Felipe 2026-09-28).
//
// Antes un color que faltaba se creaba en otra pestaña (Catálogo → Atributos → Colores) y había que volver y recargar:
// quien estaba llenando una prenda con un tono nuevo la dejaba a medias. Acá es un formulario corto EN LÍNEA —nombre,
// muestra, familia y código— que escribe en el mismo `POST /api/productos/colores` que usa Atributos, así que las reglas
// son las mismas: cualquier cuenta lo crea, nace aprobado (ADR-0534) y el candado del nombre y del código lo pone la
// base, no esta pantalla.
//
// Lo que la pantalla sí hace antes de tocar la base, para no hacer llenar todo en vano:
//   · si el nombre ya existe, es sinónimo de uno o es casi igual («Verde Olivo» frente a «Verde oliva»), lo dice y ofrece elegir ese
//     en vez de crear otro: con el mismo nombre no deja crear; con uno casi igual, pregunta (ADR-0576, `ExisteTambien`);
//   · la familia sale del color existente más parecido y el código de `sugerirCodigoColor`: dos sugerencias que la
//     persona puede cambiar, y que dejan de seguir al nombre/tono en cuanto las toca;
//   · si el tono se ve casi igual a otro (ΔE2000 < 8), lo avisa sin bloquear (en la misma lista: `coloresQueYaExisten`).
//
// El código necesita TODOS los códigos, también los de colores desactivados (siguen siendo clave primaria): la
// pantalla solo trae los activos, así que al abrirse lee `colores.codigo` completo (una lectura GET: no activa el
// loader). Si esa lectura falla, se sugiere con los activos y, si choca, la API responde «Ese código de 3 letras ya lo
// usa otro color» y se muestra tal cual.
//
// Crear un color es un guardado aparte del producto; en el alta (y en Recibir) lo firma quien la inició (`useFirmaDeMitad`). Como hoja encima de esa pantalla,
// su combo quedaba detrás del velo y «Crear y elegir» se apagaba sin salida: desde el 2026-11-07 la hoja trae el mismo combo «Responsable» (es el mismo
// control: elegir aquí lo deja elegido allá). Fuera del alta (la ficha de un producto) sigue soltado del combo, con su clave.

export function NuevoColorAlta({
  colores,
  elegidos,
  nombreInicial = "",
  onCreado,
  onElegir,
  onCerrar,
  enModal = false,
}: {
  /** Va dentro de una hoja (ya es la tarjeta): sin marco propio y con el nombre en su propia línea. */
  enModal?: boolean;
  /** Los colores que ya tiene la pantalla: para reconocer un nombre repetido o casi igual, sugerir la familia y avisar parecidos. */
  colores: ColorAlta[];
  elegidos: string[];
  /** Lo que se escribió en el buscador antes de tocar «+ Crear el color «X»». */
  nombreInicial?: string;
  onCreado: (color: ColorAlta) => void;
  /** Elegir uno que ya existe (el nombre repetido o el parecido) en vez de crearlo. */
  onElegir: (codigo: string) => void;
  onCerrar: () => void;
}) {
  const [nombrePropio, setNombre] = useState(() => nombreDeColor(nombreInicial));
  // Un estampado (ADR-0634) arma su nombre con el patrón y el color que más se ve, hasta que la persona lo escribe a su manera.
  const [forma, setForma] = useState<"liso" | "estampado">("liso");
  const [nombreEscrito, setNombreEscrito] = useState(() => nombreDeColor(nombreInicial) !== "");
  const [patrones, setPatrones] = useState<{ id: string; nombre: string }[]>([]);
  const [patronId, setPatronId] = useState("");
  const [dominanteCodigo, setDominanteCodigo] = useState("");
  const [hexElegido, setHex] = useState<string | null>(null);
  // `null` = sin tocar: se muestra la sugerencia, que sigue al tono o al nombre.
  const [familiaElegida, setFamiliaElegida] = useState<string | null>(null);
  const [codigoEscrito, setCodigoEscrito] = useState<string | null>(null);
  const [otrosCodigos, setOtrosCodigos] = useState<Map<string, string>>(() => new Map());
  const [catalogoCompleto, setCatalogoCompleto] = useState<ColorAlta[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const enLinea = useEnLinea();
  const firma = useFirmaDeMitad("alta_producto_color");
  const conCombo = useHayResponsableDeMitad() && enModal;
  const id = useId();

  // Todos los códigos ocupados, también los de colores desactivados (ver arriba).
  useEffect(() => {
    let vigente = true;
    void (async () => {
      const { data } = await createClient().from("colores").select("codigo, nombre, hex, familia_color, tipo, sinonimos, activo");
      if (vigente && data) {
        setOtrosCodigos(new Map(data.map((c) => [c.codigo, c.nombre])));
        // `colores` puede traer solo los que a la prenda le faltan, y un estampado sí puede tener de dominante un color que la prenda ya tiene.
        setCatalogoCompleto(data.filter((c) => c.activo).map((c) => ({ codigo: c.codigo, nombre: c.nombre, hex: c.hex, familiaColor: c.familia_color ?? "", tipo: c.tipo, sinonimos: c.sinonimos })));
      }
    })().catch(() => {
      // Sin la lista completa se sugiere con los activos; si choca, lo dice la API.
    });
    return () => {
      vigente = false;
    };
  }, []);

  // Los patrones solo ayudan a nombrar el estampado: si no se pueden leer, el combo no sale y el nombre se escribe a mano.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      const { data } = await createClient().from("patrones").select("id, nombre").eq("activo", true).eq("estado", "aprobado").order("nombre");
      if (vigente && data) setPatrones(patronesDeEstampado(data));
    })().catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const ocupados = new Map(otrosCodigos);
  for (const c of colores) ocupados.set(c.codigo, c.nombre);

  const esForma = forma === "estampado";
  const opcionesDominante = coloresDominantes(catalogoCompleto ?? colores);
  const dominante = opcionesDominante.find((c) => c.codigo === dominanteCodigo) ?? null;
  const patron = patrones.find((p) => p.id === patronId)?.nombre ?? null;
  const nombre = esForma && !nombreEscrito ? nombreDeEstampado(patron, dominante?.nombre) : nombrePropio;
  // El tono y la familia de un estampado son los de su color dominante: así cae en esa familia en los filtros, la demanda y el plan del piso.
  const hex = esForma ? (dominante?.hex ?? null) : hexElegido;
  const familia = esForma ? (dominante?.familiaColor ?? "") : (familiaElegida ?? familiaSugerida(hex, colores));
  const codigo = codigoEscrito ?? sugerirCodigoColor(nombre, new Set(ocupados.keys()));
  // Los ejemplos de las dos cajas siguen a la familia (elegida, o la que sale del tono) y no repiten un color que ya existe.
  const ejemplo = sugerirColor(familia || null, colores, new Set(ocupados.keys()));
  const duenoDelCodigo = codigo.length === 3 ? ocupados.get(codigo) : undefined;
  // Lo que ya existe y se parece (ADR-0576). Mismo nombre: la base lo rechazaría (`colores_clave_unica`) y no se deja crear. Un sinónimo o un
  // casi igual («Verde Olivo»): se pregunta, puede ser otro color. Solo el tono: se avisa y se deja crear.
  // Un estampado no compara su tono: es el de su color dominante y siempre «se parecería» a ese color.
  const existe = useExisteTambien(nombre, vistaDeCoincidencias(coloresQueYaExisten(nombre, esForma ? null : hex, familia || null, colores), (c) => ({ id: c.codigo, nombre: c.nombre })));
  const faltaExiste = faltaPorExistente("color", nombre, existe);
  const falta = (esForma ? faltaParaEstampado({ nombre, colorDominante: dominante }) : null) ?? faltaParaCrear({ nombre, hex, familia, codigo });
  const bloqueo = !enLinea
    ? "Crear un color necesita internet. Cuando vuelva la conexión, toca «Crear y elegir»."
    : faltaExiste
      ? faltaExiste
      : duenoDelCodigo
        ? `El código ${codigo} ya lo usa «${duenoDelCodigo}». Escribe otro.`
        : falta;

  const guia = useGuiaCampos(camposDeNuevoColor({ estampado: esForma, nombre, hexListo: esHexValido(hexElegido), patron: patron !== null, hayPatrones: patrones.length > 0, dominante: dominante !== null }));

  async function crear() {
    setIntento(true);
    if (guardando || bloqueo || !firma.listo) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...firma.encabezados() },
        body: JSON.stringify({ nombre: nombreDeColor(nombre), codigo, familiaColor: familia, hex, tipo: esForma ? "estampado" : "solido" }),
      });
      const datos = await res.json().catch(() => null);
      const leido = res.ok ? colorDeRespuesta(datos) : null;
      if (!leido) {
        setError((datos as { error?: string } | null)?.error ?? "No se pudo crear el color. Vuelve a intentarlo.");
        return;
      }
      avisar.exito(`${leido.color.nombre} creado y elegido`);
      onCreado(leido.color);
    } catch {
      setError("No se pudo hablar con el servidor. Revisa la conexión y vuelve a tocar «Crear y elegir».");
    } finally {
      setGuardando(false);
    }
  }

  // Enter crea este color (no envía el formulario del producto); Escape cierra solo este bloque y no sigue subiendo
  // (ADR-0136: un control que usa el Escape lo detiene).
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void crear();
    } else if (e.key === "Escape" && !guardando) {
      e.stopPropagation();
      onCerrar();
    }
  }

  // Lo que falta se dice al tocar «Crear y elegir», no mientras se escribe; un código ocupado o la falta de red, de
  // entrada. Lo que ya existe lo dice su propia franja (con «Elegir …»), no se repite acá.
  const aviso = error ?? (faltaExiste ? null : intento || duenoDelCodigo || !enLinea ? bloqueo : null);

  // Elegir el que ya existe; si ya estaba elegido en esta prenda, solo se cierra este bloque.
  const elegirExistente = (o: { id: string; nombre: string }) =>
    elegidos.includes(o.id) ? { texto: `${o.nombre} ya está elegido`, onClick: onCerrar } : { texto: `Elegir ${o.nombre}`, onClick: () => onElegir(o.id) };

  return (
    <div className={enModal ? "space-y-3" : "anim-revelar space-y-3 rounded-xl border border-sand bg-crema px-3.5 py-3"}>
      <SegmentoDeslizante
        etiqueta="Cómo es la prenda"
        valor={forma}
        onCambio={(clave) => setForma(clave === "estampado" ? "estampado" : "liso")}
        opciones={[
          { clave: "liso", etiqueta: "Liso" },
          { clave: "estampado", etiqueta: "Estampado" },
        ]}
      />

      {/* Un estampado se nombra con lo que tiene (ADR-0634): dos «azules» distintos de la misma prenda dejan de ser el mismo color. */}
      {esForma && (
        <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
          {patrones.length > 0 && (
            <CampoGuiado id="patron" guia={guia}>
              <Campo etiqueta={guia.etiqueta("patron", "Patrón")} idEtiqueta={`${id}-patron`} sinPie>
                <Desplegable
                  forma="campo"
                  idEtiqueta={`${id}-patron`}
                  valor={patronId}
                  onValor={setPatronId}
                  opciones={patrones.map((p) => ({ valor: p.id, texto: p.nombre }))}
                  marcador="Elige…"
                  deshabilitado={guardando}
                />
              </Campo>
            </CampoGuiado>
          )}
          <CampoGuiado id="dominante" guia={guia}>
            <Campo etiqueta={guia.etiqueta("dominante", "El color que más se ve")} idEtiqueta={`${id}-dominante`} sinPie>
              <ComboBuscable
                id={`${id}-dominante`}
                valor={dominanteCodigo}
                onValor={setDominanteCodigo}
                etiquetaAccesible="El color que más se ve"
                marcador="Busca el color…"
                opciones={opcionesDominante.map((c) => ({ valor: c.codigo, texto: c.nombre, claves: c.sinonimos, icono: <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} /> }))}
              />
            </Campo>
          </CampoGuiado>
        </div>
      )}

      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:items-start ${
          esForma ? "" : enModal ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto]" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,11rem)_auto]"
        }`}
      >
        <CampoGuiado id="nombre" guia={guia} className={esForma ? "" : enModal ? "col-span-2 sm:col-span-3" : "col-span-2 sm:col-span-1"}>
          <CampoTexto
            etiqueta={guia.etiqueta("nombre", esForma ? "Nombre del estampado" : "Nombre del color")}
            sinPie
            id={`${id}-nombre`}
            autoFocus
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setNombreEscrito(e.target.value.trim() !== "");
            }}
            onBlur={() => setNombre((n) => (esForma && !nombreEscrito ? n : nombreDeColor(n)))}
            onKeyDown={teclas}
            placeholder={esForma ? ejemploDeEstampado(patron, dominante?.nombre) : ejemplo.nombre.texto}
            disabled={guardando}
          />
        </CampoGuiado>

        {!esForma && (
          <>
            {/* El tono, igual que en Atributos (`SelectorColor`): la muestra abre el selector del navegador y al lado se escribe
                el #hex o el R, G, B que trae la ficha del proveedor. Sin tono, la muestra es punteada: nunca un beige de relleno. */}
            <CampoGuiado id="tono" guia={guia} className="col-span-2 sm:col-span-1">
              <SelectorColor hex={hexElegido} onHex={setHex} etiqueta="Color · #hex o RGB" caja deshabilitado={guardando} />
            </CampoGuiado>

            <div>
              <Campo etiqueta="Familia" idEtiqueta={`${id}-familia`} sinPie>
                <Desplegable
                  forma="campo"
                  idEtiqueta={`${id}-familia`}
                  valor={familia}
                  onValor={setFamiliaElegida}
                  opciones={FAMILIAS_COLOR.map((f) => ({ valor: f.valor, texto: f.texto }))}
                  marcador={hex ? "Elige…" : "Sale del tono"}
                  deshabilitado={guardando}
                />
              </Campo>
            </div>
          </>
        )}

        <div className="w-[5.5rem]">
          <CampoTexto
            etiqueta="Código"
            sinPie
            mono
            id={`${id}-codigo`}
            value={codigo}
            maxLength={3}
            onChange={(e) => setCodigoEscrito(normalizarCodigo(e.target.value))}
            onKeyDown={teclas}
            placeholder={ejemplo.codigo.texto}
            disabled={guardando}
            aria-describedby={`${id}-codigo-ayuda`}
            className="uppercase"
          />
          <p id={`${id}-codigo-ayuda`} className="mt-1 text-sm text-taupe">
            Va en el SKU
          </p>
        </div>
      </div>

      {esForma && dominante && (
        <p className="text-sm text-taupe">Cuenta como {textoDeFamilia(dominante.familiaColor)} en los filtros y en el plan del piso. Súbele su foto: es como se va a reconocer.</p>
      )}

      <ExisteTambien que="color" nombre={nombre} solo="nombre" estado={existe} si={elegirExistente} deshabilitado={guardando} />
      <ExisteTambien que="color" nombre={nombre} solo="tono" estado={existe} si={elegirExistente} deshabilitado={guardando} />

      {conCombo ? <ResponsableEnHoja deshabilitado={guardando} /> : <AvisoSinIdentidad firma={firma} enHoja={enModal} />}
      <PieGuia guia={guia} listo={esForma ? "Todo listo para crear el estampado." : "Todo listo para crear el color."} />
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton peso="primario" cargando={guardando} textoCargando="Creando…"
          type="button"
          confirma={guia}
          className={guia.claseConfirmar}
          onClick={() => void crear()}
          disabled={guardando || !enLinea || existe.bloquea || !firma.listo}
          title={(!enLinea || existe.bloquea ? bloqueo : firma.motivo) ?? undefined}
        >
          Crear y elegir
        </Boton>
        <button type="button" onClick={onCerrar} disabled={guardando} className="btn-cayla btn-secundario">
          Cancelar
        </button>
      </div>

      {aviso && (
        <Aviso tono="error">{aviso}</Aviso>

      )}
    </div>
  );
}
