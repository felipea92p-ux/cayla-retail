"use client";

import { Aviso } from "@/components/ui/Aviso";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CampoSelect, CampoTexto, Interruptor, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { MediosDePago } from "@/components/MediosDePago";
import { soles } from "@/lib/compras-reglas";
import type { CuentaElegible } from "@/lib/cuenta-sellada-reglas";
import type { MedioForm } from "@/lib/medios-pago-reglas";
import type { TipoPapel } from "@/lib/insumo-compra-reglas";

// La parte de «Llegó una compra» que no depende de las líneas (ADR-0614; P03 del «Análisis del Taller», Felipe 2026-11-02): a quién se le compró, el papel del proveedor (o «todavía no lo tengo») y si ya se pagó o queda por pagar.
// Es solo la parte de pantalla: el estado vive en `IngresarInsumoModal` (que arma lo que se manda con `insumo-compra-reglas`) y la base exige todo otra vez (`recibir_insumo_comprado`).

export type ProveedorParaCompra = { id: string; nombre: string; plazoCreditoDias: number | null };

const TIPOS: readonly { valor: TipoPapel; texto: string }[] = [
  { valor: "factura", texto: "Factura" },
  { valor: "boleta", texto: "Boleta" },
  { valor: "nota_venta", texto: "Nota de venta" },
];

export function CompraDelInsumo({
  guia,
  proveedores,
  proveedorId,
  onProveedor,
  tipo,
  onTipo,
  serie,
  onSerie,
  numero,
  onNumero,
  sinPapel,
  onSinPapel,
  pagada,
  onPagada,
  vence,
  onVence,
  emision,
  medios,
  onMedios,
  total,
  cuentas,
}: {
  guia: GuiaCampos;
  proveedores: readonly ProveedorParaCompra[];
  proveedorId: string;
  onProveedor: (id: string) => void;
  tipo: TipoPapel;
  onTipo: (t: TipoPapel) => void;
  serie: string;
  onSerie: (s: string) => void;
  numero: string;
  onNumero: (s: string) => void;
  sinPapel: boolean;
  onSinPapel: (v: boolean) => void;
  pagada: boolean;
  onPagada: (v: boolean) => void;
  vence: string;
  onVence: (iso: string) => void;
  emision: string;
  medios: MedioForm[];
  onMedios: (m: MedioForm[]) => void;
  /** Lo que se paga, con IGV: lo que los medios tienen que sumar. */
  total: number;
  cuentas: { lista: readonly CuentaElegible[]; listo: boolean; falla?: boolean; reintentar?: () => void };
}) {
  return (
    <div data-guia="prod-ingreso.compra" className="space-y-4 rounded-2xl border border-sand bg-crema p-3.5">
      <CampoGuiado id="proveedor" guia={guia}>
        {proveedores.length === 0 ? (
          <Aviso tono="atencion" chico titulo="No hay proveedores en el directorio">
            Una compra se le hace a alguien: registra primero al proveedor en Producción ▸ Proveedores.
          </Aviso>
        ) : (
          <div className="space-y-1.5">
            <p className="campo-etiqueta">{guia.etiqueta("proveedor", "¿A quién se la compraste?")}</p>
            <ComboBuscable
              valor={proveedorId}
              onValor={onProveedor}
              opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
              marcador="Busca al proveedor…"
              etiquetaAccesible="Proveedor de la compra"
            />
          </div>
        )}
      </CampoGuiado>

      <CampoGuiado id="documento" guia={guia}>
        <div className="space-y-2.5">
          <p className="campo-etiqueta">{guia.etiqueta("documento", "El papel del proveedor")}</p>
          {!sinPapel && (
            <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.4fr)]">
              <CampoSelect etiqueta="Tipo" valor={tipo} onValor={(v) => onTipo(v)} opciones={TIPOS} />
              <CampoTexto etiqueta="Serie" mono value={serie} onChange={(e) => onSerie(e.target.value)} maxLength={20} autoComplete="off" />
              <CampoTexto etiqueta="Número" mono value={numero} onChange={(e) => onNumero(e.target.value)} maxLength={20} autoComplete="off" />
            </div>
          )}
          <Interruptor
            etiqueta="Todavía no tengo el papel"
            activo={sinPapel}
            onActivo={onSinPapel}
            pie={sinPapel ? "Queda como nota de venta provisional (serie S/P): se ve en Por pagar y se reemplaza cuando llegue el papel real. Sin IGV hasta entonces." : undefined}
          />
        </div>
      </CampoGuiado>

      <CampoGuiado id="pago" guia={guia}>
        <div className="space-y-3">
          <Segmentado
            etiqueta={guia.etiqueta("pago", "¿Ya la pagaste?")}
            valor={pagada ? "si" : "no"}
            onValor={(v) => onPagada(v === "si")}
            opciones={[
              { valor: "no", texto: "Queda por pagar" },
              { valor: "si", texto: "Ya la pagué" },
            ]}
            pie={pagada ? `Se paga ${soles(total)} con los medios de abajo.` : "La deuda aparece en Por pagar con su vencimiento."}
          />
          {pagada ? (
            <MediosDePago medios={medios} onCambio={onMedios} esperado={total} totalComprobante={total} exacto etiquetaEsperado="Total a pagar" cuentas={cuentas} />
          ) : (
            <CampoFecha etiqueta="Vence" valor={vence} onValor={onVence} caja />
          )}
          <p className="text-sm text-tinta/65">Emisión del papel: {emision.split("-").reverse().join("/")}.</p>
        </div>
      </CampoGuiado>
    </div>
  );
}
