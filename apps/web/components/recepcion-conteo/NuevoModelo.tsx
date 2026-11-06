"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ListaSugerencias } from "@/components/ui/ListaSugerencias";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { buscarParecidasParaRecibir } from "@/lib/recepcion-envio-acciones";
import type { CatalogoParaRecibir, CategoriaDeLinea, PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import { TOPES_CONTEO } from "@/lib/recepcion-conteo-reglas";
import type { GrupoDeLineas } from "@/lib/recepcion-grupos-reglas";
import { marcaSugeridaDelModelo, nombrePorDefecto, paradaDelNombre, parecidasDelNombre, type CategoriaDelEnvio, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
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
  // La marca se deja vacía si no tiene (Felipe 2026-11-03). Solo con guía se sugiere la de la categoría: vacía, lo que dijo la guía quedaría como faltante.
  const marcaInicial = (c: CategoriaDelEnvio | null) => (c && !sinAviso ? marcaSugeridaDelModelo(c) : "");
  const [marcaId, setMarcaId] = useState(() => marcaInicial(enLista));
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const texto = nombre.trim();
  // Nadie sabe cómo se llama: queda «Blusa 1» y no se cierra el envío hasta cambiarlo (Felipe 2026-11-03).
  const provisional = categoria ? nombrePorDefecto(prendaDeLaCategoria(categoria), enLista) : "";
  const yaEsta = texto && enLista ? paradaDelNombre(enLista, texto) : null;

  const marcas = useMemo(() => {
    const todas = catalogo?.marcas ?? [];
    const suyas = new Set((catalogo?.vinculos ?? []).filter((v) => !proveedorId || v.proveedorId === proveedorId).map((v) => v.marcaId));
    // Primero las que ya están en la lista de esta categoría: lo más probable es que sea otra de esas.
    const enLaLista = new Set((enLista?.grupos ?? []).map((g) => g.principal.marca?.id));
    const peso = (id: string) => (enLaLista.has(id) ? 2 : suyas.has(id) ? 1 : 0);
    return [...todas].sort((a, b) => peso(b.id) - peso(a.id) || a.nombre.localeCompare(b.nombre, "es"));
  }, [catalogo, proveedorId, enLista]);

  // Las parecidas del catálogo, de esta categoría y marca. Si no responde, se sigue sin ellas.
  const [parecidas, setParecidas] = useState<readonly PrendaRecepcion[]>([]);
  const vuelta = useRef(0);
  useEffect(() => {
    const mia = ++vuelta.current;
    if (texto.length < 2 || !categoriaId) return;
    const t = window.setTimeout(() => {
      void buscarParecidasParaRecibir(categoriaId, texto).then((prendas) => {
        if (mia === vuelta.current) setParecidas(prendas);
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [categoriaId, texto]);
  // De cualquier marca, sin las que ya están en la lista. La que se llama igual pregunta: «¿Es esta?»; tocar otra también, antes de agregarla.
  const candidatas = texto.length >= 2 && !yaEsta ? parecidas.filter((p) => !enLista || !paradaDelNombre(enLista, p.nombre)) : [];
  const { aLaVista, pregunta } = parecidasDelNombre(texto, candidatas);
  const [dijoQueNo, setDijoQueNo] = useState<string | null>(null);
  const [tocada, setTocada] = useState<PrendaRecepcion | null>(null);
  const preguntaPendiente = pregunta && dijoQueNo !== `${pregunta.productoId}|${texto}` ? pregunta : null;
  const esEsta = tocada ?? preguntaPendiente;

  const guia = useGuiaCampos([
    ...(eligeProveedor ? [{ id: "modelo-proveedor", nombre: "De qué proveedor", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es." }] : []),
    ...(categoriaFija ? [] : [{ id: "modelo-categoria", nombre: "Qué llegó", requerido: true, hecho: categoriaId !== "", pendiente: "Elige la categoría." }]),
    { id: "modelo-nombre", nombre: "El nombre", requerido: false, sugerido: categoriaId !== "", hecho: texto !== "", pendiente: "Escribe cómo se llama, o déjalo vacío si no lo sabes." },
    ...(preguntaPendiente ? [{ id: "modelo-es-esta", nombre: "Si es esa prenda", requerido: true, hecho: false, pendiente: `Di si llegó «${preguntaPendiente.nombre}» o es otra.` }] : []),
    { id: "modelo-marca", nombre: "La marca", requerido: false, hecho: marcaId !== "", pendiente: "" },
    { id: "modelo-nota", nombre: "La descripción", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
  ]);

  async function crear(prenda: PrendaRecepcion | null) {
    setGuardando(true);
    setError(null);
    const e = await onCrear({ categoriaId, proveedorId: eligeProveedor ? proveedorId : null, marcaId: (prenda ? prenda.marca?.id : marcaId) || null, nombre: prenda?.nombre ?? (texto || provisional), nota: nota.trim() || null, prenda, porDefecto: !prenda && !texto });
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
                  setMarcaId(marcaInicial(categorias.find((x) => x.categoria?.id === v) ?? null));
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
              onChange={(e) => {
                setNombre(e.target.value);
                setTocada(null);
              }}
              placeholder={`Ej. ${sugerirNombre(categoria).texto}`}
              autoFocus={!!categoriaFija}
              pie={provisional ? `Si no lo sabes, déjalo vacío: quedará como «${provisional}», y su nombre se pone después.` : undefined}
            />
          </CampoGuiado>
          {esEsta ? (
            <CampoGuiado id="modelo-es-esta" guia={guia}>
              <div className="nota-cayla sin-i space-y-2.5">
                <div className="flex items-center gap-3">
                  <MiniaturaPrenda fotoUrl={esEsta.fotoUrl} tamano="md" prefijo={categoria?.prefijo} familia={categoria?.familia} categoria={categoria?.nombre} />
                  <p className="min-w-0 text-sm">
                    <b className="block text-tinta">¿Llegó esta?</b>
                    {esEsta.nombre}
                    <span className="block text-taupe">{[esEsta.codigo, esEsta.marca?.nombre ?? "Sin marca"].filter(Boolean).join(" · ")}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Boton type="button" peso="primario" disabled={guardando} onClick={() => void crear(esEsta)}>
                    Sí, es esta
                  </Boton>
                  <Boton
                    type="button"
                    peso="fantasma"
                    disabled={guardando}
                    onClick={() => {
                      if (tocada) setTocada(null);
                      else setDijoQueNo(`${esEsta.productoId}|${texto}`);
                    }}
                  >
                    No, es otra
                  </Boton>
                </div>
              </div>
            </CampoGuiado>
          ) : (
            aLaVista.length > 0 && (
              <div className="space-y-1.5">
                <p className="rc-etiqueta-chica">Se parecen · toca si llegó esa</p>
                <ListaSugerencias
                  id="modelo-parecidas"
                  etiqueta="Prendas del catálogo que se parecen"
                  enLinea
                  activa={null}
                  tecla=""
                  sugerencias={aLaVista.slice(0, 4).map((p) => ({
                    clave: p.productoId,
                    miniatura: <MiniaturaPrenda fotoUrl={p.fotoUrl} prefijo={categoria?.prefijo} familia={categoria?.familia} categoria={categoria?.nombre} />,
                    titulo: p.nombre,
                    detalle: [p.codigo, p.marca?.nombre ?? "Sin marca"].filter(Boolean).join(" · "),
                  }))}
                  onElegir={(i) => setTocada(aLaVista[i])}
                />
              </div>
            )
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
          {error && <Aviso tono="error" titulo="No se pudo agregar">{errorDelGuardado ?? error}</Aviso>}
          <div className="pie-hoja-fijo space-y-3 pt-2">
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Agregando…" confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {yaEsta ? "Ir a contarlo" : "+ Agregar y contar"}
            </Boton>
          </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
