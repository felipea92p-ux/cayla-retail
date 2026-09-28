"use client";

import { useEffect, useId, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Desplegable } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { SelectorColor } from "@/components/SelectorColor";
import type { ColorAlta } from "@/lib/alta-producto";
import { colorConEseNombre, colorDeRespuesta, faltaParaCrear, familiaSugerida, nombreDeColor } from "@/lib/color-alta-reglas";
import { normalizarCodigo, sugerirCodigoColor } from "@/lib/color-codigo";
import { coloresParecidos } from "@/lib/color-parecido";
import { FAMILIAS_COLOR } from "@/lib/colores-familias";
import { clave } from "@/lib/buscar-prenda-v2";
import { createClient } from "@/lib/supabase/client";
import { useEnLinea } from "@/lib/useEnLinea";
import { useResponsable } from "@/lib/useResponsable";

// «+ Nuevo color» sin salir de Nuevo producto (spike producto-nuevo-v2, Felipe 2026-09-28).
//
// Antes un color que faltaba se creaba en otra pestaña (Catálogo → Atributos → Colores) y había que volver y recargar:
// quien estaba llenando una prenda con un tono nuevo la dejaba a medias. Acá es un formulario corto EN LÍNEA —nombre,
// muestra, familia y código— que escribe en el mismo `POST /api/productos/colores` que usa Atributos, así que las reglas
// son las mismas: cualquier cuenta lo crea, nace `pendiente` si no es Líder («ya lo puedes usar») y el candado del
// nombre y del código lo pone la base, no esta pantalla.
//
// Lo que la pantalla sí hace antes de tocar la base, para no hacer llenar todo en vano:
//   · si el nombre ya existe (o es sinónimo de uno), ofrece elegir ese en vez de crear otro;
//   · la familia sale del color existente más parecido y el código de `sugerirCodigoColor`: dos sugerencias que la
//     persona puede cambiar, y que dejan de seguir al nombre/tono en cuanto las toca;
//   · si el tono se ve casi igual a otro (ΔE2000 < 8), lo avisa sin bloquear.
//
// El código necesita TODOS los códigos, también los de colores desactivados (siguen siendo clave primaria): la
// pantalla solo trae los activos, así que al abrirse lee `colores.codigo` completo (una lectura GET: no activa el
// loader). Si esa lectura falla, se sugiere con los activos y, si choca, la API responde «Ese código de 3 letras ya lo
// usa otro color» y se muestra tal cual.
//
// Responsable (ADR-0161): crear un color es un guardado aparte del producto, con su propio combo. Vive en este
// componente, que solo se monta al abrir el formulario: no se lee la asistencia por un botón que nadie tocó.

