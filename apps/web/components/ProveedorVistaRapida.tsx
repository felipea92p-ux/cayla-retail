"use client";

import type { Proveedor } from "@/lib/proveedores";
import { soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { estadoDeProveedor, haceCuanto, inicialesMeses, siguientePaso, sinDatosDePago } from "@/lib/proveedores-reglas";
import { BarrasMensuales } from "@/components/ui/BarrasMensuales";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { PasoSugerido } from "@/components/ui/PasoSugerido";
import { Cajon } from "@/components/ui/Cajon";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { PALABRA_SEDE, type ResumenTallasYSedes } from "@/lib/proveedor-tallas-sedes-reglas";

// Vista rápida de un proveedor (ADR-0128, spike 2026-09-19): al tocar una fila se abre un cajón desde el
// borde derecho en vez de saltar a la ficha. El problema que resuelve: comparar cinco proveedores
// obligaba a ir a la ficha y volver a la lista cinco veces, perdiendo el orden, el filtro y la búsqueda.
// Acá la lista queda detrás, intacta, y con ↑ ↓ se pasa de un proveedor al siguiente sin cerrar.
//
// Es solo de líder (lo financiero solo llega a un líder; a un colaborador no se le ofrece). La ficha
// completa sigue siendo la pantalla de referencia: esto es el vistazo, no la reemplaza.
//
// Cierre en dos tiempos, igual que `Modal`: primero se anima la salida y recién ahí se le avisa al padre.
export function ProveedorVistaRapida({
  proveedor: p,
  marcas,
  serie,
  posicion,
  cambiando,
  onCerrar,
  onNavegar,
  onCambiarEstado,
  ritmo = null,
  tallasYSedes = null,
}: {
  proveedor: Proveedor;
  /** Marcas con que se conoce al proveedor (ADR-0140). Vacío si no tiene o no se pudieron leer. */
  marcas: readonly string[];
  /** Doce montos mensuales; `null` si la función de series no está disponible (se omite la sección). */
  serie: number[] | null;
  posicion: { indice: number; total: number };
  cambiando: boolean;
  onCerrar: () => void;
  onNavegar: (delta: 1 | -1) => void;
  onCambiarEstado: () => void;
  /**
   * Cómo se vende lo que te llegó de él (el ranking de Mercadería, ADR-0521): la palabra de su insignia, qué toca hacer y los números con que
   * se decidió. Es el «¿Por qué?» de la insignia a un toque (Formidable 2026-10-26: antes vivía solo al pasar el mouse). `null` fuera del ranking.
   */
  ritmo?: { palabra: string; tono: "verde" | "pizarra" | "ambar" | "neutro"; que: string; numeros: readonly string[] } | null;
  /**
   * Las tallas que pide y cómo le va en cada tienda, en pocas palabras (ADR-0521, actividad 6; el detalle está en su ficha). `undefined` mientras
   * llega; `null` fuera del ranking o si la base no lo tiene.
   */
  tallasYSedes?: ResumenTallasYSedes | null;
}) {

  const paso = siguientePaso(estadoDeProveedor(p));
  const sinCompras90 = p.dias_desde_ultima_compra != null && p.dias_desde_ultima_compra > 90;

  return (
    <Cajon
      onCerrar={onCerrar}
      clave={p.id}
      guiaCuerpo="proveedor-vista.resumen"
      guiaPie="proveedor-vista.acciones"
      marca={<AvatarPersona personaId={null} nombre={p.nombre} tamano={40} />}
      titulo={p.nombre}
      frase={`${p.ruc ?? "Sin RUC"} · ${p.contacto ?? "Sin contacto"}`}
      debajo={
        <div className="flex flex-wrap gap-1.5">
          {p.rubros.map((r) => (
            <Chip key={r} className="normal-case tracking-normal font-medium text-xs">
              {r}
            </Chip>
          ))}
          {marcas.map((m) => (
            <Chip key={m} className="normal-case tracking-normal font-medium text-xs">
              {m}
            </Chip>
          ))}
          {p.plazo_credito_dias != null && <Chip className="normal-case tracking-normal font-medium text-xs">Crédito a {p.plazo_credito_dias} días</Chip>}
          {p.activo && sinDatosDePago(p) && <Chip tono="ambar" className="normal-case tracking-normal font-medium text-xs">Sin datos de pago</Chip>}
          {!p.activo && <Chip tono="rojo" className="normal-case tracking-normal font-medium text-xs">Desactivado</Chip>}
        </div>
      }
      navegacion={{ indice: posicion.indice, total: posicion.total, onNavegar, que: "Proveedor", circular: true }}
      pie={
        <>
          {/* Desactivar es lo peligroso (rojo desde el principio, ADR-0358 ronda 7, como en la vista rápida de un producto); reactivar, no. */}
          <Boton textoCargando={p.activo ? "Desactivando…" : "Reactivando…"} type="button" peso={p.activo ? "peligro" : "discreto"} cargando={cambiando} onClick={onCambiarEstado} className="px-3 py-2">
            {p.activo ? "Desactivar" : "Reactivar"}
          </Boton>
          <BotonVer href={`/compras/proveedores/${p.id}`} className="order-last basis-full">
            Abrir ficha completa
          </BotonVer>
        </>
      }
    >
      <PasoSugerido paso={paso} proveedorId={p.id} animar />

      <dl className="mt-5 grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-xl border border-sand">
        <div className="px-3.5 py-3">
          <dt className="label-cayla text-[10px] text-tinta/65">Facturado 12 m</dt>
          <dd className="font-display mt-0.5 text-[21px] leading-tight tabular-nums text-tinta">{soles(p.facturado_12m ?? 0).replace(/\.00$/, "")}</dd>
        </div>
        <div className="px-3.5 py-3">
          <dt className="label-cayla text-[10px] text-tinta/65">Saldo</dt>
          <dd className={`font-display mt-0.5 text-[21px] leading-tight tabular-nums ${(p.saldo_vencido ?? 0) > 0 ? "text-rojo" : "text-tinta"}`}>{soles(p.saldo ?? 0).replace(/\.00$/, "")}</dd>
        </div>
        <div className="px-3.5 py-3">
          <dt className="label-cayla text-[10px] text-tinta/65">Última compra</dt>
          <dd className={`font-display mt-1 text-lg leading-tight ${sinCompras90 && p.activo ? "text-ambar-profundo" : "text-tinta"}`}>{haceCuanto(p.dias_desde_ultima_compra)}</dd>
        </div>
      </dl>

      {ritmo && (
        <section className="mt-6">
          <TituloGrupo className="mb-2.5">Cómo se vende</TituloGrupo>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <Chip tono={ritmo.tono}>{ritmo.palabra}</Chip>
            <p className="text-sm font-semibold text-tinta">{ritmo.que}</p>
          </div>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-tinta/80">
            {ritmo.numeros.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {tallasYSedes && (tallasYSedes.tallas || tallasYSedes.tiendas.length > 0) && <TallasYSedes r={tallasYSedes} />}

      {serie && serie.some((v) => v > 0) && (
        <section className="mt-6">
          <TituloGrupo className="mb-2.5">Facturado por mes</TituloGrupo>
          <BarrasMensuales serie={serie} iniciales={inicialesMeses(hoyLima())} />
        </section>
      )}
    </Cajon>
  );
}

const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

// «Tallas y sedes» en pocas palabras (ADR-0521, actividad 6): las mismas cuentas que la ficha (`resumenTallasYSedes`); los números y la curva
// completa siguen en «Abrir ficha completa».
function TallasYSedes({ r }: { r: ResumenTallasYSedes }) {
  const t = r.tallas;
  return (
    <section className="mt-6">
      <TituloGrupo className="mb-2.5">Tallas y sedes</TituloGrupo>
      {t && (
        <p className="text-sm text-tinta">
          {!t.mide
            ? `Con ${t.vendidas} vendidas todavía es poco para decir qué tallas pide.`
            : t.piden.length > 0 || t.sobran.length > 0
              ? [t.piden.length > 0 ? `Pídele más ${enLista(t.piden)}` : null, t.sobran.length > 0 ? `${t.piden.length > 0 ? "y menos" : "Pídele menos"} ${enLista(t.sobran)}` : null].filter(Boolean).join(" ") + "."
              : "Sus tallas se venden en la misma proporción en que las tienes."}
        </p>
      )}
      {r.tiendas.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-tinta">
          {r.tiendas.map((s) => (
            <li key={s.sede} className="flex items-center gap-1.5">
              {s.sede}
              <Chip tono={PALABRA_SEDE[s.veredicto].tono}>{PALABRA_SEDE[s.veredicto].texto}</Chip>
            </li>
          ))}
        </ul>
      )}
      {r.traslado && (
        <p className="mt-2.5 text-sm text-tinta/80">
          Antes de pedirle más: lleva {r.traslado.cantidad} de {r.traslado.origen} a {r.traslado.destino}.
        </p>
      )}
    </section>
  );
}

