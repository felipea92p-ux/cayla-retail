"use client";

import { Coins, Layers, PackageX, TriangleAlert, TrendingUp } from "lucide-react";
import { TarjetaSenal } from "@/components/ui/TarjetaSenal";
import type { FiltroEstado } from "@/lib/resumen-filtros";
import { formatoSoles, pluralizar } from "@/lib/resumen-formato";
import { MIN_DIAS_CON_STOCK_AFIRMAR, UMBRAL_COBERTURA_ALTA_DIAS, UMBRAL_COBERTURA_CRITICA_DIAS } from "@/lib/inventario-reglas";
import type { ResumenAlcance } from "@/lib/resumen-reglas";

// Las cinco señales de arriba. Cada una cuenta EXACTAMENTE lo que la tabla
// filtra al tocarla (mismos estados en `resumen-reglas.ts`), y una señal en cero
// no es un botón: no hay nada detrás. Capital a costo solo aparece si el costo
// es verificable; si no, la tarjeta cuenta unidades (dato confiable) y dice por
// qué no hay soles — ver `ResumenCapitalModal`.

const ICONO = { strokeWidth: 1.5, className: "h-[22px] w-[22px]" } as const;

export function ResumenSenales({
  r,
  estadoActivo,
  onEstado,
  onCapital,
  noVende = false,
}: {
  r: ResumenAlcance;
  estadoActivo: FiltroEstado;
  onEstado: (e: FiltroEstado) => void;
  onCapital: () => void;
  /** El Taller (o un almacén) no vende a clientas: no hay velocidad, cobertura ni curvas que medir, y
   *  decir «sin historial suficiente» sería inventar un problema que no existe. */
  noVende?: boolean;
}) {
  const { capital } = r;
  const noAplica = "No aplica: no vende a clientas";
  const tocable = (n: number, estado: FiltroEstado) => (n > 0 ? () => onEstado(estadoActivo === estado ? "todos" : estado) : undefined);

  return (
    <div className="grid grid-cols-2 gap-3 min-[1100px]:grid-cols-5">
      <TarjetaSenal
        titulo="Agotadas con demanda"
        valor={noVende ? "—" : r.agotadasConDemanda}
        detalle={noVende ? noAplica : "sin stock y con ventas en el período"}
        tono={!noVende && r.agotadasConDemanda > 0 ? "rojo" : "neutro"}
        icono={<PackageX {...ICONO} />}
        onClick={noVende ? undefined : tocable(r.agotadasConDemanda, "agotada_demanda")}
        activa={estadoActivo === "agotada_demanda"}
      />
      <TarjetaSenal
        titulo="Cobertura crítica"
        valor={noVende ? "—" : r.coberturaCritica}
        detalle={noVende ? noAplica : `≤ ${UMBRAL_COBERTURA_CRITICA_DIAS} días de stock estimado`}
        tono={!noVende && r.coberturaCritica > 0 ? "ambar" : "neutro"}
        icono={<TriangleAlert {...ICONO} />}
        onClick={noVende ? undefined : tocable(r.coberturaCritica, "cobertura_critica")}
        activa={estadoActivo === "cobertura_critica"}
      />
      <TarjetaSenal
        titulo="Curvas rotas"
        valor={noVende ? "—" : r.curvasRotas.curvas}
        detalle={noVende ? noAplica : r.curvasRotas.curvas === 0 ? "ninguna talla clave falta" : `faltan tallas clave (${pluralizar(r.curvasRotas.tallas, "talla", "tallas")})`}
        tono="neutro"
        icono={<Layers {...ICONO} />}
        onClick={noVende ? undefined : tocable(r.curvasRotas.tallas, "curva_rota")}
        activa={estadoActivo === "curva_rota"}
      />
      <TarjetaSenal
        titulo="Posible sobrestock"
        valor={noVende ? "—" : r.sobrestock.total}
        detalle={
          noVende
            ? noAplica
            : r.sobrestock.total > 0
            ? "alta cobertura + baja rotación"
            : r.sobrestock.conEvidencia === 0
              ? `Sin historial suficiente (hacen falta ${MIN_DIAS_CON_STOCK_AFIRMAR} días en venta)`
              : "sin excesos evidentes"
        }
        tono={!noVende && r.sobrestock.total > 0 ? "verde" : "neutro"}
        icono={<TrendingUp {...ICONO} />}
        onClick={noVende ? undefined : tocable(r.sobrestock.total, "posible_sobrestock")}
        activa={estadoActivo === "posible_sobrestock"}
      />
      {capital.verificado ? (
        <TarjetaSenal
          titulo="Capital en inventario"
          valor={formatoSoles(capital.total)}
          unidad="al costo"
          detalle={capital.conCoberturaAlta > 0 ? `${formatoSoles(capital.conCoberturaAlta)} con cobertura > ${UMBRAL_COBERTURA_ALTA_DIAS} días` : `ninguno con cobertura > ${UMBRAL_COBERTURA_ALTA_DIAS} días`}
          tono="neutro"
          icono={<Coins {...ICONO} />}
          onClick={onCapital}
        />
      ) : (
        <TarjetaSenal
          titulo="Unidades en inventario"
          valor={r.unidades.utilizables.toLocaleString("en-US")}
          unidad="uds"
          detalle={r.unidades.conCoberturaAlta > 0 ? `${r.unidades.conCoberturaAlta.toLocaleString("en-US")} con cobertura > ${UMBRAL_COBERTURA_ALTA_DIAS} días` : `ninguna con cobertura > ${UMBRAL_COBERTURA_ALTA_DIAS} días`}
          pie="Capital a costo no disponible: ver por qué"
          tono="neutro"
          icono={<Coins {...ICONO} />}
          onClick={onCapital}
        />
      )}
    </div>
  );
}
