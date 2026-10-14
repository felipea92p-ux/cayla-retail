"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, PackageOpen, Store } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { CajaFardo } from "./piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { diaMes } from "@/lib/fechas-lima";
import { urlContraFactura } from "@/lib/llegada-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { TOPES_CONTEO, mensajeAlGuardar } from "@/lib/recepcion-conteo-reglas";
import { abrirEnvioSinAviso } from "@/lib/recepcion-conteo-acciones";

// «Llegó mercadería sin aviso» (ADR-0393, decisiones 2 y 10): lo que llega sin que Compras lo haya despachado se recibe con el MISMO conteo
// que un envío —por categoría, lo demás para después—. La puerta pregunta lo de siempre (ADR-0330): ¿de quién es? Si ese proveedor tiene una
// factura por recibir en esta sede, ofrece recibir contra ella. Si no, abre un envío sin guía y lleva a contarlo. El costo llega con la
// factura (solo quien ve el dinero de Compras lo pone al cerrar).

export type FacturaPorRecibir = { id: string; proveedorId: string; documento: string; fechaEmision: string | null; pendientes: number };

export function LlegoSinAviso({
  ubicacionId,
  ubicacionEtiqueta,
  proveedores,
  facturas,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** Con sus marcas (se leen en la puerta): se ven bajo cada proveedor y sirven para encontrarlo. */
  proveedores: readonly { id: string; nombre: string; marcas?: readonly string[] }[];
  facturas: readonly FacturaPorRecibir[];
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

  const campos = useGuiaCampos(
    [
      { id: "sin-aviso-proveedor", nombre: "De quién es", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de qué proveedor es." },
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
      { p_ubicacion_id: ubicacionId, p_proveedor_id: proveedorId, p_numero_guia: guia.trim() || null, p_nota: null, p_token: token },
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

  // Los proveedores que coinciden con lo escrito (por nombre o por marca), hasta 6; el elegido siempre a la vista.
  const q = normalizar(buscar);
  const coinciden = proveedores.filter((p) => !q || normalizar(p.nombre).includes(q) || (p.marcas ?? []).some((m) => normalizar(m).includes(q)));
  const elegido = proveedores.find((p) => p.id === proveedorId) ?? null;
  const aLaVista = [...(elegido ? [elegido] : []), ...coinciden.filter((p) => p.id !== proveedorId)].slice(0, 6);

  return (
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
            <p className="label-cayla text-[11px] text-taupe">Sin aviso de Compras</p>
            <TituloSeccion>¿Llegó algo sin aviso?</TituloSeccion>
            <p className="mt-1 text-[15px] text-taupe">
              Nadie lo despachó desde el sistema. Dime de quién es y se cuenta igual, por categoría: solo que sin con qué comparar.
            </p>
          </div>

          <CampoGuiado id="sin-aviso-proveedor" guia={campos}>
            <p className="mb-1.5 text-[13px] font-semibold text-tinta">{campos.etiqueta("sin-aviso-proveedor", "¿De quién es?")}</p>
            <Buscador valor={buscar} onCambio={setBuscar} placeholder="Busca el proveedor por nombre o marca" etiqueta="Buscar el proveedor" />
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
                      <Store className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] text-tinta">{p.nombre}</b>
                      {(p.marcas ?? []).length > 0 && <small className="block truncate text-[12.5px] text-taupe">{(p.marcas ?? []).join(" · ")}</small>}
                    </span>
                    {p.id === proveedorId && <Check aria-hidden className="h-4 w-4 text-verde" />}
                  </button>
                </li>
              ))}
              {aLaVista.length === 0 && <li className="px-1 text-[13px] text-taupe">Ningún proveedor coincide con «{buscar}».</li>}
              {coinciden.length > aLaVista.length && <li className="px-1 text-xs text-taupe">Escribe para encontrar a los demás ({coinciden.length - aLaVista.length} más).</li>}
            </ul>
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
          <Boton type="submit" peso="primario" cargando={abriendo} disabled={!campos.puedeConfirmar} title={campos.frase ?? undefined} className={campos.claseConfirmar}>
            <span className="inline-flex items-center gap-2">
              <PackageOpen aria-hidden className="h-4 w-4" />
              {abriendo ? "Abriendo…" : susFacturas.length > 0 ? "No, recibir sin factura y contar" : "Empezar a contar"}
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
  );
}

/** Sin tildes ni mayúsculas, para buscar como en los combos (ADR-0209). */
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
