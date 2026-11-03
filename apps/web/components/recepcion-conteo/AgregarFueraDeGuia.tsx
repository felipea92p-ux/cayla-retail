"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { CatalogoParaRecibir } from "@/lib/recepcion-envio-reglas";
import { alAgregarALaLista, type GrupoDeLineas } from "@/lib/recepcion-grupos-reglas";

// «¿Llegó algo que no estaba en la guía?» (ADR-0393; decisión 13 de ADR-0362): una categoría que no venía se agrega a la lista con su marca, si tiene (vacía = sin marca, Felipe
// 2026-11-03) y, si el envío trae dos o más, su proveedor; y se cuenta como las demás. Al cerrar, Compras ve lo que pasó con ella. En un envío sin aviso, todo lo que llega entra
// por aquí, y del proveedor del envío. Si esa categoría ya está en la lista, otro modelo no es otra línea: la hoja lleva a anotarlo dentro de ella; y dejar la marca vacía en una
// categoría que ya está con marca pregunta, porque una marca olvidada abriría otra línea sin que nadie lo note (`/chaos`, 2026-11-03).

export function AgregarFueraDeGuia({
  catalogo,
  proveedores,
  sinAviso,
  grupos,
  onAgregar,
  onIrAlGrupo,
  onCerrar,
}: {
  catalogo: CatalogoParaRecibir | null;
  proveedores: readonly { id: string; nombre: string }[];
  sinAviso: boolean;
  /** Lo que ya está en la lista, para no agregarlo dos veces. */
  grupos: readonly GrupoDeLineas[];
  onAgregar: (nuevo: { proveedorId: string | null; categoriaId: string; marcaId: string | null }) => Promise<string | null>;
  /** Eso ya está en la lista: se va a esa categoría, a anotar el modelo que llegó. */
  onIrAlGrupo: (grupo: GrupoDeLineas) => void;
  onCerrar: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedorId, setProveedorId] = useState(proveedores.length === 1 ? proveedores[0].id : "");
  const [marcaId, setMarcaId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligeProveedor = proveedores.length >= 2;

  // Las marcas del proveedor elegido primero (las que trae según `marca_proveedores`); después las demás.
  const marcas = useMemo(() => {
    const todas = catalogo?.marcas ?? [];
    const suyas = new Set((catalogo?.vinculos ?? []).filter((v) => !proveedorId || v.proveedorId === proveedorId).map((v) => v.marcaId));
    return [...todas].sort((a, b) => Number(suyas.has(b.id)) - Number(suyas.has(a.id)) || a.nombre.localeCompare(b.nombre, "es"));
  }, [catalogo, proveedorId]);
  const proveedorElegido = eligeProveedor ? proveedorId : null;
  const destino = categoriaId && proveedorElegido !== "" ? alAgregarALaLista(grupos, { proveedorId: proveedorElegido, categoriaId, marcaId: marcaId || null }) : ({ tipo: "nueva" } as const);
  // Adónde lleva el botón principal: con dos o más marcas no se adivina cuál era.
  const grupoDestino = destino.tipo === "dentro" ? destino.grupo : destino.tipo === "otra-marca" && destino.grupos.length === 1 ? destino.grupos[0] : null;
  const otrasMarcas = destino.tipo === "otra-marca" ? destino.grupos.map((g) => g.principal.marca?.nombre ?? "") : [];
  const nombreCategoria = catalogo?.categorias.find((c) => c.id === categoriaId)?.nombre ?? "";

  const campos = [
    ...(eligeProveedor ? [{ id: "fuera-proveedor", nombre: "De qué proveedor", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es." }] : []),
    { id: "fuera-categoria", nombre: "Qué llegó", requerido: true, hecho: categoriaId !== "", pendiente: "Elige la categoría." },
    { id: "fuera-marca", nombre: "La marca", requerido: otrasMarcas.length >= 2, hecho: marcaId !== "", pendiente: "Elige la marca, o agrégala aparte sin marca." },
  ];
  const guia = useGuiaCampos(campos);

  /** El botón principal: va a la línea que ya está o agrega una nueva. */
  function confirmar() {
    if (!guia.puedeConfirmar) return;
    if (grupoDestino) {
      onIrAlGrupo(grupoDestino);
      onCerrar();
      return;
    }
    void agregar();
  }

  async function agregar() {
    setGuardando(true);
    setError(null);
    const clave = await onAgregar({ proveedorId: proveedorElegido, categoriaId, marcaId: marcaId || null });
    setGuardando(false);
    if (clave) onCerrar();
    else setError("No se pudo agregar. Revisa la conexión y vuelve a intentar.");
  }

  return (
    <Modal
      titulo={sinAviso ? "¿Qué llegó?" : "Algo que no estaba en la guía"}
      subtitulo={sinAviso ? "Agrega cada categoría que llegó y cuéntala." : "Se cuenta como las demás; al cerrar dirás qué pasa con lo que vino de más."}
      bloqueado={guardando}
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            confirmar();
          }}
          className="space-y-4"
        >
          {eligeProveedor && (
            <CampoGuiado id="fuera-proveedor" guia={guia}>
              <CampoSelect
                etiqueta={guia.etiqueta("fuera-proveedor", "De qué proveedor")}
                valor={proveedorId}
                onValor={(v) => {
                  setProveedorId(v);
                  setMarcaId("");
                }}
                opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
                marcador="Elige el proveedor"
              />
            </CampoGuiado>
          )}
          <CampoGuiado id="fuera-categoria" guia={guia}>
            <CampoSelect
              etiqueta={guia.etiqueta("fuera-categoria", "Qué llegó")}
              valor={categoriaId}
              onValor={setCategoriaId}
              opciones={(catalogo?.categorias ?? []).map((c) => ({ valor: c.id, texto: c.nombre }))}
              marcador="Elige la categoría"
            />
          </CampoGuiado>
          <CampoGuiado id="fuera-marca" guia={guia}>
            <CampoSelect
              etiqueta={guia.etiqueta("fuera-marca", "La marca")}
              valor={marcaId}
              onValor={setMarcaId}
              // Vacía = sin marca (Felipe 2026-11-03): hay prendas que no la tienen; se completa después en Editar producto. «Sin marca» solo aparece para deshacer una ya elegida.
              opciones={[...(marcaId ? [{ valor: "", texto: "Sin marca" }] : []), ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]}
              marcador={otrasMarcas.length >= 2 ? "Elige la marca" : "Déjala vacía si no tiene"}
            />
          </CampoGuiado>
          {destino.tipo === "dentro" && (
            <p className="nota-cayla text-sm">
              <b className="text-tinta">{[nombreCategoria, destino.grupo.principal.marca?.nombre].filter(Boolean).join(" · ")} ya está en tu lista.</b> Si llegó otro modelo, se anota ahí con su nombre.
            </p>
          )}
          {destino.tipo === "otra-marca" && (
            <div className="nota-cayla text-sm">
              <p>
                <b className="text-tinta">
                  {nombreCategoria} ya está en tu lista con {new Intl.ListFormat("es", { type: "conjunction" }).format(otrasMarcas)}.
                </b>{" "}
                {otrasMarcas.length === 1 ? "Si es de esa marca, se anota ahí." : "Elige la marca de arriba y se anota en su línea."}
              </p>
              <button type="button" className="btn-cayla btn-enlace mt-1" disabled={guardando} onClick={() => void agregar()}>
                No tiene marca: agregarla aparte
              </button>
            </div>
          )}
          {!catalogo && <Aviso tono="atencion" titulo="No se pudo leer el catálogo">Recarga la pantalla para elegir la categoría y la marca.</Aviso>}
          {error && <Aviso tono="error" titulo="No se pudo agregar">{error}</Aviso>}
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Agregando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {/* Corto a propósito: la marca la dice la nota de arriba; con ella aquí, el texto no cabía en el botón. */}
              {grupoDestino ? `+ Agregar a ${nombreCategoria}` : "+ Agregar y contar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
