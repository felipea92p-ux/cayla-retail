import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ARBOL, esGrupo, type Nodo } from "@/lib/menu";
import { MODULOS, esClaveModulo } from "@/lib/modulos";
import { NOMBRE_VISTA_GLOBAL } from "@/lib/vista-global";
import { EligeSede } from "@/components/EligeSede";

// CAYLA Global (ADR-0275): a dónde llega quien, mirando toda la empresa, abre una pantalla que trabaja en UNA sede
// (Punto de venta, Caja, un Conteo). No es «sin acceso»: la pantalla existe, solo que necesita saber en qué sede.
// Llega desde la barrera de `proxy.ts` (`?desde=/vender`) o desde `exigirModulo` (`?modulo=vender`). Elegir la sede la
// deja parada ahí y la lleva a esa pantalla.

type Tipo = "tienda" | "almacen" | "taller";
type Destino = { nombre: string; ruta: string; tipos: readonly Tipo[] | null };
type HojaPlana = { etiqueta: string; ruta: string; modulo?: string; tipos: readonly Tipo[] | null };

/** Las pantallas del menú, cada una con los tipos de sede donde existe (los del nodo o, si no dice, los de su grupo:
 *  Producción solo en el Taller, Compras en tiendas y almacén). Así no se ofrece una sede donde la pantalla no existe. */
function hojas(nodos: readonly Nodo[], heredados: readonly Tipo[] | null = null): HojaPlana[] {
  return nodos.flatMap((n) => {
    if (n.estado !== "viva") return [];
    const tipos = n.ubicaciones ?? heredados;
    if (esGrupo(n)) return hojas(n.hijos, tipos);
    return [{ etiqueta: n.etiqueta, ruta: n.ruta, modulo: n.modulo, tipos }];
  });
}

/** El nombre de la pantalla y a dónde volver. Por ruta: la hoja del menú que mejor la contiene (la más larga). Por
 *  módulo: su primera pantalla del menú. Una ruta que el menú no conoce se respeta tal cual (sin nombre). */
function destinoDe(desde: string | undefined, modulo: string | undefined): Destino | null {
  const todas = hojas(ARBOL).filter((h) => h.ruta !== "/");
  if (desde && desde.startsWith("/") && !desde.startsWith("//")) {
    const hoja = todas
      .filter((h) => desde === h.ruta || desde.startsWith(`${h.ruta}/`))
      .sort((a, b) => b.ruta.length - a.ruta.length)[0];
    return { nombre: hoja?.etiqueta ?? "", ruta: desde, tipos: hoja?.tipos ?? null };
  }
  if (modulo && esClaveModulo(modulo)) {
    const hoja = todas.find((h) => h.modulo === modulo);
    const nombre = MODULOS.find((m) => m.clave === modulo)?.nombre ?? "";
    return hoja ? { nombre: hoja.etiqueta || nombre, ruta: hoja.ruta, tipos: hoja.tipos } : { nombre, ruta: "/", tipos: null };
  }
  return null;
}

export default async function EligeSedePage({ searchParams }: { searchParams: Promise<{ desde?: string; modulo?: string }> }) {
  const persona = await requirePersonaActualV2();
  const { desde, modulo } = await searchParams;
  const destino = destinoDe(desde, modulo);
  const todas = await getUbicaciones();
  const sedes = (persona.puedeCambiarUbicacion ? todas : todas.filter((u) => u.id === persona.ubicacionId))
    .filter((u) => !destino?.tipos || destino.tipos.includes(u.tipo))
    .map((u) => ({ id: u.id, nombre: u.nombre }));
  const pantalla = destino?.nombre ? `«${destino.nombre}»` : "Esta pantalla";

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="card-cayla anim-entrada w-full max-w-lg p-8 text-center">
        <p className="label-cayla text-[11px] text-taupe-profundo">{NOMBRE_VISTA_GLOBAL}</p>
        <h1 className="font-display mt-2 text-2xl text-tinta">{pantalla} trabaja en una sede</h1>
        <p className="mt-3 text-sm text-tinta/75">
          {NOMBRE_VISTA_GLOBAL} es para ver y decidir sobre toda la empresa. Lo del día —vender, cobrar, contar, recibir— se
          hace parado en una sede, para que cada movimiento quede anotado donde pasó. ¿En cuál?
        </p>
        <EligeSede sedes={sedes} destino={destino?.ruta ?? "/"} />
        <div className="mt-6">
          <Link href="/global" className="btn-cayla btn-enlace">
            ← Volver a Salud del negocio
          </Link>
        </div>
      </div>
    </div>
  );
}
