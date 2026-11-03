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
import { alAgregarALaLista, type GrupoDeLineas } from "@/lib/recepcion-grupos-reglas";
import { marcaSugeridaDelModelo, nombrePorDefecto, paradaDelNombre, type CategoriaDelEnvio, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
import { prendaDeLaCategoria, sugerirDescripcion, sugerirNombre } from "@/lib/sugerencias-alta-producto";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";

// «¿Qué llegó?» y el «+» de una categoría (Felipe 2026-11-03, ADR-0604): un modelo más para contar aparte. Nace en 0 y queda en el contador. La marca es de cada modelo (vacía = sin marca) y el
// proveedor solo se pregunta si el envío trae dos o más; por dentro cae en la línea de esa categoría y marca, o abre una. Mientras se escribe el nombre salen las prendas parecidas del catálogo,
// sin bloquear: tocar una la cuenta a ella. Si la categoría ya está con dos o más marcas, no se adivina: se elige, o se agrega aparte sin marca (lo halló `/chaos`, semilla 20261103).

export type ModeloPedido = { categoriaId: string; proveedorId: string | null; marcaId: string | null; nombre: string; nota: string | null; prenda: PrendaRecepcion | null; porDefecto: boolean };

export function NuevoModelo({
  categoriaFija,
  categorias,
  grupos,
  sinAviso,
  catalogo,
  proveedores,
  errorDelGuardado = null,
  onCrear,
  onIrA,
  onCerrar,
}: {
  /** La categoría del «+». Sin ella («Agregar lo que llegó»), la persona la elige. */
  categoriaFija: CategoriaDeLinea | null;
  /** Las categorías en la lista: de ahí salen la marca que se sugiere y lo que ya se anotó. */
  categorias: readonly CategoriaDelEnvio[];
  grupos: readonly GrupoDeLineas[];
  sinAviso: boolean;
  catalogo: CatalogoParaRecibir | null;
  proveedores: readonly { id: string; nombre: string }[];
  /** La causa que dijo la base al no poder agregar: la conexión no siempre es el motivo. */
  errorDelGuardado?: string | null;
  /** Devuelve el error, o null si quedó. */
  onCrear: (m: ModeloPedido) => Promise<string | null>;
  /** Ese modelo ya está en la lista: se va a contarlo. */
  onIrA: (p: ParadaDelConteo) => void;
  onCerrar: () => void;
}) {
  const eligeProveedor = proveedores.length >= 2;
  const [categoriaId, setCategoriaId] = useState(categoriaFija?.id ?? "");
  const enLista = categorias.find((c) => c.categoria?.id === categoriaId) ?? null;
  const categoria: CategoriaDeLinea | null = categoriaFija ?? enLista?.categoria ?? catalogo?.categorias.find((c) => c.id === categoriaId) ?? null;
  const [proveedorId, setProveedorId] = useState(eligeProveedor ? (enLista?.grupos[0]?.principal.proveedor?.id ?? "") : "");
  const [marcaId, setMarcaId] = useState(() => (enLista ? marcaSugeridaDelModelo(enLista) : ""));
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const texto = nombre.trim();
  // Nadie sabe cómo se llama: queda «Blusa 1» y no se cierra el envío hasta cambiarlo (Felipe 2026-11-03).
  const provisional = categoria ? nombrePorDefecto(prendaDeLaCategoria(categoria), enLista) : "";
  const yaEsta = texto && enLista ? paradaDelNombre(enLista, texto) : null;
  // Sin marca, en una categoría que ya está con dos o más: no se adivina cuál era.
  const destino = categoriaId && (!eligeProveedor || proveedorId) ? alAgregarALaLista(grupos, { proveedorId: eligeProveedor ? proveedorId : null, categoriaId, marcaId: marcaId || null }) : null;
  const otrasMarcas = destino?.tipo === "otra-marca" && destino.grupos.length >= 2 ? destino.grupos.map((g) => g.principal.marca?.nombre ?? "") : [];

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
    if (texto.length < 2 || !categoriaId) return;
    const t = window.setTimeout(() => {
      void buscarPrendasParaRecibir(categoriaId, marcaId || null, texto).then(({ prendas, error: e }) => {
        if (mia === vuelta.current) setParecidas(e ? [] : prendas.slice(0, 4));
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [categoriaId, marcaId, texto]);
  const aLaVista = texto.length >= 2 && !yaEsta ? parecidas.filter((p) => !enLista || !paradaDelNombre(enLista, p.nombre)) : [];

  const guia = useGuiaCampos([
    ...(eligeProveedor ? [{ id: "modelo-proveedor", nombre: "De qué proveedor", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es." }] : []),
    ...(categoriaFija ? [] : [{ id: "modelo-categoria", nombre: "Qué llegó", requerido: true, hecho: categoriaId !== "", pendiente: "Elige la categoría." }]),
    { id: "modelo-nombre", nombre: "El nombre", requerido: false, sugerido: true, hecho: texto !== "", pendiente: "Escribe cómo se llama, o déjalo vacío si no lo sabes." },
    { id: "modelo-marca", nombre: "La marca", requerido: otrasMarcas.length > 0, hecho: marcaId !== "", pendiente: "Elige la marca, o agrégala aparte sin marca." },
    { id: "modelo-nota", nombre: "La descripción", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
  ]);

  async function crear(prenda: PrendaRecepcion | null) {
    setGuardando(true);
    setError(null);
    const e = await onCrear({ categoriaId, proveedorId: eligeProveedor ? proveedorId : null, marcaId: marcaId || null, nombre: prenda?.nombre ?? (texto || provisional), nota: nota.trim() || null, prenda, porDefecto: !prenda && !texto });
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
    <Modal
      titulo={categoriaFija ? `Otro modelo de ${categoriaFija.nombre}` : sinAviso ? "¿Qué llegó?" : "Algo que no estaba en la guía"}
      subtitulo={categoriaFija ? "Se cuenta aparte. Nace en 0 y lo cuentas enseguida." : sinAviso ? "Agrega cada modelo que llegó y cuéntalo." : "Se cuenta como lo demás; al cerrar dirás qué pasa con lo que vino de más."}
      bloqueado={guardando}
      onClose={onCerrar}
    >
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
          {!categoriaFija && (
            <CampoGuiado id="modelo-categoria" guia={guia}>
              <CampoSelect
                etiqueta={guia.etiqueta("modelo-categoria", "Qué llegó")}
                valor={categoriaId}
                onValor={(v) => {
                  setCategoriaId(v);
                  const c = categorias.find((x) => x.categoria?.id === v);
                  setMarcaId(c ? marcaSugeridaDelModelo(c) : "");
                }}
                opciones={(catalogo?.categorias ?? []).map((c) => ({ valor: c.id, texto: c.nombre }))}
                marcador="Elige la categoría"
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
              autoFocus={!!categoriaFija}
              pie={!texto && provisional ? `Si no lo sabes, déjalo vacío: quedará como «${provisional}» y le pondrás su nombre antes de cerrar.` : undefined}
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
                  miniatura: <MiniaturaPrenda fotoUrl={p.fotoUrl} prefijo={categoria?.prefijo} familia={categoria?.familia} categoria={categoria?.nombre} />,
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
              marcador={otrasMarcas.length > 0 ? "Elige la marca" : "Déjala vacía si no tiene"}
            />
          </CampoGuiado>
          {otrasMarcas.length > 0 && (
            <div className="nota-cayla text-sm">
              <p>
                <b className="text-tinta">
                  {categoria?.nombre} ya está en tu lista con {new Intl.ListFormat("es", { type: "conjunction" }).format(otrasMarcas)}.
                </b>{" "}
                Elige su marca.
              </p>
              <button type="button" className="btn-cayla btn-enlace mt-1" disabled={guardando} onClick={() => void crear(null)}>
                No tiene marca: agregarla aparte
              </button>
            </div>
          )}
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
          {error && <Aviso tono="error" titulo="No se pudo agregar">{errorDelGuardado ?? error}</Aviso>}
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