export function NuevoColorAlta({
  colores,
  elegidos,
  nombreInicial = "",
  onCreado,
  onElegir,
  onCerrar,
}: {
  /** Los colores que ya tiene la pantalla: para reconocer un nombre repetido, sugerir la familia y avisar parecidos. */
  colores: ColorAlta[];
  elegidos: string[];
  /** Lo que se escribió en el buscador antes de tocar «+ Crear el color «X»». */
  nombreInicial?: string;
  onCreado: (color: ColorAlta, pendiente: boolean) => void;
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
  const responsable = useResponsable();
  const enLinea = useEnLinea();
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
  const duenoDelCodigo = codigo.length === 3 ? ocupados.get(codigo) : undefined;
  const existente = colorConEseNombre(nombre, colores);
  // Mismo nombre: la base lo rechazaría (`colores_clave_unica`). Por sinónimo: solo se ofrece, puede ser otro color.
  const mismoNombre = existente !== undefined && clave(existente.nombre) === clave(nombreDeColor(nombre));
  const parecidos = existente ? [] : coloresParecidos(hex, familia || null, colores).slice(0, 2);
  const falta = faltaParaCrear({ nombre, hex, familia, codigo });
  const bloqueo = !enLinea
    ? "Crear un color necesita internet. Cuando vuelva la conexión, toca «Crear y elegir»."
    : mismoNombre
      ? `«${existente!.nombre}» ya existe: elígelo en vez de crearlo.`
      : duenoDelCodigo
        ? `El código ${codigo} ya lo usa «${duenoDelCodigo}». Escribe otro.`
        : falta;

  async function crear() {
    setIntento(true);
    if (guardando || bloqueo || !responsable.listo) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ nombre: nombreDeColor(nombre), codigo, familiaColor: familia, hex }),
      });
      const datos = await res.json().catch(() => null);
      const leido = res.ok ? colorDeRespuesta(datos) : null;
      if (!leido) {
        setError((datos as { error?: string } | null)?.error ?? "No se pudo crear el color. Vuelve a intentarlo.");
        return;
      }
      responsable.despues(null);
      avisar.exito(`${leido.color.nombre} creado y elegido`);
      onCreado(leido.color, leido.pendiente);
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
  // entrada. El nombre repetido ya lo dice su propia franja (con «Elegir …»), no se repite acá.
  const aviso = error ?? (mismoNombre ? null : intento || duenoDelCodigo || !enLinea ? bloqueo : null);

  return (
    <div className="anim-revelar space-y-3 rounded-xl border border-sand bg-crema px-3.5 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,11rem)_auto] sm:items-start">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`${id}-nombre`} className="mb-1 block text-xs font-semibold text-tinta">
            Nombre del color
          </label>
          <input
            id={`${id}-nombre`}
            autoFocus
            autoComplete="off"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => setNombre((n) => nombreDeColor(n))}
            onKeyDown={teclas}
            placeholder="Palo de rosa"
            disabled={guardando}
            className="caja-cayla h-10 w-full px-3 text-sm text-tinta outline-none placeholder:text-tinta/45"
          />
        </div>

        {/* El tono, igual que en Atributos (`SelectorColor`): la muestra abre el selector del navegador y al lado se escribe
            el #hex o el R, G, B que trae la ficha del proveedor. Sin tono, la muestra es punteada: nunca un beige de relleno. */}
        <div className="col-span-2 sm:col-span-1">
          <SelectorColor hex={hex} onHex={setHex} etiqueta="Color · #hex o RGB" caja deshabilitado={guardando} />
        </div>

        <div>
          <span id={`${id}-familia`} className="mb-1 block text-xs font-semibold text-tinta">
            Familia
          </span>
          <Desplegable
            forma="caja"
            idEtiqueta={`${id}-familia`}
            valor={familia}
            onValor={setFamiliaElegida}
            opciones={FAMILIAS_COLOR.map((f) => ({ valor: f.valor, texto: f.texto }))}
            marcador={hex ? "Elige…" : "Sale del tono"}
            deshabilitado={guardando}
          />
        </div>

        <div>
          <label htmlFor={`${id}-codigo`} className="mb-1 block text-xs font-semibold text-tinta">
            Código
          </label>
          <input
            id={`${id}-codigo`}
            autoComplete="off"
            value={codigo}
            maxLength={3}
            onChange={(e) => setCodigoEscrito(normalizarCodigo(e.target.value))}
            onKeyDown={teclas}
            placeholder="PAR"
            disabled={guardando}
            aria-describedby={`${id}-codigo-ayuda`}
            className="caja-cayla h-10 w-[5.5rem] px-3 font-mono text-sm uppercase tracking-wider text-tinta tabular-nums outline-none placeholder:text-tinta/45"
          />
          <p id={`${id}-codigo-ayuda`} className="mt-1 text-[11px] text-taupe">
            Va en el SKU
          </p>
        </div>
      </div>

      {existente && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-hueso px-3 py-2 text-xs text-tinta">
          <Punto hex={existente.hex} familia={existente.familiaColor} />
          <span>
            {mismoNombre ? `«${existente.nombre}» ya está en la lista de colores.` : `«${nombreDeColor(nombre)}» es otro nombre de «${existente.nombre}».`}
          </span>
          <OfrecerElegir color={existente} elegidos={elegidos} onElegir={onElegir} />
        </div>
      )}

      {parecidos.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-ambar/10 px-3 py-2 text-xs leading-relaxed text-ambar-profundo">
          <span>
            Se ve casi igual que {parecidos.map((p) => `«${p.color.nombre}»`).join(" y ")}. Si es el mismo color, usa ese: con dos nombres, la
            misma prenda queda registrada de dos formas.
          </span>
          {parecidos.map((p) => (
            <OfrecerElegir key={p.color.codigo} color={p.color} elegidos={elegidos} onElegir={onElegir} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <ComboResponsable control={responsable} deshabilitado={guardando} className="max-w-xs" />
        <button
          type="button"
          onClick={() => void crear()}
          disabled={guardando || !responsable.listo || !enLinea || mismoNombre}
          title={(!enLinea || mismoNombre ? bloqueo : responsable.motivo) ?? undefined}
          className="btn-cayla btn-primario"
        >
          {guardando ? "Creando…" : "Crear y elegir"}
        </button>
        <button type="button" onClick={onCerrar} disabled={guardando} className="btn-cayla btn-sutil">
          Cancelar
        </button>
      </div>

      {aviso && (
        <p role="alert" className="anim-revelar text-xs text-rojo-profundo">
          {aviso}
        </p>
      )}
    </div>
  );
}

function OfrecerElegir({ color, elegidos, onElegir }: { color: ColorAlta; elegidos: string[]; onElegir: (codigo: string) => void }) {
  if (elegidos.includes(color.codigo)) return <span className="text-taupe">· ya está elegido</span>;
  return (
    <button type="button" onClick={() => onElegir(color.codigo)} className="btn-cayla btn-enlace text-xs">
      Elegir {color.nombre}
    </button>
  );
}
