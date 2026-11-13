"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, PackageOpen, SearchX, Store } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto, Interruptor } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { Modal } from "@/components/ui/Modal";
import { BotonSinAviso, useSinAviso } from "./SinAvisoContexto";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ProveedorNuevoRecepcion } from "@/components/recepcion-conteo/ProveedorNuevoRecepcion";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { diaMes } from "@/lib/fechas-lima";
import { proveedoresParaPedir } from "@/lib/proveedores-reglas";
import { urlContraFactura } from "@/lib/llegada-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { claveResponsableRecepcion, recordarResponsableGuardar } from "@/lib/responsable-conteo";
import { TOPES_CONTEO, mensajeAlGuardar } from "@/lib/recepcion-conteo-reglas";
import { abrirEnvioSinAviso } from "@/lib/recepcion-conteo-acciones";
import { COMPRAS_A_LA_VISTA, comprasQueAvisar, lineaDeLaCompra, porEnvio, tituloDelAviso, type CompraPagada } from "@/lib/compras-pagadas-reglas";

// «Llegó mercadería sin aviso» (ADR-0393, decisiones 2 y 10): lo que llega sin que Compras lo haya despachado se recibe con el MISMO conteo
// que un envío —por categoría, lo demás para después—. Lo que llega sin aviso casi nunca es de un solo proveedor (Felipe 2026-11-07): la puerta ya no
// pregunta «¿de quién es?». Cada categoría y marca que se cuenta es del proveedor de su marca, y lo que no se puede saber se elige al cerrar
// (20261107192000). Si todo es de uno, se puede decir aquí («Todo es de un solo proveedor») y, si ese proveedor tiene una factura por recibir en esta
// sede, se ofrece recibir contra ella. El costo llega con la factura (solo quien ve el dinero de Compras lo pone al cerrar).

/** Un proveedor de la puerta. `rubros`: quien es solo de gastos no se ofrece (`proveedoresParaPedir`); los recién agregados no los traen. */
export type ProveedorDeLaPuerta = { id: string; nombre: string; ruc?: string | null; rubros?: readonly string[]; marcas?: readonly string[] };

export type FacturaPorRecibir = { id: string; proveedorId: string; documento: string; fechaEmision: string | null; pendientes: number };

