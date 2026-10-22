"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleHelp, PackageOpen, SearchX, Store } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { CajaFardo } from "./piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useAltaDeProveedor } from "@/components/useAltaDeProveedor";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { diaMes } from "@/lib/fechas-lima";
import { proveedoresParaPedir } from "@/lib/proveedores-reglas";
import { urlContraFactura } from "@/lib/llegada-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { TOPES_CONTEO, mensajeAlGuardar } from "@/lib/recepcion-conteo-reglas";
import { abrirEnvioSinAviso } from "@/lib/recepcion-conteo-acciones";

// «Llegó mercadería sin aviso» (ADR-0393, decisiones 2 y 10): lo que llega sin que Compras lo haya despachado se recibe con el MISMO conteo
// que un envío —por categoría, lo demás para después—. La puerta pregunta lo de siempre (ADR-0330): ¿de quién es? Si ese proveedor tiene una
// factura por recibir en esta sede, ofrece recibir contra ella. Si no, abre un envío sin guía y lleva a contarlo. El costo llega con la
// factura (solo quien ve el dinero de Compras lo pone al cerrar).

/** «No sé de quién es» (Felipe 2026-10-14): a veces Compras manda sin decir de quién es. Se cuenta igual y el proveedor se pone al cerrar. */
const SIN_PROVEEDOR = "sin-proveedor";

/** Un proveedor de la puerta. `rubros`: quien es solo de gastos no se ofrece (`proveedoresParaPedir`); los recién agregados no los traen. */
export type ProveedorDeLaPuerta = { id: string; nombre: string; ruc?: string | null; rubros?: readonly string[]; marcas?: readonly string[] };

export type FacturaPorRecibir = { id: string; proveedorId: string; documento: string; fechaEmision: string | null; pendientes: number };

