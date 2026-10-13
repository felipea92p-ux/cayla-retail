"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { CatalogoParaRecibir } from "@/lib/recepcion-envio-reglas";

// «¿Llegó algo que no estaba en la guía?» (ADR-0393; decisión 13 de ADR-0362): una categoría que no venía se agrega a la lista con su marca
// (y, si el envío trae dos o más, su proveedor), y se cuenta como las demás. Al cerrar, Compras ve lo que pasó con ella. En un envío sin
// aviso, todo lo que llega entra por aquí, y del proveedor del envío.

export function AgregarFueraDeGuia({
  catalogo,
  proveedores,
  sinAviso,
  yaUsadas,
  onAgregar,
  onCerrar,
}: {
  catalogo: CatalogoParaRecibir | null;
  proveedores: readonly { id: string; nombre: string }[];
  sinAviso: boolean;
  /** Lo que ya está en la lista (categoría + marca), para no agregarlo dos veces. */
  yaUsadas: ReadonlySet<string>;
  onAgregar: (nuevo: { proveedorId: string | null; categoriaId: string; marcaId: string }) => Promise<string | null>;
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
  const repetida = categoriaId && marcaId ? yaUsadas.has(`${categoriaId}|${marcaId}`) : false;

  const campos = [
    ...(eligeProveedor ? [{ id: "fuera-proveedor", nombre: "De qué proveedor", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es." }] : []),
    { id: "fuera-categoria", nombre: "Qué llegó", requerido: true, hecho: categoriaId !== "", pendiente: "Elige la categoría." },
    { id: "fuera-marca", nombre: "La marca", requerido: true, hecho: marcaId !== "" && !repetida, pendiente: repetida ? "Esa categoría y marca ya está en la lista." : "Elige la marca." },
  ];
  const guia = useGuiaCampos(campos);

  async function agregar() {
    if (!guia.puedeConfirmar) return;
    setGuardando(true);
    setError(null);
    const clave = await onAgregar({ proveedorId: eligeProveedor ? proveedorId : null, categoriaId, marcaId });
    setGuardando(false);
    if (clave) onCerrar();
    else setError("No se pudo agregar. Revisa la conexión y vuelve a intentar.");
  }

  return (
    <Modal
      titulo={sinAviso ? "¿Qué llegó?" : "Algo que no estaba en la guía"}
      subtitulo={sinAviso ? "Agrega cada categoría que llegó y cuéntala." : "Se cuenta como las demás; al cerrar dirás qué pasa con lo que vino de más."}
      ancho="max-w-md"
      bloqueado={guardando}
      conCerrar
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void agregar();
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
              opciones={marcas.map((m) => ({ valor: m.id, texto: m.nombre }))}
              marcador="Elige la marca"
              tono={repetida ? "error" : undefined}
              pie={repetida ? "Esa categoría y marca ya está en la lista: cuéntala ahí." : undefined}
            />
          </CampoGuiado>
          {!catalogo && <Aviso tono="atencion" titulo="No se pudo leer el catálogo">Recarga la pantalla para elegir la categoría y la marca.</Aviso>}
          {error && <Aviso tono="error" titulo="No se pudo agregar">{error}</Aviso>}
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Agregando…" : "+ Agregar y contar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
