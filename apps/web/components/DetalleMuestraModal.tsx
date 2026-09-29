"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, RotateCcw, Wand2 } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { GeneradorDibujo } from "@/components/GeneradorDibujo";
import { MuestraTejido } from "@/components/MuestraTejido";
import { MuestraPatron } from "@/components/MuestraPatron";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { fotoPrincipal } from "@/lib/inventario-reglas";
import { ordenarPrendas, textoPrendas, type PrendaDeMuestra, type TipoMuestra } from "@/lib/muestra-atributo-reglas";
import { reducirMuestra, subirMuestra } from "@/lib/muestra-atributo";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import type { ColorDibujo } from "@/lib/dibujo-generado";

/**
 * El detalle de un tejido o de un patrón (ADR-0256): se abre al hacer clic en su tarjeta de Atributos.
 *
 * Arriba, la muestra en grande: la imagen que eligió un Líder (una foto, o un dibujo generado desde una frase con
 * `GeneradorDibujo`), o el dibujo automático que sale del nombre. Quien puede editar el catálogo sube una foto, genera
 * un dibujo o quita la imagen; nada se guarda al elegir: primero se ve cómo queda y recién «Guardar» la sube y la deja
 * en la base (sin responsable: Felipe, 2026-09-29).
 *
 * Abajo, las prendas que usan este tejido o patrón (las activas primero: son las que impiden desactivarlo). Se leen al
 * abrir, no con la pantalla: la grilla no necesita la foto de cada prenda.
 */

export type MuestraEnDetalle = {
  id: string;
  nombre: string;
  activo: boolean;
  estado: "pendiente" | "aprobado" | "rechazado";
  imagenUrl: string | null;
  /** La frase de «Generar dibujo» guardada la última vez (ADR-0256); `null` = nunca se describió. */
  descripcionDibujo: string | null;
};

const PALABRA: Record<TipoMuestra, { el: string; foto: string; api: string; columna: "tejido_id" | "patron_id" }> = {
  tejido: { el: "este tejido", foto: "Una foto real de la tela", api: "/api/productos/tejidos", columna: "tejido_id" },
  patron: { el: "este patrón", foto: "Una foto real del estampado", api: "/api/productos/patrones", columna: "patron_id" },
};

type Carga = { estado: "cargando" } | { estado: "error"; mensaje: string } | { estado: "listo"; prendas: PrendaDeMuestra[] };

/** Lo que se va a guardar: una foto nueva (con su vista previa local) o quitar la que hay. */
/** `origen` solo cambia los textos: una foto y un dibujo generado se guardan igual (JPG en el bucket). `descripcion`
 *  solo existe para un dibujo: la frase que lo generó, para que se guarde junto con la imagen. */
type Pendiente =
  | { tipo: "subir"; origen: "foto"; archivo: File; vista: string }
  | { tipo: "subir"; origen: "dibujo"; archivo: File; vista: string; descripcion: string }
  | { tipo: "quitar" };

