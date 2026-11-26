"use client";

import { Aviso } from "@/components/ui/Aviso";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { TituloDePaso } from "@/components/insumos-taller/PiezasDeHoja";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Campo, CampoSelect, CampoTexto, Interruptor, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { ParDato, Pares } from "@/components/ui/ParDato";
import { MediosDePago } from "@/components/MediosDePago";
import type { CuentaElegible } from "@/lib/cuenta-sellada-reglas";
import type { MedioForm } from "@/lib/medios-pago-reglas";
import type { TipoPapel } from "@/lib/insumo-compra-reglas";
import { diaEnPalabras } from "@/lib/insumos-vista";

// La parte de «Llegó una compra» que no depende de las líneas (ADR-0614; P03 del «Análisis del Taller», Felipe 2026-11-02): a quién se le compró, el papel del proveedor (o «todavía no lo tengo») y si ya se pagó o queda por pagar.
// Es solo la parte de pantalla: el estado vive en `LlegoUnaCompraModal` (que arma lo que se manda con `insumo-compra-reglas`) y la base exige todo otra vez (`registrar_compra_de_insumos`).
//
// «Producción más clara» (Felipe 2026-11-26; maqueta docs/maquetas/produccion-resumen-2026-11/): son los pasos 2 («A quién se lo compraste») y 3 («Cómo se paga») de la hoja. Lo que explicaba
// cada control con una frase debajo va detrás del «?» de su paso, y la emisión del papel es su propia pieza. No cambia qué se pide ni qué se valida.

export type ProveedorParaCompra = { id: string; nombre: string; plazoCreditoDias: number | null };

const TIPOS: readonly { valor: TipoPapel; texto: string }[] = [
  { valor: "factura", texto: "Factura" },
  { valor: "boleta", texto: "Boleta" },
  { valor: "nota_venta", texto: "Nota de venta" },
];

/** El interruptor nombra el papel elegido: «Todavía no tengo la factura». */
const SIN_PAPEL: Record<TipoPapel, string> = { factura: "Todavía no tengo la factura", boleta: "Todavía no tengo la boleta", nota_venta: "Todavía no tengo la nota de venta" };

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
    <div data-guia="prod-ingreso.compra" className="space-y-6">
      <section className="space-y-3">
        <TituloDePaso
          paso={2}
          ayuda={
            <>
              El papel es la factura, la boleta o la nota de venta que te dio el proveedor. Si todavía no lo tienes, la compra queda como nota de venta provisional (serie S/P): se ve en Por pagar y se
              reemplaza cuando llegue el papel real. Hasta entonces va sin IGV.
            </>
          }
        >
          A quién se lo compraste
        </TituloDePaso>
        <CampoGuiado id="proveedor" guia={guia}>
          {proveedores.length === 0 ? (
            <Aviso tono="atencion" chico titulo="No hay proveedores en el directorio">
              Una compra se le hace a alguien: registra primero al proveedor en Producción ▸ Proveedores.
            </Aviso>
          ) : (
            <Campo etiqueta={guia.etiqueta("proveedor", "Proveedor")} sinPie>
              <ComboBuscable valor={proveedorId} onValor={onProveedor} opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))} marcador="Busca al proveedor" etiquetaAccesible="Proveedor de la compra" />
            </Campo>
          )}
        </CampoGuiado>

        <CampoGuiado id="documento" guia={guia}>
          <div className="space-y-2.5">
            {!sinPapel && (
              <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.4fr)]">
                <CampoSelect etiqueta={guia.etiqueta("documento", "Papel")} valor={tipo} onValor={(v) => onTipo(v)} opciones={TIPOS} sinPie />
                <CampoTexto etiqueta="Serie" mono sinPie value={serie} onChange={(e) => onSerie(e.target.value)} maxLength={20} autoComplete="off" />
                <CampoTexto etiqueta="Número" mono sinPie value={numero} onChange={(e) => onNumero(e.target.value)} maxLength={20} autoComplete="off" />
              </div>
            )}
            <Interruptor etiqueta={SIN_PAPEL[tipo]} activo={sinPapel} onActivo={onSinPapel} pie={sinPapel ? "Queda provisional y sin IGV hasta que llegue." : undefined} />
          </div>
        </CampoGuiado>
      </section>

      <section className="space-y-3">
        <TituloDePaso paso={3} ayuda={<>Si queda por pagar, la deuda aparece en Por pagar con su vencimiento. Si ya la pagaste, los medios de pago tienen que sumar justo el total.</>}>
          Cómo se paga
        </TituloDePaso>
        <CampoGuiado id="pago" guia={guia}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Segmentado
                etiqueta={guia.etiqueta("pago", "¿Ya la pagaste?")}
                valor={pagada ? "si" : "no"}
                onValor={(v) => onPagada(v === "si")}
                opciones={[
                  { valor: "no", texto: "Queda por pagar" },
                  { valor: "si", texto: "Ya la pagué" },
                ]}
              />
              {!pagada && <CampoFecha etiqueta="Vence el" valor={vence} onValor={onVence} />}
            </div>
            {pagada && <MediosDePago medios={medios} onCambio={onMedios} esperado={total} totalComprobante={total} exacto etiquetaEsperado="Total a pagar" cuentas={cuentas} />}
            <Pares>
              <ParDato rotulo="Emisión del papel">{diaEnPalabras(emision, emision)}</ParDato>
            </Pares>
          </div>
        </CampoGuiado>
      </section>
    </div>
  );
}
