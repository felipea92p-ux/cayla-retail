"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validarDocumento } from "@cayla-retail/shared";
import { createClient } from "@/lib/supabase/client";
import type { Proveedor } from "@/lib/proveedores";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import { clave } from "@/lib/buscar-prenda-v2";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

// Proveedor · RUC · Facturas · Saldo · Última compra · Acciones
// La última columna mide lo que miden "Editar" + "Desactivar" en una sola
// línea (con 11rem el segundo botón caía debajo del primero).
const PLANTILLA = "sm:grid-cols-[1fr_8rem_5rem_7rem_7rem_14rem]";

type Borrador = {
  id: string | null;
  nombre: string;
  ruc: string;
  contacto: string;
};
const VACIO: Borrador = { id: null, nombre: "", ruc: "", contacto: "" };

// Directorio de proveedores: a quién se le compra. Es la puerta de entrada
// del módulo — sin un proveedor registrado no se puede registrar su factura
// (`compras.proveedor_id` es FK dura), y hasta hoy el único camino era el
// SQL Editor. Alta y edición pasan por RPC (registrar_proveedor /
// actualizar_proveedor); desactivar nunca borra — las facturas históricas
// siguen diciendo de quién fueron.
export function ProveedoresPanel({ proveedores, puedeEditar }: { proveedores: Proveedor[]; puedeEditar: boolean }) {
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

  const Fila = ({ p }: { p: Proveedor }) => (
    <div className={fila(PLANTILLA, p.activo ? "" : "opacity-60")}>
      <span className={celda("izq", "min-w-0")}>
        <span className="block truncate text-sm text-tinta">{p.nombre}</span>
        <span className="block text-xs text-tinta/65">{p.contacto ?? "Sin contacto"}</span>
      </span>
      <span className={celda("izq", "font-mono text-xs tabular-nums text-tinta/75")}>{p.ruc ?? "Sin RUC"}</span>
      <span className={celda("der", "text-sm tabular-nums text-tinta")}>{p.facturas}</span>
      <span className={celda("der", `text-sm tabular-nums ${p.saldo > 0 ? "text-tinta" : "text-tinta/45"}`)}>{soles(p.saldo)}</span>
      <span className={celda("der", "text-xs text-tinta/65")}>{p.ultima_compra ? fechaCorta(p.ultima_compra) : "Nunca"}</span>
      <span className={celda("der", "overflow-visible")}>
        <span className="flex flex-nowrap justify-end gap-1.5">
          {puedeEditar && (
            <>
              <Boton
                type="button"
                peso="discreto"
                className="px-2.5 py-1.5 text-[11px]"
                onClick={() =>
                  setBorrador({
                    id: p.id,
                    nombre: p.nombre,
                    ruc: p.ruc ?? "",
                    contacto: p.contacto ?? "",
                  })
                }
              >
                Editar
              </Boton>
              <Boton
                type="button"
                peso="discreto"
                cargando={cambiandoId === p.id}
                onClick={() => onCambiarEstado(p)}
                className={`px-2.5 py-1.5 text-[11px] ${p.activo ? "border-rojo/30 text-rojo hover:bg-rojo/8" : ""}`}
              >
                {cambiandoId === p.id ? "…" : p.activo ? "Desactivar" : "Reactivar"}
              </Boton>
            </>
          )}
        </span>
      </span>
    </div>
  );

  const columnas = [
    { titulo: "Proveedor" },
    { titulo: "RUC" },
    { titulo: "Facturas", alinear: "der" as const },
    { titulo: "Saldo", alinear: "der" as const },
    { titulo: "Última compra", alinear: "der" as const },
    { titulo: "Acciones", alinear: "der" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Proveedores</h1>
          <p className="mt-1 text-sm text-tinta/65">A quién se le compra. Un proveedor tiene que estar acá antes de poder registrar su factura.</p>
        </div>
        {puedeEditar && (
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
          {puedeEditar && (
            <button type="button" onClick={() => setBorrador({ ...VACIO, nombre: busqueda.trim() })} className="text-rojo hover:underline">
              Registrarlo →
            </button>
          )}
        </p>
      ) : activos.length === 0 ? null : (
        <Tabla>
          <Encabezado plantilla={PLANTILLA} columnas={columnas} />
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
function ProveedorModal({ inicial, onClose, onGuardado }: { inicial: Borrador; onClose: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [ruc, setRuc] = useState(inicial.ruc);
  const [contacto, setContacto] = useState(inicial.contacto);
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
      p_ruc: ruc || null,
      p_contacto: contacto.trim() || null,
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

          <div className="flex gap-2 pt-3">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={loading} disabled={!nombre.trim() || !rucValido}>
              {loading ? "Guardando…" : editando ? "Guardar" : "Registrar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