export function LlegoSinAviso({
  ubicacionId,
  ubicacionEtiqueta,
  proveedores,
  rubrosEnUso,
  puedeAgregarProveedor,
  facturas,
  hayListaArriba = false,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** Con sus marcas (se leen en la puerta): se ven bajo cada proveedor y sirven para encontrarlo. */
  proveedores: readonly ProveedorDeLaPuerta[];
  /** Los rubros que ya usa el directorio: los botones del formulario de «Agregar proveedor». */
  rubrosEnUso: readonly string[];
  /** La cuenta tiene el módulo Proveedores (lo que exige `registrar_proveedor`): puede dar de alta uno desde aquí. */
  puedeAgregarProveedor: boolean;
  facturas: readonly FacturaPorRecibir[];
  /** Arriba hay envíos u órdenes de Compras para esta sede: esta tarjeta es para lo que NO está en esa lista (formidable, 2026-10-14). */
  hayListaArriba?: boolean;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [proveedorId, setProveedorId] = useState("");
  const [guia, setGuia] = useState("");
  const [buscar, setBuscar] = useState("");
  const [token] = useState(() => crypto.randomUUID());
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const susFacturas = facturas.filter((f) => f.proveedorId === proveedorId && f.pendientes > 0);
  // «¿No está? + Agregar proveedor»: lo que llega sin aviso a veces es de un proveedor que todavía no está en el directorio. El recién
  // guardado se suma a la lista y queda elegido, sin esperar a que la página relea el directorio.
  const [agregados, setAgregados] = useState<ProveedorDeLaPuerta[]>([]);
  const todos = [...proveedores, ...agregados.filter((a) => !proveedores.some((p) => p.id === a.id))];
  const alta = useAltaDeProveedor({
    habilitado: puedeAgregarProveedor,
    rubrosEnUso,
    existentes: todos.map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc ?? null })),
    alGuardar: (p) => {
      setAgregados((a) => [...a, { id: p.id, nombre: p.nombre, ruc: p.ruc, marcas: [] }]);
      setProveedorId(p.id);
      setBuscar("");
    },
  });

  const campos = useGuiaCampos(
    [
      { id: "sin-aviso-proveedor", nombre: "De quién es", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es, o «No sé de quién es»." },
      { id: "sin-aviso-guia", nombre: "Número de guía", requerido: false, hecho: guia.trim() !== "", pendiente: "Si vino con guía, escribe su número." },
      { id: "sin-aviso-quien", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: "Elige quién recibe." },
    ],
    { enModal: false },
  );

  async function abrir() {
    if (!campos.puedeConfirmar) return;
    setAbriendo(true);
    setError(null);
    const { abierto, error: e } = await abrirEnvioSinAviso(
      { p_ubicacion_id: ubicacionId, p_proveedor_id: proveedorId === SIN_PROVEEDOR ? null : proveedorId, p_numero_guia: guia.trim() || null, p_nota: null, p_token: token },
      responsable.firma(),
    );
    responsable.despues(e);
    if (e || !abierto) {
      setAbriendo(false);
      setError(mensajeAlGuardar(e, "abrir el envío"));
      return;
    }
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
    <div id="sin-aviso" className="grid scroll-mt-6 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="card-cayla grid gap-6 overflow-hidden p-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-6" aria-label="Llegó sin aviso" data-guia="recibir.sin-aviso">
        <div className="grid place-items-start justify-center pt-1.5">
          <CajaFardo />
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void abrir();
          }}
          className="min-w-0 space-y-4"
        >
          <div>
            <p className="label-cayla text-[11px] text-taupe">Sin aviso de Compras</p> {/* unificar-fijo: la ceja de la tarjeta (de dónde viene el paquete), no un vacío */}
            <TituloSeccion>{hayListaArriba ? "¿Llegó algo que no está en la lista?" : "¿Llegó algo sin aviso?"}</TituloSeccion>
            <p className="mt-1 text-[15px] text-taupe">
              {hayListaArriba
                ? "Lo de arriba lo despachó Compras. Si llegó algo más, que nadie despachó desde el sistema, dime de quién es y se cuenta igual, por categoría: solo que sin con qué comparar."
                : "Nadie lo despachó desde el sistema. Dime de quién es y se cuenta igual, por categoría: solo que sin con qué comparar."}
            </p>
          </div>

          <CampoGuiado id="sin-aviso-proveedor" guia={campos}>
            <p className="mb-1.5 text-[13px] font-semibold text-tinta">{campos.etiqueta("sin-aviso-proveedor", "¿De quién es?")}</p>
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
                      {(p.marcas ?? []).length > 0 && <small className="block truncate text-[12.5px] text-taupe">{(p.marcas ?? []).join(" · ")}</small>}
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
              {coinciden.length > primeros.length && <li className="px-1 text-xs text-taupe">Escribe para encontrar a los demás ({coinciden.length - primeros.length} más).</li>}
              {/* Siempre a la vista, al final: no depende de lo que se busque. */}
              <li>
                <button
                  type="button"
                  role="radio"
                  aria-checked={proveedorId === SIN_PROVEEDOR}
                  onClick={() => setProveedorId(SIN_PROVEEDOR)}
                  className={`flex w-full items-center gap-3 rounded-2xl border border-dashed px-3 py-2.5 text-left transition-colors ${
                    proveedorId === SIN_PROVEEDOR ? "border-tinta bg-papel" : "border-tinta/25 hover:border-tinta/40"
                  }`}
                >
                  <span className="rc-cat-ic" data-tamano="chico" aria-hidden>
                    <CircleHelp className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14.5px] text-tinta">No sé de quién es</b>
                    <small className="block text-[12.5px] text-taupe">Se cuenta igual. Antes de cerrar, pregúntale a Compras y elígelo.</small>
                  </span>
                  {proveedorId === SIN_PROVEEDOR && <Check aria-hidden className="h-4 w-4 text-verde" />}
                </button>
              </li>
            </ul>
            {puedeAgregarProveedor ? (
              <p className="mt-2 text-xs text-taupe">
                ¿No está?{" "}
                <button type="button" onClick={() => alta.abrir(buscar)} className="btn-cayla btn-enlace whitespace-normal text-left text-xs">
                  + Agregar proveedor
                </button>
              </p>
            ) : (
              <p className="mt-2 text-xs text-taupe">¿No está? Pídele a quien administra Proveedores que lo agregue, o elige «No sé de quién es».</p>
            )}
          </CampoGuiado>

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
            <CampoGuiado id="sin-aviso-quien" guia={campos}>
              <p className="mb-1.5 text-[13px] font-semibold text-tinta">{campos.etiqueta("sin-aviso-quien", "Quién recibe")}</p>
              <ComboResponsable control={responsable} compacto />
            </CampoGuiado>
          </div>

          {error && (
            <Aviso tono="error" titulo="No se pudo abrir">
              {error}
            </Aviso>
          )}
          <PieGuia guia={campos} listo="Todo listo: ábrelo y cuenta." />
          <Boton type="submit" peso="primario" cargando={abriendo} textoCargando="Abriendo…" disabled={!campos.puedeConfirmar} title={campos.frase ?? undefined} className={campos.claseConfirmar}>
            <span className="inline-flex items-center gap-2">
              <PackageOpen aria-hidden className="h-4 w-4" />
              {susFacturas.length > 0 ? "No, recibir sin factura y contar" : "Empezar a contar"}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </span>
          </Boton>
        </form>
      </section>
      <aside className="card-cayla space-y-2 p-5">
        <TituloSeccion nivel={3}>Cuando Compras lo despache</TituloSeccion>
        <p className="text-[13.5px] text-taupe">
          El envío aparecerá arriba con lo que dijeron por categoría y marca, y la pantalla comparará sola. Lo que manda otra sede de CAYLA no entra
          por aquí: se recibe en <b className="text-tinta">Traslados</b>.
        </p>
      </aside>
    </div>
    {/* Fuera del <form> (ADR-0128): un `submit` del alta no debe llegar a «Empezar a contar». */}
    {alta.modal}
    </>
  );
}

/** Sin tildes ni mayúsculas, para buscar como en los combos (ADR-0209). */
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
