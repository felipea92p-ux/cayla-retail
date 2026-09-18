"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { createClient } from "@/lib/supabase/client";
import { subirMuestraColor } from "@/lib/colores-muestra";

/**
 * El vocabulario cerrado de colores — portado de `trix/catalogo-vocabulario`
 * (V1) tras ADR-0095: V2 ya tiene el candado real (`colores_clave_unica`) y
 * los 30 colores de CAYLA en la base, pero hasta ahora ninguna pantalla
 * dejaba agregar uno nuevo a mano.
 *
 * "+ Agregar color" es de cualquiera con sesión desde el 2026-09-16
 * (`20260916220000_colores_proponer_aprobar.sql`): un color propuesto nace
 * `pendiente` y queda usable al instante (nunca frena a quien está en medio
 * de un censo), y cualquiera de los Líderes lo aprueba después. Editar,
 * aprobar y desactivar/reactivar siguen detrás de `puedeEditar` — el candado
 * real vive en la base (`colores_update_lider`), esto solo decide qué se
 * MUESTRA.
 *
 * `codigo` no se edita: es la clave primaria natural (referenciada por
 * `variantes.color_codigo` y por el propio código de cada prenda,
 * `BLU-0042-AZM-M`) — moverla desde acá rompería ese enganche.
 */

type Color = {
  codigo: string;
  nombre: string;
  familiaColor: string | null;
  hex: string | null;
  orden: number;
  activo: boolean;
  tipo: string;
  imagenMuestraUrl: string | null;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
};

const FAMILIAS_COLOR = [
  { valor: "neutro", texto: "Neutro" },
  { valor: "azul", texto: "Azul" },
  { valor: "rojo", texto: "Rojo" },
  { valor: "amarillo", texto: "Amarillo" },
  { valor: "verde", texto: "Verde" },
  { valor: "morado", texto: "Morado" },
  { valor: "tierra", texto: "Tierra" },
  { valor: "metalico", texto: "Metálico" },
  { valor: "estampado", texto: "Estampado" },
] as const;

// Naturaleza visual del color (20260915230000_colores_tipo_y_muestra.sql) —
// ortogonal a FAMILIAS_COLOR (matiz): un mismo tipo cruza todas las familias.
const TIPOS_COLOR = [
  { valor: "solido", texto: "Sólido" },
  { valor: "textura", texto: "Textura" },
  { valor: "estampado", texto: "Estampado" },
] as const;

const ETIQUETA_TIPO: Record<string, string> = { solido: "Sólido", textura: "Textura", estampado: "Estampado" };

