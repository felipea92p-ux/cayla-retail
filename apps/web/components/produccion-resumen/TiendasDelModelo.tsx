import { Store } from "lucide-react";
import { Encabezado, fila, celda, Tabla, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { DIAS_RITMO_RECIENTE, UMBRAL_POCA_BASE_VENTAS } from "@/lib/inventario-reglas";
import { textoDiasDeStock } from "@/lib/produccion-decisiones";
import type { HojaDeModelo, TiendaDeHoja } from "@/lib/produccion-hoja-modelo";
import { Rotulo } from "./CifrasDeLaHoja";

// «Dónde se vende» (hoja «Ver el modelo» del Resumen de Producción): lo que cada tienda vendió de este modelo en los últimos 30 días, lo que le queda, cuánto le dura al ritmo de ESA tienda y
// lo que le viene en camino. Es lo que antes solo se sabía sumado («se vende 8,6 por semana»): ahora se ve qué tienda lo mueve y cuál se quedó sin él. Sin orden por ventas (conteos, no
// rankings, ADR-0346: con 2 ventas por tienda un ranking es ruido): las tiendas van en el orden del catálogo de sedes. Las ventas con 2 o menos se ven en gris (poca base).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]";
const COLUMNAS: Columna[] = [
  { titulo: "Tienda" },
  { titulo: "Vendió", subtitulo: `en ${DIAS_RITMO_RECIENTE} d`, alinear: "der" },
  { titulo: "Hay", alinear: "der" },
  { titulo: "Dura", alinear: "der", ayuda: "Cuántos días alcanza lo que hay en esa tienda, al ritmo con que se vende ahí" },
  { titulo: "En camino", alinear: "der" },
];

/** Cuánto dura lo que hay en una tienda, dicho como se lee: «agotado», «3 días», o «sin ritmo» si ahí no se pudo medir (nunca se inventa un número). */
function textoDura(stock: number, ritmoDia: number | null, dias: number | null): string {
  if (ritmoDia === null || dias === null) return stock > 0 ? "sin ritmo" : "—";
  return textoDiasDeStock(stock, dias);
}

function FilaDeTienda({ nombre, ventas, stock, enCamino, ritmoDia, ventasBase, dias, total = false }: { nombre: string; ventas: number; stock: number; enCamino: number; ritmoDia: number | null; ventasBase: number; dias: number | null; total?: boolean }) {
  const poca = ventas <= UMBRAL_POCA_BASE_VENTAS;
  // Los días que dura se apoyan en el ritmo, y el ritmo en las ventas con que se midió: con 2 o menos son casi ruido (ADR-0346), y se ven en gris igual que la cifra de ventas.
  const pocaBaseDelRitmo = ritmoDia !== null && ventasBase <= UMBRAL_POCA_BASE_VENTAS;
  return (
    <div className={fila(PLANTILLA, total ? "bg-tinta/[0.035] font-medium" : "")}>
      <span title={nombre} className={celda("izq", "text-sm text-tinta")}>
        {nombre}
      </span>
      <span className={celda("der", `text-sm ${poca ? "text-tinta/65" : "text-tinta"}`)}>
        <Rotulo>Vendió</Rotulo>
        {ventas}
      </span>
      <span className={celda("der", "text-sm text-tinta")}>
        <Rotulo>Hay</Rotulo>
        {stock}
      </span>
      <span title={pocaBaseDelRitmo ? "Poca base: el ritmo de esta tienda se midió con 2 ventas o menos" : undefined} className={celda("der", `text-sm ${pocaBaseDelRitmo ? "text-tinta/65" : "text-tinta"}`)}>
        <Rotulo>Dura</Rotulo>
        {textoDura(stock, ritmoDia, dias)}
      </span>
      <span className={celda("der", `text-sm ${enCamino > 0 ? "text-tinta" : "text-tinta/65"}`)}>
        <Rotulo>En camino</Rotulo>
        {enCamino > 0 ? enCamino : "—"}
      </span>
    </div>
  );
}

export function TiendasDelModelo({ hoja }: { hoja: Pick<HojaDeModelo, "tiendas" | "total" | "stockRed" | "enCamino" | "ritmoDia" | "ventasBase" | "diasRed"> }) {
  const { tiendas } = hoja;
  if (tiendas.length === 0) {
    return (
      <div>
        <TituloGrupo>Dónde se vende</TituloGrupo>
        <Vacio tamano="chico" icono={<Store />}>
          No se pudo leer lo de cada tienda. Lo de la red entera, arriba, sí está al día.
        </Vacio>
      </div>
    );
  }
  const porTienda = (t: TiendaDeHoja) => <FilaDeTienda key={t.id} nombre={t.nombre} ventas={t.ventas} stock={t.stock} enCamino={t.enCamino} ritmoDia={t.ritmoDia} ventasBase={t.ventasBase} dias={t.dias} />;
  return (
    <div>
      <TituloGrupo>Dónde se vende</TituloGrupo>
      <Tabla guia="prod-resumen.hoja-tiendas" className="mt-2">
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {tiendas.map(porTienda)}
        {tiendas.length > 1 && <FilaDeTienda nombre="Toda la red" ventas={hoja.total.ventas} stock={hoja.stockRed} enCamino={hoja.enCamino} ritmoDia={hoja.ritmoDia} ventasBase={hoja.ventasBase} dias={hoja.diasRed} total />}
      </Tabla>
    </div>
  );
}
