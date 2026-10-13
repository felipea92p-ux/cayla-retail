"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageOpen } from "lucide-react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
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
  proveedores: readonly { id: string; nombre: string }[];
  facturas: readonly FacturaPorRecibir[];
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [proveedorId, setProveedorId] = useState("");
  const [guia, setGuia] = useState("");
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

  return (
    <section className="card-cayla space-y-4 p-4 sm:p-5" aria-label="Llegó sin aviso" data-guia="recibir.sin-aviso">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sand text-tinta">
          <PackageOpen className="h-5 w-5" />
        </span>
        <div>
          <TituloSeccion>¿Llegó algo sin aviso?</TituloSeccion>
          <p className="text-sm text-taupe">
            Si vino directo del proveedor (o por WhatsApp), se recibe igual: cuentas por categoría, solo que sin con qué comparar. Lo que manda otra sede de
            CAYLA no entra por aquí: se recibe en Traslados.
          </p>
        </div>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void abrir();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoGuiado id="sin-aviso-proveedor" guia={campos}>
            <CampoSelect
              etiqueta={campos.etiqueta("sin-aviso-proveedor", "¿De quién es?")}
              valor={proveedorId}
              onValor={setProveedorId}
              opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
              marcador="Elige el proveedor"
            />
          </CampoGuiado>
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
        </div>

        {susFacturas.length > 0 && (
          <div className="nota-cayla space-y-2.5">
            <p>
              Este proveedor tiene {susFacturas.length === 1 ? "una factura" : `${susFacturas.length} facturas`} por recibir en {ubicacionEtiqueta}. Si viene con{" "}
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

        <CampoGuiado id="sin-aviso-quien" guia={campos}>
          <p className="mb-1.5 text-[13px] font-semibold text-tinta">{campos.etiqueta("sin-aviso-quien", "Quién recibe")}</p>
          <ComboResponsable control={responsable} />
        </CampoGuiado>

        {error && (
          <Aviso tono="error" titulo="No se pudo abrir">
            {error}
          </Aviso>
        )}
        <PieGuia guia={campos} listo="Todo listo: ábrelo y cuenta." />
        <div className="flex justify-end">
          <Boton type="submit" peso="primario" cargando={abriendo} disabled={!campos.puedeConfirmar} title={campos.frase ?? undefined} className={campos.claseConfirmar}>
            {abriendo ? "Abriendo…" : susFacturas.length > 0 ? "No, recibir sin factura y contar" : "Empezar a contar"}
          </Boton>
        </div>
      </form>
    </section>
  );
}