function ordenar(lista: Color[]) {
  return [...lista].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

// Agrupa la grilla por familia de color (Neutro, Azul, Rojo...) en vez de una
// sola fila continua ordenada por `orden` global — pedido de Felipe
// (2026-09-18): con 34+ colores, un número global deja un color nuevo
// "colgando" al final en vez de junto a sus parecidos, y la última fila
// queda a medio llenar sin motivo aparente. Agrupado, cada familia cierra su
// propia fila — la de "Estampado" con 3 colores se ve completa, no como el
// resto de una grilla de 5 que faltó llenar. `orden` sigue ordenando DENTRO
// de cada sección (`ordenar()` ya corrió antes de llamar a esto).
function gruposPorFamilia(lista: Color[]) {
  const grupos: { familia: string; texto: string; colores: Color[] }[] = FAMILIAS_COLOR.map((f) => ({
    familia: f.valor,
    texto: f.texto,
    colores: lista.filter((c) => c.familiaColor === f.valor),
  })).filter((g) => g.colores.length > 0);

  // Defensivo: un color sin familia asignada (dato viejo, o el select vacío
  // en algún camino que no la exige) no debe desaparecer de la pantalla.
  const sinFamilia = lista.filter((c) => !FAMILIAS_COLOR.some((f) => f.valor === c.familiaColor));
  if (sinFamilia.length > 0) {
    grupos.push({ familia: "sin-familia", texto: "Sin familia", colores: sinFamilia });
  }
  return grupos;
}

// El cuadradito de la grilla: la muestra real si existe, si no el hex de
// siempre. Mismo tamaño en los dos casos para que la grilla no salte.
// `unoptimized` como en PerfilModal.tsx: viene del bucket de Storage, no de
// /public, y no vale la pena pasarla por el optimizador de imágenes de Next.
function Muestra({ url, hex, className = "h-12 w-full" }: { url: string | null; hex: string | null; className?: string }) {
  if (url) {
    return (
      <div className={`relative ${className} overflow-hidden rounded-lg border border-tinta/10`}>
        <Image src={url} alt="" fill unoptimized className="object-cover" />
      </div>
    );
  }
  return <div className={`${className} rounded-lg border border-tinta/10`} style={{ backgroundColor: hex ?? "#e8e0d0" }} aria-hidden />;
}

// El botón de subir/cambiar muestra, sobre un <input type=file> oculto —
// mismo dispositivo que BotonElegir en AdjuntosCompra.tsx. Sube al instante
// (bucket público, sin RPC de registro) y avisa la URL nueva por callback;
// quien lo usa decide si va al estado de "nuevo color" o al PATCH de edición.
function SelectorMuestra({ urlActual, hex, onSubida }: { urlActual: string | null; hex: string | null; onSubida: (url: string) => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(true);
    const { url, error } = await subirMuestraColor(createClient(), archivo);
    setSubiendo(false);
    if (error || !url) {
      avisar.error(error ?? "No se pudo subir la muestra.");
      return;
    }
    onSubida(url);
  }

  return (
    <div className="flex items-center gap-3">
      <Muestra url={urlActual} hex={hex} className="h-12 w-12 shrink-0" />
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="sr-only"
        disabled={subiendo}
        onChange={onArchivo}
      />
      <Boton type="button" peso="discreto" className="px-2.5 py-1.5 text-[11px]" onClick={() => input.current?.click()} disabled={subiendo}>
        {subiendo ? "Subiendo…" : urlActual ? "Cambiar muestra" : "Subir muestra"}
      </Boton>
    </div>
  );
}

export function ColoresLista({ coloresIniciales, puedeEditar }: { coloresIniciales: Color[]; puedeEditar: boolean }) {
  const [colores, setColores] = useState(() => ordenar(coloresIniciales));
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<Color | null>(null);
  const [cambiandoCodigo, setCambiandoCodigo] = useState<string | null>(null);
  const [aprobandoCodigo, setAprobandoCodigo] = useState<string | null>(null);
  // Rechazar abre un campo de motivo inline, no un modal — mismo peso visual
  // que el resto de acciones rápidas de esta pantalla (ADR-0095 de referencia).
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoCodigo, setRechazandoCodigo] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [familiaColor, setFamiliaColor] = useState<(typeof FAMILIAS_COLOR)[number]["valor"]>("neutro");
  const [hex, setHex] = useState("#c9b79c");
  const [tipo, setTipo] = useState<(typeof TIPOS_COLOR)[number]["valor"]>("solido");
  const [imagenMuestraUrl, setImagenMuestraUrl] = useState<string | null>(null);
  const [notas, setNotas] = useState("");

  const activos = colores.filter((c) => c.activo);
  const desactivados = colores.filter((c) => !c.activo);

  function abrir() {
    setAgregando(true);
    setNombre("");
    setCodigo("");
    setFamiliaColor("neutro");
    setHex("#c9b79c");
    setTipo("solido");
    setImagenMuestraUrl(null);
    setNotas("");
  }

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, codigo, familiaColor, hex, tipo, imagenMuestraUrl, notas }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar el color.");
        return;
      }
      setColores((actual) =>
        ordenar([
          ...actual,
          {
            codigo: datos.color.codigo,
            nombre: datos.color.nombre,
            familiaColor: datos.color.familia_color,
            hex: datos.color.hex,
            orden: 200,
            activo: true,
            tipo: datos.color.tipo,
            imagenMuestraUrl: datos.color.imagen_muestra_url,
            notas: datos.color.notas,
            estado: datos.color.estado,
          },
        ])
      );
      avisar.exito(
        datos.color.estado === "pendiente" ? `${datos.color.nombre} agregado — ya lo puedes usar` : `Color ${datos.color.nombre} agregado`,
        datos.color.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder lo apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  // Aprobar es de un solo clic, sin modal — el color ya está en uso desde
  // que se propuso, esto solo lo saca de la lista de pendientes. No existe
  // "rechazar": un color pendiente que no sirve se desactiva (abajo).
  async function aprobar(c: Color) {
    setAprobandoCodigo(c.codigo);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: c.codigo, estado: "aprobado" }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar el color.");
        return;
      }
      setColores((actual) => ordenar(actual.map((x) => (x.codigo === c.codigo ? { ...x, estado: "aprobado" as const } : x))));
      avisar.exito(`${c.nombre} aprobado`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoCodigo(null);
    }
  }

  // Reactivar no pasa por el modal (mismo criterio que Proveedores): es una
  // sola acción, sin campos que llenar, y no hace falta el candado de
  // variantes que sí aplica al desactivar. Si el color estaba rechazado, el
  // mismo clic retira el rechazo (manda estado:'aprobado', que el trigger ya
  // deja también activo=true) — nunca queda "aprobado pero rechazado" a la
  // vez, ese estado imposible lo bloquea un CHECK en la base.
  async function reactivar(c: Color) {
    setCambiandoCodigo(c.codigo);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c.estado === "rechazado" ? { codigo: c.codigo, estado: "aprobado" } : { codigo: c.codigo, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo reactivar el color.");
        return;
      }
      setColores((actual) => ordenar(actual.map((x) => (x.codigo === c.codigo ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${c.nombre} reactivado`, { detalle: "Vuelve a aparecer al elegir color en una prenda." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoCodigo(null);
    }
  }

  // Rechazar solo es válido desde 'pendiente' (lo hace cumplir el trigger).
  // El motivo es opcional (ADR-0095 de referencia: "aprobar es de un clic
  // sin fricción, el mismo criterio aplica al espejo").
  async function rechazar(c: Color) {
    setRechazandoCodigo(c.codigo);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: c.codigo, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar el color.");
        return;
      }
      setColores((actual) =>
        ordenar(actual.map((x) => (x.codigo === c.codigo ? { ...x, activo: false, estado: "rechazado" as const } : x)))
      );
      avisar.exito(`${c.nombre} rechazado`, { detalle: "Cae a Desactivados. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoCodigo(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={abrir}
          className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
        >
          + Agregar color
        </button>
      </div>

      {gruposPorFamilia(activos).map(({ familia, texto, colores: coloresDeLaFamilia }) => (
        <section key={familia} className="space-y-3">
          <p className="label-cayla text-[11px] text-tinta/65">
            {texto} <span className="text-tinta/40">· {coloresDeLaFamilia.length}</span>
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {coloresDeLaFamilia.map((c) => (
              <div key={c.codigo} className="card-cayla flex flex-col gap-2.5 p-4">
                <Muestra url={c.imagenMuestraUrl} hex={c.hex} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-tinta">{c.nombre}</p>
                  {c.estado === "pendiente" && (
                    <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>
                  )}
                </div>
                <div className="flex justify-between text-[11px] text-tinta/65">
                  <span className="font-mono">{c.codigo}</span>
                  <span>{c.tipo !== "solido" ? ETIQUETA_TIPO[c.tipo] : ""}</span>
                </div>
                {puedeEditar && (
                  <div className="flex gap-2">
                    {c.estado === "pendiente" && (
                      <Boton
                        peso="primario"
                        className="flex-1 px-2.5 py-1.5 text-[11px]"
                        cargando={aprobandoCodigo === c.codigo}
                        onClick={() => aprobar(c)}
                      >
                        Aprobar
                      </Boton>
                    )}
                    {c.estado === "pendiente" && (
                      <Boton
                        peso="discreto"
                        className="flex-1 px-2.5 py-1.5 text-[11px] text-rojo"
                        onClick={() => {
                          setRechazandoAbierto(rechazandoAbierto === c.codigo ? null : c.codigo);
                          setMotivoRechazo("");
                        }}
                      >
                        Rechazar
                      </Boton>
                    )}
                    <Boton peso="discreto" className="flex-1 px-2.5 py-1.5 text-[11px]" onClick={() => setEditando(c)}>
                      Editar
                    </Boton>
                  </div>
                )}
                {rechazandoAbierto === c.codigo && (
                  <div className="space-y-1.5 border-t border-tinta/10 pt-2.5">
                    <input
                      autoFocus
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                      placeholder="Motivo (opcional)"
                      className="w-full border-b border-tinta/25 bg-transparent px-0.5 py-1 text-[11px] text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
                    />
                    <div className="flex gap-2">
                      <Boton
                        peso="primario"
                        className="flex-1 px-2.5 py-1.5 text-[11px]"
                        cargando={rechazandoCodigo === c.codigo}
                        onClick={() => rechazar(c)}
                      >
                        Confirmar rechazo
                      </Boton>
                      <Boton peso="fantasma" className="px-2.5 py-1.5 text-[11px]" onClick={() => setRechazandoAbierto(null)}>
                        Cancelar
                      </Boton>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {agregando && (
        <Modal
          titulo="Nuevo color del vocabulario"
          subtitulo="Queda disponible de inmediato para cualquier prenda nueva o existente."
          ancho="max-w-md"
          onClose={() => setAgregando(false)}
        >
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <CampoTexto etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Verde botella" />
                <CampoTexto
                  etiqueta="Código (3 letras)"
                  mono
                  value={codigo}
                  maxLength={3}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="VEB"
                />
              </div>
              <CampoSelect etiqueta="Familia" valor={familiaColor} onValor={setFamiliaColor} opciones={FAMILIAS_COLOR} />
              <CampoSelect etiqueta="Tipo" valor={tipo} onValor={setTipo} opciones={TIPOS_COLOR} />
              <CampoTexto etiqueta="Notas" pie="Opcional, uso interno" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Proveedor de la tela, advertencias…" />

              <div className="flex items-center gap-3">
                <label className="label-cayla text-[11px] text-tinta/65" htmlFor="color-hex">
                  Color
                </label>
                <input
                  id="color-hex"
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded-md border border-tinta/20 bg-crema p-1"
                />
              </div>

              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Muestra (foto de la tela)</p>
                <p className="mt-1 text-xs text-tinta/55">Opcional — sin foto, el catálogo muestra el color de arriba.</p>
                <div className="mt-1.5">
                  <SelectorMuestra urlActual={imagenMuestraUrl} hex={hex} onSubida={setImagenMuestraUrl} />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton
                  type="button"
                  peso="primario"
                  className="flex-1"
                  onClick={guardar}
                  cargando={guardando}
                  disabled={!nombre.trim() || codigo.length !== 3}
                >
                  Guardar color
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {desactivados.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no se pueden elegir en una prenda nueva</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {desactivados.map((c) => (
              <div key={c.codigo} className="card-cayla flex flex-col gap-2.5 p-4 opacity-60">
                <Muestra url={c.imagenMuestraUrl} hex={c.hex} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-tinta">{c.nombre}</p>
                  {c.estado === "rechazado" && (
                    <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Rechazado</span>
                  )}
                </div>
                <div className="flex justify-between text-[11px] text-tinta/65">
                  <span className="font-mono">{c.codigo}</span>
                  <span>
                    {c.familiaColor ?? "—"}
                    {c.tipo !== "solido" ? ` · ${ETIQUETA_TIPO[c.tipo]}` : ""}
                  </span>
                </div>
                {puedeEditar && (
                  <Boton
                    peso="discreto"
                    className="px-2.5 py-1.5 text-[11px]"
                    cargando={cambiandoCodigo === c.codigo}
                    onClick={() => reactivar(c)}
                  >
                    {cambiandoCodigo === c.codigo ? "…" : "Reactivar"}
                  </Boton>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {editando && (
        <ColorEditarModal
          color={editando}
          onClose={() => setEditando(null)}
          onGuardado={(actualizado) => {
            setColores((actual) => ordenar(actual.map((x) => (x.codigo === actualizado.codigo ? actualizado : x))));
            setEditando(null);
          }}
          onDesactivado={(codigoDesactivado) => {
            setColores((actual) => ordenar(actual.map((x) => (x.codigo === codigoDesactivado ? { ...x, activo: false } : x))));
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edición: nombre, familia, tipo, orden, hex, muestra y notas. El HEX arranca bloqueado detrás de
// "Cambiar color" a propósito — no es un candado técnico (nada en
// `movimientos`/`ventas` guarda una copia del hex; catálogo, inventario y
// producción lo resuelven en vivo desde `colores.hex`), es solo para que no
// se mueva sin querer al pasar por el formulario. Desactivar vive acá abajo,
// igual que en Proveedores: es una acción rara y semi-destructiva.
// ---------------------------------------------------------------------------
function ColorEditarModal({
  color,
  onClose,
  onGuardado,
  onDesactivado,
}: {
  color: Color;
  onClose: () => void;
  onGuardado: (actualizado: Color) => void;
  onDesactivado: (codigo: string) => void;
}) {
  const [nombre, setNombre] = useState(color.nombre);
  const [familiaColor, setFamiliaColor] = useState<(typeof FAMILIAS_COLOR)[number]["valor"]>(
    (color.familiaColor as (typeof FAMILIAS_COLOR)[number]["valor"]) ?? "neutro"
  );
  const [orden, setOrden] = useState(String(color.orden));
  const [hex, setHex] = useState(color.hex ?? "#c9b79c");
  const [hexAbierto, setHexAbierto] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS_COLOR)[number]["valor"]>(
    (color.tipo as (typeof TIPOS_COLOR)[number]["valor"]) ?? "solido"
  );
  const [imagenMuestraUrl, setImagenMuestraUrl] = useState(color.imagenMuestraUrl);
  const [notas, setNotas] = useState(color.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [desactivando, setDesactivando] = useState(false);

  const ordenNumero = Number(orden);
  const ordenValido = Number.isInteger(ordenNumero) && ordenNumero >= 0;

  async function guardar() {
    if (!nombre.trim() || !ordenValido) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: color.codigo, nombre, familiaColor, orden: ordenNumero, hex, tipo, imagenMuestraUrl, notas }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar el color.");
        return;
      }
      avisar.exito(`${datos.color.nombre} actualizado`);
      onGuardado({
        codigo: datos.color.codigo,
        nombre: datos.color.nombre,
        familiaColor: datos.color.familia_color,
        hex: datos.color.hex,
        orden: datos.color.orden,
        activo: datos.color.activo,
        tipo: datos.color.tipo,
        imagenMuestraUrl: datos.color.imagen_muestra_url,
        notas: datos.color.notas,
        estado: datos.color.estado,
      });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function desactivar() {
    setDesactivando(true);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: color.codigo, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar el color.");
        return;
      }
      avisar.exito(`${color.nombre} desactivado`, {
        detalle: "Deja de aparecer al elegir color en una prenda nueva; el historial se conserva.",
      });
      onDesactivado(color.codigo);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setDesactivando(false);
    }
  }

  const ocupado = guardando || desactivando;

  return (
    <Modal titulo={`Editar «${color.nombre}»`} ancho="max-w-md" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <CampoTexto etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <CampoTexto
              etiqueta="Orden"
              mono
              inputMode="numeric"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              tono={ordenValido ? undefined : "error"}
              pie={ordenValido ? undefined : "Tiene que ser un número entero de 0 para arriba."}
            />
          </div>
          <CampoSelect etiqueta="Familia" valor={familiaColor} onValor={setFamiliaColor} opciones={FAMILIAS_COLOR} />
          <CampoSelect etiqueta="Tipo" valor={tipo} onValor={setTipo} opciones={TIPOS_COLOR} />
          <CampoTexto etiqueta="Notas" pie="Opcional, uso interno" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Proveedor de la tela, advertencias…" />

          <div>
            <p className="label-cayla text-[11px] text-tinta/65">Muestra (foto de la tela)</p>
            <div className="mt-1.5">
              <SelectorMuestra urlActual={imagenMuestraUrl} hex={hex} onSubida={setImagenMuestraUrl} />
            </div>
          </div>

          <div>
            <p className="label-cayla text-[11px] text-tinta/65">Color</p>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-9 w-14 rounded-md border border-tinta/20" style={{ backgroundColor: hex }} aria-hidden />
              {hexAbierto ? (
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  autoFocus
                  className="h-9 w-14 cursor-pointer rounded-md border border-tinta/20 bg-crema p-1"
                />
              ) : (
                <button type="button" onClick={() => setHexAbierto(true)} className="text-xs text-rojo hover:underline">
                  Cambiar color
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-tinta/55">
              Es solo el swatch de catálogo — cambia el color en todas las pantallas de inmediato, no reescribe ventas pasadas.
            </p>
          </div>

          <div className="flex gap-2 pt-3">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              className="flex-1"
              onClick={guardar}
              cargando={guardando}
              disabled={!nombre.trim() || !ordenValido || ocupado}
            >
              Guardar
            </Boton>
          </div>

          <p className="border-t border-tinta/10 pt-3 text-xs text-tinta/55">
            ¿Ya no se usa este color?{" "}
            <button type="button" onClick={desactivar} disabled={ocupado} className="text-rojo hover:underline">
              {desactivando ? "Desactivando…" : "Desactivar color"}
            </button>
            . Se bloquea si todavía hay una prenda activa con este color.
          </p>
        </div>
      )}
    </Modal>
  );
}
