"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { validarDocumento } from "@cayla-retail/shared";
import { createClient } from "@/lib/supabase/client";
import type { Proveedor } from "@/lib/proveedores";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ETIQUETA_METODO, fechaCorta, soles } from "@/lib/compras-reglas";
import { clave } from "@/lib/buscar-prenda-v2";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

// Mismo vocabulario y orden que el selector de medio de pago en LineasPago.tsx
// (compra_pagos.metodo): un solo catálogo de formas de pago en toda la app.
const FORMAS_PAGO = Object.keys(ETIQUETA_METODO);

// Dos plantillas, no una con columnas ocultas: lo financiero (facturado,
// saldo, recepción, última compra) es solo de líder — corrección de D-27,
// 2026-09-17 (ver 20260917240000_proveedores_lista_indicadores_y_candado_sede.sql).
// Un colaborador ve el directorio puro (Proveedor · RUC); ni la base le manda
// esos números (fn_proveedores() los devuelve NULL), así que ocultar la
// columna acá es la segunda capa, no la única.
const PLANTILLA_LIDER = "sm:grid-cols-[1fr_8rem_7rem_7rem_7rem_7rem_6rem]";
const PLANTILLA_BASE = "sm:grid-cols-[1fr_8rem]";

type Borrador = {
  id: string | null;
  nombre: string;
  ruc: string;
  contacto: string;
  rubro: string;
  plazoCreditoDias: string;
  formaPagoPreferida: string;
};
const VACIO: Borrador = { id: null, nombre: "", ruc: "", contacto: "", rubro: "", plazoCreditoDias: "", formaPagoPreferida: "" };