export function DetalleMuestraModal({
  tipo,
  muestra,
  puedeEditar,
  veProductos,
  colores,
  generarCon = null,
  onClose,
  onImagen,
}: {
  tipo: TipoMuestra;
  muestra: MuestraEnDetalle;
  puedeEditar: boolean;
  /** Solo quien ve el módulo Productos llega a la ficha de cada prenda. */
  veProductos: boolean;
  /** Los colores del catálogo: el generador dibuja con sus hex. */
  colores: readonly ColorDibujo[];
  /** Recién creado con una descripción: el detalle abre con el generador ya propuesto desde esa frase. */
  generarCon?: string | null;
  onClose: () => void;
  /** `descripcionDibujo` viaja solo cuando lo que se guardó fue un dibujo generado; `undefined` la deja como está. */
  onImagen: (id: string, url: string | null, descripcionDibujo?: string | null) => void;
}) {
  const palabra = PALABRA[tipo];
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // `null` = cerrado; un texto = abierto, con esa frase de partida.
  const [generador, setGenerador] = useState<string | null>(puedeEditar ? generarCon : null);
  const [propuesta, setPropuesta] = useState<string | null>(null);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCarga({ estado: "cargando" });
      const { data, error } = await createClient()
        .from("productos")
        .select("id, referencia, codigo, estado, categoria:categorias ( nombre ), producto_fotos ( url, orden, es_principal )")
        .eq(palabra.columna, muestra.id)
        .order("referencia");
      if (!vigente) return;
      if (error) {
        setCarga({ estado: "error", mensaje: traducirError(error, "cargar las prendas") });
        return;
      }
      const prendas = (data ?? []).map((p) => ({
        id: p.id,
        referencia: p.referencia,
        codigo: p.codigo,
        categoria: p.categoria?.nombre ?? null,
        activa: p.estado === "activo",
        fotoUrl: fotoPrincipal(p.producto_fotos),
      }));
      setCarga({ estado: "listo", prendas: ordenarPrendas(prendas) });
    })();
    return () => {
      vigente = false;
    };
  }, [palabra.columna, muestra.id, intento]);

  // La vista previa es un `blob:` del navegador: se libera al cambiarla o al cerrar.
  const vista = pendiente?.tipo === "subir" ? pendiente.vista : null;
  useEffect(() => {
    if (!vista) return;
    return () => URL.revokeObjectURL(vista);
  }, [vista]);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setPreparando(true);
    try {
      const reducida = await reducirMuestra(archivo);
      if ("error" in reducida) {
        avisar.error(reducida.error);
        return;
      }
      setPendiente({ tipo: "subir", origen: "foto", archivo: reducida.archivo, vista: URL.createObjectURL(reducida.archivo) });
    } finally {
      setPreparando(false);
    }
  }

  async function guardar() {
    if (!pendiente) return;
    setGuardando(true);
    try {
      let url: string | null = null;
      if (pendiente.tipo === "subir") {
        const subida = await subirMuestra(createClient(), tipo, pendiente.archivo);
        if ("error" in subida) {
          avisar.error(subida.error);
          return;
        }
        url = subida.url;
      }
      const descripcionDibujo = pendiente.tipo === "subir" && pendiente.origen === "dibujo" ? pendiente.descripcion.trim() || null : undefined;
      const res = await fetch(palabra.api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("muestra_foto") },
        body: JSON.stringify({ id: muestra.id, imagenMuestraUrl: url, ...(descripcionDibujo !== undefined ? { descripcionDibujo } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar la foto.");
        return;
      }
      onImagen(muestra.id, url, descripcionDibujo);
      setPendiente(null);
      const que = pendiente.tipo === "subir" && pendiente.origen === "dibujo" ? "Dibujo" : "Foto";
      avisar.exito(url ? `${que} de ${muestra.nombre} guardado` : `${muestra.nombre} vuelve al dibujo automático`, {
        detalle: url ? "Ya se ve en Atributos." : "La imagen se quitó; se muestra el dibujo que sale del nombre.",
      });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  // Lo que se ve arriba: lo que se está por guardar, o lo guardado.
  // Con el generador abierto se ve en grande la propuesta marcada.
  const imagenVisible = pendiente ? (pendiente.tipo === "subir" ? pendiente.vista : null) : generador !== null && propuesta ? propuesta : muestra.imagenUrl;
  const Muestra = tipo === "tejido" ? MuestraTejido : MuestraPatron;
  const cantidad = carga.estado === "listo" ? carga.prendas.length : null;

  return (
    <Modal
      titulo={muestra.nombre}
      subtitulo={cantidad === null ? (tipo === "tejido" ? "Tejido" : "Patrón") : `${tipo === "tejido" ? "Tejido" : "Patrón"} · ${textoPrendas(cantidad)}`}
      ancho="max-w-lg"
      bloqueado={guardando}
      onClose={onClose}
    >
      <div className="mt-2 space-y-5">
        <section className="space-y-2">
          <Muestra nombre={muestra.nombre} imagenUrl={imagenVisible} className="aspect-[2/1] w-full" />
          <p className="text-xs text-tinta/60">
            {pendiente
              ? pendiente.tipo === "subir"
                ? "Así se verá. Todavía no se guardó."
                : "Se quitará la imagen y volverá el dibujo automático que sale del nombre. Todavía no se guardó."
              : generador !== null
                ? "Propuesta marcada. Si te gusta, «Usar este dibujo»; si no, cambia la frase o sube una foto."
                : muestra.imagenUrl
                  ? "Imagen elegida por el equipo."
                  : `Dibujo automático según el nombre. ${palabra.foto} o un dibujo a tu medida ayudan a reconocerlo al recibir mercadería.`}
          </p>

          {puedeEditar && !pendiente && generador !== null && (
            <GeneradorDibujo
              tipo={tipo}
              nombre={muestra.nombre}
              colores={colores}
              descripcionInicial={generador}
              onVista={setPropuesta}
              onUsar={(archivo, descripcion) => {
                setGenerador(null);
                setPendiente({ tipo: "subir", origen: "dibujo", archivo, vista: URL.createObjectURL(archivo), descripcion });
              }}
              onCancelar={() => setGenerador(null)}
            />
          )}

          {puedeEditar && !pendiente && generador === null && (
            <div className="flex flex-wrap gap-2">
              <Boton peso="fantasma" className="px-3 py-2 text-[11px]" cargando={preparando} onClick={() => selector.current?.click()}>
                <span className="inline-flex items-center gap-1.5">
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                  Subir foto
                </span>
              </Boton>
              <Boton peso="fantasma" className="px-3 py-2 text-[11px]" onClick={() => setGenerador(muestra.descripcionDibujo ?? "")}>
                <span className="inline-flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  Generar dibujo
                </span>
              </Boton>
              {muestra.imagenUrl && (
                <Boton peso="discreto" className="px-3 py-2 text-[11px]" onClick={() => setPendiente({ tipo: "quitar" })}>
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Quitar imagen
                  </span>
                </Boton>
              )}
              <input
                ref={selector}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  // Se vacía para que elegir el mismo archivo otra vez vuelva a disparar `onChange`.
                  e.target.value = "";
                  void elegir(archivo);
                }}
              />
            </div>
          )}

          {pendiente && (
            <div className="space-y-3 rounded-lg border border-sand bg-hueso/60 p-3">
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={() => setPendiente(null)} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={guardando}
                  onClick={guardar}
                >
                  {pendiente.tipo === "quitar" ? "Quitar imagen" : pendiente.origen === "dibujo" ? "Guardar dibujo" : "Guardar foto"}
                </Boton>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Prendas con {palabra.el}</p>
          {carga.estado === "cargando" && (
            <ul className="space-y-2" aria-label="Buscando prendas">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-sand/70" />
                  <span className="h-3 w-40 animate-pulse rounded bg-sand/70" />
                </li>
              ))}
            </ul>
          )}
          {carga.estado === "error" && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-sand p-3 text-sm text-tinta/80">
              <span>{carga.mensaje}</span>
              <Boton peso="discreto" className="shrink-0 px-2.5 py-1.5 text-[11px]" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </Boton>
            </div>
          )}
          {carga.estado === "listo" && carga.prendas.length === 0 && (
            <p className="rounded-lg border border-dashed border-tinta/15 p-3 text-sm text-tinta/60">Ninguna prenda usa {palabra.el} todavía.</p>
          )}
          {carga.estado === "listo" && carga.prendas.length > 0 && (
            <ul className="max-h-72 divide-y divide-sand overflow-y-auto rounded-lg border border-sand">
              {carga.prendas.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <MiniaturaPrenda fotoUrl={p.fotoUrl} />
                  <div className="min-w-0 flex-1">
                    {veProductos ? (
                      <Link href={`/productos/${p.id}/editar`} className="block truncate text-sm text-tinta hover:text-rojo-profundo hover:underline">
                        {p.referencia}
                      </Link>
                    ) : (
                      <p className="truncate text-sm text-tinta">{p.referencia}</p>
                    )}
                    <p className="truncate text-xs text-tinta/60">{[p.codigo, p.categoria ?? "Sin categoría"].filter(Boolean).join(" · ")}</p>
                  </div>
                  {!p.activa && (
                    <Chip tono="apagado" tachado={false}>
                      Descontinuada
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** «12 prendas · Ver ›» bajo el nombre de la tarjeta: cuántas la usan, y la pista de que se puede abrir. La parte de
 *  arriba de la tarjeta es el botón que abre este detalle (`TarjetaAtributo` con `abrir`, components/atributos/kit.tsx). */
export function PieTarjetaMuestra({ prendas }: { prendas: number }) {
  return (
    <span className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-tinta/60">
      <span className="whitespace-nowrap">{textoPrendas(prendas)}</span>
      <span className="whitespace-nowrap transition-colors group-hover/muestra:text-rojo-profundo">Ver ›</span>
    </span>
  );
}
