"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ListaSugerencias } from "@/components/ui/ListaSugerencias";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import type { CatalogoParaRecibir, CategoriaDeLinea, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { TOPES_CONTEO } from "@/lib/recepcion-conteo-reglas";
import { marcaSugeridaDelModelo, paradaDelNombre, type CategoriaDelEnvio, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
import { sugerirDescripcion, sugerirNombre } from "@/lib/sugerencias-alta-producto";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";

// «+» de una categoría (Felipe 2026-11-03, ADR-0604): un modelo más para contar aparte. Nace en 0 y queda en el contador. La marca es de cada modelo (vacía = sin marca) y el proveedor
// solo se pregunta si el envío trae dos o más; por dentro cae en la línea de esa categoría y marca, o abre una. Mientras se escribe el nombre salen las prendas parecidas del catálogo,
// sin bloquear: tocar una la cuenta a ella.

export type ModeloPedido = { proveedorId: string | null; marcaId: string | null; nombre: string; nota: string | null; prenda: PrendaRecepcion | null };

export function NuevoModelo({
  categoria,
  enLista,
  catalogo,
  proveedores,
  onCrear,
  onIrA,
  onCerrar,
}: {
  categoria: CategoriaDeLinea;
  /** La categoría en la lista: de ahí salen la marca que se sugiere y lo que ya se anotó. */
  enLista: CategoriaDelEnvio;
  catalogo: CatalogoParaRecibir | null;
  proveedores: readonly { id: string; nombre: string }[];
  /** Devuelve el error, o null si quedó. */
  onCrear: (m: ModeloPedido) => Promise<string | null>;
  /** Ese modelo ya está en la lista: se va a contarlo. */
  onIrA: (p: ParadaDelConteo) => void;
  onCerrar: () => void;
}) {
  const eligeProveedor = proveedores.length >= 2;
  const [proveedorId, setProveedorId] = useState(eligeProveedor ? (enLista.grupos[0]?.principal.proveedor?.id ?? "") : "");
  const [marcaId, setMarcaId] = useState(() => marcaSugeridaDelModelo(enLista));
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const texto = nombre.trim();
  const yaEsta = texto ? paradaDelNombre(enLista, texto) : null;

  const marcas = useMemo(() => {
    const todas = catalogo?.marcas ?? [];
    const suyas = new Set((catalogo?.vinculos ?? []).filter((v) => !proveedorId || v.proveedorId === proveedorId).map((v) => v.marcaId));
    return [...todas].sort((a, b) => Number(suyas.has(b.id)) - Number(suyas.has(a.id)) || a.nombre.localeCompare(b.nombre, "es"));
  }, [catalogo, proveedorId]);

  // Las parecidas del catálogo, de esta categoría y marca. Si no responde, se sigue sin ellas.
  const [parecidas, setParecidas] = useState<readonly PrendaRecepcion[]>([]);
  const vuelta = useRef(0);
  useEffect(() => {
    const mia = ++vuelta.current;
    if (texto.length < 2) return;
    const t = window.setTimeout(() => {
      void buscarPrendasParaRecibir(categoria.id, marcaId || null, texto).then(({ prendas, error: e }) => {
        if (mia === vuelta.current) setParecidas(e ? [] : prendas.slice(0, 4));
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [categoria.id, marcaId, texto]);
  const aLaVista = texto.length >= 2 && !yaEsta ? parecidas.filter((p) => !paradaDelNombre(enLista, p.nombre)) : [];

  const guia = useGuiaCampos([
    ...(eligeProveedor ? [{ id: "modelo-proveedor", nombre: "De qué proveedor", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es." }] : []),
    { id: "modelo-nombre", nombre: "El nombre", requerido: true, hecho: texto !== "", pendiente: "Escribe cómo se llama el modelo." },
    { id: "modelo-marca", nombre: "La marca", requerido: false, hecho: marcaId !== "", pendiente: "" },
    { id: "modelo-nota", nombre: "La descripción", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
  ]);

  async function crear(prenda: PrendaRecepcion | null) {
    setGuardando(true);
    setError(null);
    const e = await onCrear({ proveedorId: eligeProveedor ? proveedorId : null, marcaId: marcaId || null, nombre: prenda?.nombre ?? texto, nota: nota.trim() || null, prenda });
    setGuardando(false);
    if (e) setError(e);
    else onCerrar();
  }

  function confirmar() {
    if (!guia.puedeConfirmar || guardando) return;
    if (yaEsta) {
      onIrA(yaEsta);
      onCerrar();
      return;
    }
    void crear(null);
  }

  return (
    <Modal titulo={`Otro modelo de ${categoria.nombre}`} subtitulo="Se cuenta aparte. Nace en 0 y lo cuentas enseguida." bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            confirmar();
          }}
          className="space-y-4"
        >
          {eligeProveedor && (
            <CampoGuiado id="modelo-proveedor" guia={guia}>
              <CampoSelect
                etiqueta={guia.etiqueta("modelo-proveedor", "De qué proveedor")}
                valor={proveedorId}
                onValor={setProveedorId}
                opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
                marcador="Elige el proveedor"
              />
            </CampoGuiado>
          )}
          <CampoGuiado id="modelo-nombre" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("modelo-nombre", "El nombre")}
              value={nombre}
              maxLength={TOPES_CONTEO.descripcionNueva}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={`Ej. ${sugerirNombre(categoria).texto}`}
              autoFocus
            />
          </CampoGuiado>
          {aLaVista.length > 0 && (
            <div className="space-y-1.5">
              <p className="rc-etiqueta-chica">Se parecen · toca si llegó esa</p>
              <ListaSugerencias
                id="modelo-parecidas"
                etiqueta="Prendas del catálogo que se parecen"
                enLinea
                activa={null}
                tecla=""
                sugerencias={aLaVista.map((p) => ({
                  clave: p.productoId,
                  miniatura: <MiniaturaPrenda fotoUrl={p.fotoUrl} prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} />,
                  titulo: p.nombre,
                  detalle: p.codigo ?? undefined,
                }))}
                onElegir={(i) => void crear(aLaVista[i])}
              />
            </div>
          )}
          {yaEsta && (
            <p className="nota-cayla text-sm">
              <b className="text-tinta">«{yaEsta.modelo?.nombre}» ya está en tu lista.</b> Cuéntalo ahí.
            </p>
          )}
          <CampoGuiado id="modelo-marca" guia={guia}>
            <CampoSelect
              etiqueta={guia.etiqueta("modelo-marca", "La marca")}
              valor={marcaId}
              onValor={setMarcaId}
              // Vacía = sin marca: «Sin marca» solo aparece para deshacer una ya elegida.
              opciones={[...(marcaId ? [{ valor: "", texto: "Sin marca" }] : []), ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]}
              marcador="Déjala vacía si no tiene"
            />
          </CampoGuiado>
          <CampoGuiado id="modelo-nota" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("modelo-nota", "La descripción (para no confundirlo con otro)")}
              value={nota}
              maxLength={TOPES_CONTEO.descripcionNueva}
              onChange={(e) => setNota(e.target.value)}
              placeholder={`Ej. ${sugerirDescripcion(categoria).texto}`}
            />
          </CampoGuiado>
          {!catalogo && <Aviso tono="atencion" titulo="No se pudo leer el catálogo">Recarga la pantalla para elegir la marca.</Aviso>}
          {error && <Aviso tono="error" titulo="No se pudo agregar">{error}</Aviso>}
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Agregando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {yaEsta ? "Ir a contarlo" : "+ Agregar y contar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