// Directorio de proveedores: a quién se le compra. Es la puerta de entrada
// del módulo — sin un proveedor registrado no se puede registrar su factura
// (`compras.proveedor_id` es FK dura), y hasta hoy el único camino era el
// SQL Editor. Alta y edición pasan por RPC (registrar_proveedor /
// actualizar_proveedor); desactivar nunca borra — las facturas históricas
// siguen diciendo de quién fueron.
// `esLider` gobierna tres cosas a la vez, no solo "puede editar": ver lo
// financiero, entrar al detalle (clic en la fila), y editar/registrar/
// desactivar. Hoy las tres son la misma condición (rol líder) — un solo
// prop en vez de tres idénticos, hasta que alguna necesite separarse de
// verdad.
export function ProveedoresPanel({ proveedores, esLider }: { proveedores: Proveedor[]; esLider: boolean }) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  // Búsqueda en memoria: el directorio entero ya está en la página (son
  // decenas de proveedores, no miles), así que filtrar acá es instantáneo y
  // no cuesta una consulta por tecla. Busca por nombre, RUC y contacto, sin
  // tildes ni mayúsculas (misma `clave` que el buscador de Vender).
  const [busqueda, setBusqueda] = useState("");
  const k = clave(busqueda);
  const coincide = (p: Proveedor) => !k || clave(`${p.nombre} ${p.ruc ?? ""} ${p.contacto ?? ""}`).includes(k);
  const activos = proveedores.filter((p) => p.activo && coincide(p));
  const desactivados = proveedores.filter((p) => !p.activo && coincide(p));
  const hayProveedores = proveedores.some((p) => p.activo);

  async function onCambiarEstado(p: Proveedor) {
    setCambiandoId(p.id);
    const supabase = createClient();
    const { error } = await supabase.rpc(p.activo ? "desactivar_proveedor" : "reactivar_proveedor", { p_proveedor_id: p.id });
    setCambiandoId(null);
    if (error) {
      avisar.error(traducirError(error, p.activo ? "desactivar el proveedor" : "reactivar el proveedor"));
      return;
    }
    avisar.exito(p.activo ? `${p.nombre} desactivado` : `${p.nombre} reactivado`, {
      detalle: p.activo ? "Deja de aparecer al registrar facturas; su historial se conserva." : "Vuelve a aparecer al registrar facturas.",
    });
    router.refresh();
  }

  // Recepción en una sola celda, no dos: el número que importa para decidir
  // es "cuántas quedaron pendientes", no el desglose completo (eso ya vive
  // en el detalle). Sin facturas todavía ⇒ raya, no "0 pendientes" (que
  // leería como una alarma que no es tal).
  const recepcion = (p: Proveedor) => {
    if (!p.facturas) return <span className="text-tinta/45">—</span>;
    if (p.facturas_con_recepcion_pendiente) return <span className="text-ambar-profundo">{p.facturas_con_recepcion_pendiente} pendiente{p.facturas_con_recepcion_pendiente > 1 ? "s" : ""}</span>;
    return <span className="text-tinta/65">Al día</span>;
  };

  // Nombre/contacto/rubro: para cualquiera. El resto de la fila (RUC en
  // adelante) es un fragmento condicional aparte porque cambia de contenido
  // Y de significado entre líder y colaborador, no solo de estilo.
  const NombreCelda = ({ p }: { p: Proveedor }) => (
    <>
      <span className="block truncate text-sm text-tinta">{p.nombre}</span>
      <span className="block truncate text-xs text-tinta/65">
        {p.contacto ?? "Sin contacto"}
        {p.rubro && ` · ${p.rubro}`}
      </span>
    </>
  );

  // Directorio puro para quien no es líder: sin clic (no hay detalle que
  // mostrarle) y sin ninguna columna financiera — `fn_proveedores()` ya le
  // manda esos campos en NULL, esto es la segunda capa, no la única
  // (20260917240000_proveedores_lista_indicadores_y_candado_sede.sql).
  const FilaBase = ({ p }: { p: Proveedor }) => (
    <div className={fila(PLANTILLA_BASE, `${p.activo ? "" : "opacity-60"}`)}>
      <span className={celda("izq", "min-w-0")}>
        <NombreCelda p={p} />
      </span>
      <span className={celda("izq", "font-mono text-xs tabular-nums text-tinta/75")}>{p.ruc ?? "Sin RUC"}</span>
    </div>
  );

  // La fila entera lleva al detalle del proveedor (mismo patrón que Por
  // pagar: el enlace del nombre se estira con `after:`); el saldo, cuando lo
  // hay, lleva a Por pagar ya filtrado; los botones quedan por encima
  // (`relative`) para no disparar el enlace de fila.
  const FilaLider = ({ p }: { p: Proveedor }) => (
    <div className={fila(PLANTILLA_LIDER, `relative transition-colors hover:bg-tinta/[0.03] ${p.activo ? "" : "opacity-60"}`)}>
      <Link href={`/compras/proveedores/${p.id}`} className={celda("izq", "min-w-0 after:absolute after:inset-0 after:content-['']")}>
        <NombreCelda p={p} />
      </Link>
      <span className={celda("izq", "font-mono text-xs tabular-nums text-tinta/75")}>{p.ruc ?? "Sin RUC"}</span>
      <span className={celda("der", `text-sm ${p.total_facturado ? "text-tinta" : "text-tinta/45"}`)}>{soles(p.total_facturado ?? 0)}</span>
      <span className={celda("der", "text-sm")}>
        {(p.saldo ?? 0) > 0 ? (
          <Link
            href={`/compras/por-pagar?prov=${p.id}`}
            className={`relative underline-offset-4 hover:underline ${p.facturas_vencidas ? "text-rojo" : "text-tinta hover:text-rojo"}`}
          >
            {soles(p.saldo ?? 0)}
          </Link>
        ) : (
          <span className="text-tinta/45">{soles(p.saldo ?? 0)}</span>
        )}
      </span>
      <span className={celda("der", "text-xs")}>{recepcion(p)}</span>
      <span className={celda("der", "text-xs text-tinta/65")}>{p.ultima_compra ? fechaCorta(p.ultima_compra) : "Nunca"}</span>
      <span className={celda("der", "overflow-visible")}>
        {p.activo ? (
          <Boton
            type="button"
            peso="discreto"
            className="relative px-2.5 py-1.5 text-[11px]"
            onClick={() =>
              setBorrador({
                id: p.id,
                nombre: p.nombre,
                ruc: p.ruc ?? "",
                contacto: p.contacto ?? "",
                rubro: p.rubro ?? "",
                plazoCreditoDias: p.plazo_credito_dias != null ? String(p.plazo_credito_dias) : "",
                formaPagoPreferida: p.forma_pago_preferida ?? "",
              })
            }
          >
            Editar
          </Boton>
        ) : (
          <Boton type="button" peso="discreto" cargando={cambiandoId === p.id} onClick={() => onCambiarEstado(p)} className="relative px-2.5 py-1.5 text-[11px]">
            {cambiandoId === p.id ? "…" : "Reactivar"}
          </Boton>
        )}
      </span>
    </div>
  );

  const Fila = esLider ? FilaLider : FilaBase;

  const columnas = esLider
    ? [
        { titulo: "Proveedor" },
        { titulo: "RUC" },
        { titulo: "Facturado", alinear: "der" as const },
        { titulo: "Saldo", alinear: "der" as const },
        { titulo: "Recepción", alinear: "der" as const },
        { titulo: "Última compra", alinear: "der" as const },
        { titulo: "", alinear: "der" as const },
      ]
    : [{ titulo: "Proveedor" }, { titulo: "RUC" }];
  const plantilla = esLider ? PLANTILLA_LIDER : PLANTILLA_BASE;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Proveedores</h1>
          <p className="mt-1 text-sm text-tinta/65">A quién se le compra. Un proveedor tiene que estar acá antes de poder registrar su factura.</p>
        </div>
        {esLider && (
          <Boton peso="primario" onClick={() => setBorrador(VACIO)}>
            Registrar proveedor
          </Boton>
        )}
      </div>

      {/* Una sola línea, a todo el ancho de la tabla: la etiqueta a la
          izquierda del campo (no encima) para que la barra mida lo mínimo y
          no empuje la lista hacia abajo. El conteo va a la derecha. */}
      {hayProveedores && (
        <div className="card-cayla flex items-center gap-4 px-5 py-2">
          <label htmlFor="proveedores-buscar" className="label-cayla shrink-0 text-[11px] text-tinta/65">
            Buscar
          </label>
          <input
            id="proveedores-buscar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, RUC o contacto"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 border-b border-tinta/20 bg-transparent px-0.5 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-b-2 focus:border-rojo"
          />
          {k && (
            <span className="shrink-0 text-xs tabular-nums text-tinta/65">
              {activos.length + desactivados.length} de {proveedores.length}
            </span>
          )}
        </div>
      )}

      {!hayProveedores ? (
        <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">Todavía no hay proveedores registrados.</p>
      ) : activos.length === 0 && desactivados.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          Ningún proveedor coincide con «{busqueda.trim()}».{" "}
          {esLider && (
            <button type="button" onClick={() => setBorrador({ ...VACIO, nombre: busqueda.trim() })} className="text-rojo hover:underline">
              Registrarlo →
            </button>
          )}
        </p>
      ) : activos.length === 0 ? null : (
        <Tabla>
          <Encabezado plantilla={plantilla} columnas={columnas} />
          {activos.map((p) => (
            <Fila key={p.id} p={p} />
          ))}
        </Tabla>
      )}

      {desactivados.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivados — ya no aparecen al registrar una factura</p>
          <Tabla>
            {desactivados.map((p) => (
              <Fila key={p.id} p={p} />
            ))}
          </Tabla>
        </section>
      )}

      {borrador && (
        <ProveedorModal
          inicial={borrador}
          onClose={() => setBorrador(null)}
          onGuardado={() => {
            setBorrador(null);
            router.refresh();
          }}
          onDesactivar={
            borrador.id
              ? async () => {
                  const p = proveedores.find((x) => x.id === borrador.id);
                  if (!p) return;
                  await onCambiarEstado(p);
                  setBorrador(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alta / edición. El RUC y la razón social son el mismo <ConsultaDocumento>
// que usa Vender/Facturación (una sola copia de la lógica del padrón, ver el
// comentario de cabecera de ese componente), en modo `boton`: SUNAT se
// consulta solo al apretar "Buscar", porque cada consulta se paga y quien
// registra puede preferir escribir el nombre a mano. Si el padrón no responde,
// el nombre se escribe a mano y se guarda igual (principio 9): un proveedor no
// se queda sin registrar por una API ajena.
// ---------------------------------------------------------------------------
function ProveedorModal({
  inicial,
  onClose,
  onGuardado,
  onDesactivar,
}: {
  inicial: Borrador;
  onClose: () => void;
  onGuardado: () => void;
  /** Solo al editar: desactivar vive acá y no en la fila (ver PLANTILLA_LIDER). */
  onDesactivar?: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [ruc, setRuc] = useState(inicial.ruc);
  const [contacto, setContacto] = useState(inicial.contacto);
  const [rubro, setRubro] = useState(inicial.rubro);
  const [plazoCreditoDias, setPlazoCreditoDias] = useState(inicial.plazoCreditoDias);
  const [formaPagoPreferida, setFormaPagoPreferida] = useState(inicial.formaPagoPreferida);
  const [loading, setLoading] = useState(false);

  const editando = inicial.id !== null;
  const rucValido = ruc.length === 0 || validarDocumento("ruc", ruc).valido;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return void avisar.error("El proveedor necesita un nombre.", { enfocar: "documento-nombre" });
    if (!rucValido) return void avisar.error("El RUC tiene que ser de 11 dígitos. Si no tiene, déjalo en blanco.", { enfocar: "documento-numero" });
    setLoading(true);
    const supabase = createClient();
    const args = {
      p_nombre: nombre.trim(),
      p_ruc: ruc || undefined,
      p_contacto: contacto.trim() || undefined,
      p_rubro: rubro.trim() || undefined,
      p_plazo_credito_dias: plazoCreditoDias ? Number(plazoCreditoDias) : undefined,
      p_forma_pago_preferida: formaPagoPreferida || undefined,
    };
    const { error } = editando
      ? await supabase.rpc("actualizar_proveedor", {
          p_proveedor_id: inicial.id!,
          ...args,
        })
      : await supabase.rpc("registrar_proveedor", args);
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, editando ? "guardar el proveedor" : "registrar el proveedor"));
      return;
    }
    avisar.exito(editando ? `${nombre.trim()} actualizado` : `Proveedor ${nombre.trim()} registrado`);
    onGuardado();
  }

  return (
    <Modal titulo={editando ? "Editar proveedor" : "Registrar proveedor"} ancho="max-w-md" onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <ConsultaDocumento tipo="ruc" obligatorio={false} disparo="boton" numero={ruc} onNumero={setRuc} nombre={nombre} onNombre={setNombre} />
          <CampoTexto
            etiqueta={
              <>
                Contacto <span className="normal-case tracking-normal">(opcional)</span>
              </>
            }
            autoComplete="off"
            placeholder="Nombre, teléfono o correo de con quién se coordina"
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
          />
          <CampoTexto
            etiqueta={
              <>
                Rubro <span className="normal-case tracking-normal">(opcional)</span>
              </>
            }
            autoComplete="off"
            placeholder="Tela, avíos, prenda terminada, servicios…"
            value={rubro}
            onChange={(e) => setRubro(e.target.value)}
          />
          <CampoTexto
            etiqueta={
              <>
                Plazo de crédito <span className="normal-case tracking-normal">(opcional, en días)</span>
              </>
            }
            type="number"
            min={1}
            step={1}
            autoComplete="off"
            placeholder="30"
            value={plazoCreditoDias}
            onChange={(e) => setPlazoCreditoDias(e.target.value)}
          />
          <CampoSelectNativo
            etiqueta={
              <>
                Forma de pago preferida <span className="normal-case tracking-normal">(opcional)</span>
              </>
            }
            value={formaPagoPreferida}
            onChange={(e) => setFormaPagoPreferida(e.target.value)}
          >
            <option value="">Sin definir</option>
            {FORMAS_PAGO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO[m]}
              </option>
            ))}
          </CampoSelectNativo>

          <div className="flex gap-2 pt-3">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={loading} disabled={!nombre.trim() || !rucValido}>
              {loading ? "Guardando…" : editando ? "Guardar" : "Registrar"}
            </Boton>
          </div>
          {onDesactivar && (
            <p className="border-t border-tinta/10 pt-3 text-xs text-tinta/55">
              ¿Ya no se le compra?{" "}
              <button type="button" onClick={onDesactivar} disabled={loading} className="text-rojo hover:underline">
                Desactivar proveedor
              </button>
              . Deja de aparecer al registrar facturas; su historial se conserva.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