export function LlegoSinAviso({
  ubicacionId,
  ubicacionEtiqueta,
  proveedores,
  facturas,
  comprasPagadas = [],
  hayListaArriba = false,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** Con sus marcas (se leen en la puerta): se ven bajo cada proveedor y sirven para encontrarlo. */
  proveedores: readonly ProveedorDeLaPuerta[];
  facturas: readonly FacturaPorRecibir[];
  /** ADR-0636: las compras ya pagadas que vienen a esta sede (sin montos). Si lo que llegó es una de ellas, no se recibe por aquí. */
  comprasPagadas?: readonly CompraPagada[];
  /** Arriba hay envíos u órdenes de Compras para esta sede: esta tarjeta es para lo que NO está en esa lista (formidable, 2026-10-14). */
  hayListaArriba?: boolean;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [proveedorId, setProveedorId] = useState("");
  // «Todo es de un solo proveedor»: apagado (lo normal), el envío se abre sin proveedor y cada marca dice el suyo.
  const [deUnoSolo, setDeUnoSolo] = useState(false);
  const [guia, setGuia] = useState("");
  const [buscar, setBuscar] = useState("");
  const [token] = useState(() => crypto.randomUUID());
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El formulario no ocupa la pantalla hasta que alguien lo pide con «Sin Aviso». El enlace «Recibir sin aviso» de un envío
  // (`/recibir#sin-aviso`) también lo abre.
  const compartido = useSinAviso();
  const [propio, setPropio] = useState(false);
  const abierto = compartido ? compartido.abierto : propio;
  const setAbierto = compartido ? compartido.cambiar : setPropio;
  useEffect(() => {
    const segunLaDireccion = () => {
      if (window.location.hash !== "#sin-aviso") return;
      setAbierto(true);
    };
    segunLaDireccion();
    window.addEventListener("hashchange", segunLaDireccion);
    return () => window.removeEventListener("hashchange", segunLaDireccion);
  }, [setAbierto]);
  // Con un proveedor elegido, solo sus compras; sin elegir (lo normal), todas las que vienen a la sede.
  const pagadas = comprasQueAvisar(comprasPagadas, deUnoSolo && proveedorId ? proveedorId : null);
  const susFacturas = deUnoSolo ? facturas.filter((f) => f.proveedorId === proveedorId && f.pendientes > 0) : [];
  // «¿No está? + Agregar proveedor»: lo que llega sin aviso a veces es de un proveedor que todavía no está en el directorio. El recién
  // guardado se suma a la lista y queda elegido, sin esperar a que la página relea el directorio.
  const [agregados, setAgregados] = useState<ProveedorDeLaPuerta[]>([]);
  const todos = [...proveedores, ...agregados.filter((a) => !proveedores.some((p) => p.id === a.id))];
  // ADR-0635 (Felipe 2026-11-09): lo agrega quien recibe, sin el módulo Proveedores, con su razón social y su RUC si lo tiene.
  const [agregando, setAgregando] = useState<string | null>(null);

  const sinTurno = responsable.estado === "nadie" || responsable.estado === "sin_lectura";
  const campos = useGuiaCampos(
    [
      ...(deUnoSolo ? [{ id: "sin-aviso-proveedor", nombre: "De qué proveedor", requerido: true, hecho: proveedorId !== "", pendiente: "Elige el proveedor, o apaga «Todo es de un solo proveedor»." }] : []),
      { id: "sin-aviso-guia", nombre: "Número de guía", requerido: false, hecho: guia.trim() !== "", pendiente: "Si vino con guía, escribe su número." },
      { id: "sin-aviso-quien", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: "Elige quién recibe." },
    ],
  );

  async function abrir() {
    if (!campos.puedeConfirmar) return;
    setAbriendo(true);
    setError(null);
    const { abierto, error: e } = await abrirEnvioSinAviso(
      { p_ubicacion_id: ubicacionId, p_proveedor_id: deUnoSolo && proveedorId ? proveedorId : null, p_numero_guia: guia.trim() || null, p_nota: null, p_token: token },
      responsable.firma(),
    );
    responsable.despues(e);
    if (e || !abierto) {
      setAbriendo(false);
      setError(mensajeAlGuardar(e, "abrir el envío"));
      return;
    }
    // Quien abrió el envío es quien lo cuenta: se recuerda para Contar, que si no lo vuelve a pedir sin que nadie lo vea.
    if (responsable.elegidoId) recordarResponsableGuardar(claveResponsableRecepcion(abierto.despachoId), responsable.elegidoId);
    router.push(`/recibir/envio/${abierto.despachoId}`);
  }

  // Los proveedores que coinciden con lo escrito (por nombre o por marca), hasta 6, SIEMPRE en el mismo orden: el elegido se marca con
  // su ✓ donde está (Felipe 2026-10-14: subirlo al primer lugar al tocarlo confundía, parecía que la lista había cambiado). Solo si lo
  // escrito lo deja fuera de los 6, se agrega al final para que no desaparezca lo elegido.
  // A quién se le RECIBE mercadería: sin quien es solo de gastos (luz, agua…; ADR-0452, act. 2026-10-21), salvo el que ya está elegido.
  const directorio = proveedoresParaPedir(todos, proveedorId);
  const q = normalizar(buscar);
  const coinciden = directorio.filter((p) => !q || normalizar(p.nombre).includes(q) || (p.marcas ?? []).some((m) => normalizar(m).includes(q)) || (p.ruc ?? "").includes(q));
  const elegido = directorio.find((p) => p.id === proveedorId) ?? null;
  const primeros = coinciden.slice(0, 6);
  const aLaVista = elegido && !primeros.some((p) => p.id === elegido.id) ? [...primeros, elegido] : primeros;

  return (
    <>
    <div id="sin-aviso" data-guia="recibir.sin-aviso" className="scroll-mt-6 space-y-4">
    {/* Con lista arriba, el botón vive a la derecha del título de la tabla; sin ella, aquí. */}
    {!hayListaArriba && (
      <div className="flex flex-wrap items-center gap-3">
        <BotonSinAviso abierto={abierto} onCambiar={() => setAbierto((a) => !a)} />
        {!abierto && <p className="text-[15px] text-taupe">¿Llegó algo sin aviso? Ábrelo aquí.</p>}
      </div>
    )}
    {abierto && (
      <Modal
        titulo={hayListaArriba ? "¿Llegó algo que no está en la lista?" : "¿Llegó algo sin aviso?"}
        subtitulo={hayListaArriba
          ? "Lo de arriba lo despachó Compras. Lo que llegó además se cuenta igual, modelo por modelo, solo que sin con qué comparar. De quién es cada cosa lo dice su marca."
          : "Nadie lo despachó desde el sistema. Se cuenta igual, modelo por modelo, solo que sin con qué comparar. De quién es cada cosa lo dice su marca."}
        tamano="mediana"
        onClose={() => setAbierto(false)}
        bloqueado={abriendo}
      >
        <div id="sin-aviso-formulario">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void abrir();
          }}
          className="min-w-0 space-y-4"
        >
          {/* Sin nadie que firme no se abre nada: se dice antes de llenar la hoja, no después (prueba ciega, 2026-11-03). */}
          {sinTurno && <ComboResponsable control={responsable} />}
          {/* ADR-0636: lo ya pagado que viene para acá. Recibirlo «sin aviso» lo metería al stock por otra puerta y después entraría otra vez. */}
          {pagadas.length > 0 && (
            <Aviso tono="atencion" titulo={tituloDelAviso(pagadas, ubicacionEtiqueta)}>
              <p>Si lo que llegó es una de estas, no la recibas por aquí: entraría dos veces.</p>
              {deUnoSolo && proveedorId ? (
                <ul className="mt-2 space-y-1.5">
                  {pagadas.slice(0, COMPRAS_A_LA_VISTA).map((c) => (
                    <li key={c.papelId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        {lineaDeLaCompra(c, false)}
                        {c.fecha ? ` · comprada el ${diaMes(c.fecha)}` : ""}
                      </span>
                      {c.envios[0] ? (
                        <Link href={`/recibir/envio/${c.envios[0].id}`} className="btn-cayla btn-enlace">
                          Recibir ese envío
                        </Link>
                      ) : (
                        <span className="text-taupe">Pídele que la mande y recíbela en su envío.</span>
                      )}
                    </li>
                  ))}
                  {pagadas.length > COMPRAS_A_LA_VISTA && <li className="text-taupe">Y {pagadas.length - COMPRAS_A_LA_VISTA} más de este proveedor.</li>}
                </ul>
              ) : (
                // Sin proveedor elegido pueden ser decenas: se dicen por envío, que es lo que la tienda puede abrir.
                <ul className="mt-2 space-y-1.5">
                  {porEnvio(pagadas).map((g) => (
                    <li key={g.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{g.texto}</span>
                      {g.envioId ? (
                        <Link href={`/recibir/envio/${g.envioId}`} className="btn-cayla btn-enlace">
                          Recibir ese envío
                        </Link>
                      ) : (
                        <span className="text-taupe">Pídele a quien compró que las mande.</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Aviso>
          )}
          <div className="space-y-2">
            <Interruptor
              etiqueta="Todo es de un solo proveedor"
              activo={deUnoSolo}
              onActivo={(v) => {
                setDeUnoSolo(v);
                if (!v) setProveedorId("");
              }}
              pie={deUnoSolo ? undefined : "Casi siempre llega de varios: no hace falta elegir. Cada marca dice de quién es, y lo que no, lo eliges al cerrar."}
            />
          </div>
          {deUnoSolo && (
          <CampoGuiado id="sin-aviso-proveedor" guia={campos}>
            <p className="mb-1.5 text-sm font-semibold text-tinta">{campos.etiqueta("sin-aviso-proveedor", "¿De qué proveedor?")}</p>
            <Buscador valor={buscar} onCambio={setBuscar} placeholder="Busca el proveedor por nombre, marca o RUC" etiqueta="Buscar el proveedor" />
            <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Proveedor">
              {aLaVista.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={p.id === proveedorId}
                    onClick={() => setProveedorId(p.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      p.id === proveedorId ? "border-tinta bg-papel" : "border-sand bg-papel/70 hover:border-tinta/40"
                    }`}
                  >
                    <span className="rc-cat-ic" data-tamano="chico" aria-hidden>
                      <Store className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] text-tinta">{p.nombre}</b>
                      {(p.marcas ?? []).length > 0 && <small className="block truncate text-sm text-taupe">{(p.marcas ?? []).join(" · ")}</small>}
                    </span>
                    {p.id === proveedorId && <Check aria-hidden className="h-4 w-4 text-verde" />}
                  </button>
                </li>
              ))}
              {aLaVista.length === 0 && (
                <li>
                  <Vacio tamano="chico" alinear="izquierda" icono={<SearchX />} accion={{ texto: "Borrar la búsqueda", onClick: () => setBuscar("") }}>
                    Ningún proveedor coincide con «{buscar}».
                  </Vacio>
                </li>
              )}
              {coinciden.length > primeros.length && <li className="px-1 text-sm text-taupe">Escribe para encontrar a los demás ({coinciden.length - primeros.length} más).</li>}
            </ul>
            <p className="mt-2 text-sm text-taupe">
              ¿No está?{" "}
              <button type="button" onClick={() => setAgregando(buscar)} className="btn-cayla btn-enlace whitespace-normal text-left text-xs">
                + Agregar proveedor
              </button>
            </p>
          </CampoGuiado>
          )}

          {susFacturas.length > 0 && (
            <div className="nota-cayla space-y-2.5">
              <p>
                {elegido?.nombre ?? "Este proveedor"} tiene {susFacturas.length === 1 ? "una factura" : `${susFacturas.length} facturas`} por recibir en {ubicacionEtiqueta}. Si viene con{" "}
                {susFacturas.length === 1 ? "ella" : "una"}, se cuenta contra la factura y queda claro qué faltó.
              </p>
              <div className="flex flex-wrap gap-2">
                {susFacturas.slice(0, 3).map((f) => (
                  <Link key={f.id} href={urlContraFactura(f.id)} className="btn-cayla btn-secundario btn-chico h-auto flex-wrap justify-start whitespace-normal text-left">
                    Sí, viene con la {f.documento}
                    <span className="font-normal text-taupe">
                      {" "}· {f.pendientes} {f.pendientes === 1 ? "prenda" : "prendas"}
                      {f.fechaEmision ? ` · ${diaMes(f.fechaEmision)}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoGuiado id="sin-aviso-guia" guia={campos}>
              <CampoTexto
                etiqueta={campos.etiqueta("sin-aviso-guia", "Número de guía (opcional)")}
                value={guia}
                maxLength={TOPES_CONTEO.guia}
                onChange={(e) => setGuia(e.target.value)}
                // sugerir-fijo: el formato de un número de guía no depende de nada elegido antes
                placeholder="Ej. T001-000342"
              />
            </CampoGuiado>
            {!sinTurno && (
              <CampoGuiado id="sin-aviso-quien" guia={campos}>
                <p className="mb-1.5 text-sm font-semibold text-tinta">{campos.etiqueta("sin-aviso-quien", "Quién recibe")}</p>
                <ComboResponsable control={responsable} compacto />
              </CampoGuiado>
            )}
          </div>

          {error && (
            <Aviso tono="error" titulo="No se pudo abrir">
              {error}
            </Aviso>
          )}
          <PieGuia guia={campos} listo="Todo listo: ábrelo y cuenta." />
          <Boton type="submit" peso="primario" cargando={abriendo} textoCargando="Abriendo…" confirma={campos} title={campos.frase ?? undefined} className={campos.claseConfirmar}>
            <span className="inline-flex items-center gap-2">
              <PackageOpen aria-hidden className="h-4 w-4" />
              {susFacturas.length > 0 ? "No, recibir sin factura y contar" : "Empezar a contar"}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </span>
          </Boton>

          <p className="nota-cayla text-[15px]">
            Cuando Compras lo despache, el envío aparecerá arriba con lo que dijeron por categoría y marca, y la pantalla comparará sola. Lo que manda otra sede de CAYLA no entra por aquí: se recibe en <b className="text-tinta">Traslados</b>.
          </p>
        </form>
        </div>
      </Modal>
    )}
    </div>
    {/* Fuera del <form> (ADR-0128): un `submit` del alta no debe llegar a «Empezar a contar». */}
    {agregando !== null && (
      <ProveedorNuevoRecepcion
        proveedores={todos}
        tipeado={agregando}
        responsable={responsable}
        onRegistrado={(p) => {
          setAgregados((a) => (a.some((x) => x.id === p.id) ? a : [...a, { id: p.id, nombre: p.nombre, ruc: p.ruc, marcas: [] }]));
          setProveedorId(p.id);
          setBuscar("");
          setAgregando(null);
        }}
        onCerrar={() => setAgregando(null)}
      />
    )}
    </>
  );
}

/** Sin tildes ni mayúsculas, para buscar como en los combos (ADR-0209). */
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
