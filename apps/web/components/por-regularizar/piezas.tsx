import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { veredictoDe, type PrendaParaRegularizar } from "@/lib/por-regularizar-mesa";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import type { Calce } from "@/lib/por-regularizar-mesa";

// Las piezas chicas que comparten el talón, la tarjeta de prenda y el puente (ADR-0360).

/** La prenda sin foto: el ícono de su categoría sobre su color (`MosaicoPrenda`, ADR-0333). Llena la caja que le da quien lo pone. */
export function MosaicoDeVenta({ venta }: { venta: Pick<FilaPorRegularizar, "colorHex" | "categoriaPrefijo" | "categoriaFamilia" | "categoria"> }) {
  return <MosaicoPrenda forma="relleno" colorHex={venta.colorHex} prefijo={venta.categoriaPrefijo} familia={venta.categoriaFamilia} categoria={venta.categoria} className="h-full w-full !rounded-none" />;
}

export function MosaicoDePrenda({ prenda }: { prenda: Pick<PrendaParaRegularizar, "colorHex" | "categoriaPrefijo" | "categoriaFamilia" | "categoria"> }) {
  return <MosaicoPrenda forma="relleno" colorHex={prenda.colorHex} prefijo={prenda.categoriaPrefijo} familia={prenda.categoriaFamilia} categoria={prenda.categoria} className="h-full w-full !rounded-none" />;
}

/** El visto que se dibuja una vez (`vsr-celebra-ic path`, o suelto en un visito). */
export function IconoVisto({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

/** El veredicto de una prenda frente a lo que anotó caja, en una frase: «Calza en todo» (verde) o qué cambia (ámbar). */
export function Veredicto({ calce }: { calce: Calce }) {
  const v = veredictoDe(calce);
  return (
    <span className="vsr-veredicto" data-tono={v.tono}>
      {v.tono === "ok" ? <IconoVisto className="h-3 w-3" /> : <i aria-hidden />}
      {v.texto}
    </span>
  );
}

/** «Tienda TRU» → «TRU»: para decir «3 en TRU» sin repetir la palabra tienda. */
export function sedeCorta(sede: string): string {
  return sede.replace(/^tienda\s+/i, "").trim() || sede;
}

export const soles = (n: number) => `S/ ${n.toFixed(2)}`;
