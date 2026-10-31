"use client";

import { useEffect, useId, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Campo, CampoTexto, Desplegable, Boton } from "@/components/ui/campos";
import { SelectorColor } from "@/components/SelectorColor";
import type { ColorAlta } from "@/lib/alta-producto";
import { colorDeRespuesta, coloresQueYaExisten, faltaParaCrear, familiaSugerida, nombreDeColor } from "@/lib/color-alta-reglas";
import { normalizarCodigo, sugerirCodigoColor } from "@/lib/color-codigo";
import { FAMILIAS_COLOR } from "@/lib/colores-familias";
import { vistaDeCoincidencias } from "@/lib/atributo-parecido";
import { ExisteTambien, faltaPorExistente, useExisteTambien } from "@/components/ui/ExisteTambien";
import { createClient } from "@/lib/supabase/client";
import { sugerirColor } from "@/lib/sugerencias-alta-producto";
import { useEnLinea } from "@/lib/useEnLinea";
import { AvisoSinIdentidad, useFirmaDeMitad } from "@/components/alta-producto/IdentidadAlta";
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
// Crear un color es un guardado aparte del producto; en el alta lo firma quien la inició (`useFirmaDeMitad`), sin combo propio desde
// 2026-09-29. Fuera del alta (la ficha de un producto) sigue soltado del combo, con su clave.

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
  const [nombre, setNombre] = useState(() => nombreDeColor(nombreInicial));
  const [hex, setHex] = useState<string | null>(null);
  // `null` = sin tocar: se muestra la sugerencia, que sigue al tono o al nombre.
  const [familiaElegida, setFamiliaElegida] = useState<string | null>(null);
  const [codigoEscrito, setCodigoEscrito] = useState<string | null>(null);
  const [otrosCodigos, setOtrosCodigos] = useState<Map<string, string>>(() => new Map());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const enLinea = useEnLinea();
  const firma = useFirmaDeMitad("alta_producto_color");
  const id = useId();

  // Todos los códigos ocupados, también los de colores desactivados (ver arriba).
  useEffect(() => {
    let vigente = true;
    void (async () => {
      const { data } = await createClient().from("colores").select("codigo, nombre");
      if (vigente && data) setOtrosCodigos(new Map(data.map((c) => [c.codigo, c.nombre])));
    })().catch(() => {
      // Sin la lista completa se sugiere con los activos; si choca, lo dice la API.
    });
    return () => {
      vigente = false;
    };
  }, []);

  const ocupados = new Map(otrosCodigos);
  for (const c of colores) ocupados.set(c.codigo, c.nombre);

  const familia = familiaElegida ?? familiaSugerida(hex, colores);
  const codigo = codigoEscrito ?? sugerirCodigoColor(nombre, new Set(ocupados.keys()));
  // Los ejemplos de las dos cajas siguen a la familia (elegida, o la que sale del tono) y no repiten un color que ya existe.
  const ejemplo = sugerirColor(familia || null, colores, new Set(ocupados.keys()));
  const duenoDelCodigo = codigo.length === 3 ? ocupados.get(codigo) : undefined;
  // Lo que ya existe y se parece (ADR-0576). Mismo nombre: la base lo rechazaría (`colores_clave_unica`) y no se deja crear. Un sinónimo o un
  // casi igual («Verde Olivo»): se pregunta, puede ser otro color. Solo el tono: se avisa y se deja crear.
  const existe = useExisteTambien(nombre, vistaDeCoincidencias(coloresQueYaExisten(nombre, hex, familia || null, colores), (c) => ({ id: c.codigo, nombre: c.nombre })));
  const faltaExiste = faltaPorExistente("color", nombre, existe);
  const falta = faltaParaCrear({ nombre, hex, familia, codigo });
  const bloqueo = !enLinea
    ? "Crear un color necesita internet. Cuando vuelva la conexión, toca «Crear y elegir»."
    : faltaExiste
      ? faltaExiste
      : duenoDelCodigo
        ? `El código ${codigo} ya lo usa «${duenoDelCodigo}». Escribe otro.`
        : falta;

  async function crear() {
    setIntento(true);
    if (guardando || bloqueo || !firma.listo) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...firma.encabezados() },
        body: JSON.stringify({ nombre: nombreDeColor(nombre), codigo, familiaColor: familia, hex }),
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
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:items-start ${
          enModal ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto]" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,11rem)_auto]"
        }`}
      >
        <div className={enModal ? "col-span-2 sm:col-span-3" : "col-span-2 sm:col-span-1"}>
          <CampoTexto
            etiqueta="Nombre del color"
            sinPie
            id={`${id}-nombre`}
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => setNombre((n) => nombreDeColor(n))}
            onKeyDown={teclas}
            placeholder={ejemplo.nombre.texto}
            disabled={guardando}
          />
        </div>

        {/* El tono, igual que en Atributos (`SelectorColor`): la muestra abre el selector del navegador y al lado se escribe
            el #hex o el R, G, B que trae la ficha del proveedor. Sin tono, la muestra es punteada: nunca un beige de relleno. */}
        <div className="col-span-2 sm:col-span-1">
          <SelectorColor hex={hex} onHex={setHex} etiqueta="Color · #hex o RGB" caja deshabilitado={guardando} />
        </div>

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

      <ExisteTambien que="color" nombre={nombre} solo="nombre" estado={existe} si={elegirExistente} deshabilitado={guardando} />
      <ExisteTambien que="color" nombre={nombre} solo="tono" estado={existe} si={elegirExistente} deshabilitado={guardando} />

      <AvisoSinIdentidad firma={firma} />
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton peso="primario" cargando={guardando} textoCargando="Creando…"
          type="button"
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
