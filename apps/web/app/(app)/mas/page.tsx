import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { LogoutButton } from "@/components/LogoutButton";

// "Más" (pestaña del celular): lo que no cabe en las 4 zonas de trabajo diario.
export default async function MasPage() {
  const persona = await requirePersonaActual();
  const esLider = persona.rol === "lider";

  const esTaller = persona.sedeCodigo === "TALLER";
  const enlaces = [
    ...(esLider || esTaller
      ? [{ href: "/produccion", etiqueta: "Producción", detalle: "El tablero del Taller: corte, confección, acabado" }]
      : []),
    ...(esLider ? [{ href: "/comercial", etiqueta: "Comercial", detalle: "Rotación, sugerencias de compra, valor del inventario" }] : []),
    ...(esLider ? [{ href: "/finanzas", etiqueta: "Finanzas", detalle: "Diario de caja, gastos, estado de resultados" }] : []),
    { href: "/inventario/recibir", etiqueta: "Recibir mercadería", detalle: "Ingresar un fardo o lote al almacén" },
    { href: "/inventario/almacen", etiqueta: "Almacén", detalle: "Stock guardado y bajadas a tienda" },
    { href: "/buscar", etiqueta: "Búsqueda", detalle: "Stock y ubicación de cualquier prenda" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">CAYLA</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">{persona.nombre}</h1>
        <p className="mt-1 text-sm text-tinta/50">
          {esLider ? "Líder" : "Encargada de atención al cliente"} · {persona.sedeCodigo}
        </p>
      </div>

      <div className="divide-y divide-tinta/10 card-cayla">
        {enlaces.map((e) => (
          <Link key={e.href} href={e.href} className="group block px-5 py-4 transition-colors hover:bg-sand/40">
            <p className="text-sm font-medium text-tinta group-hover:text-rojo">{e.etiqueta}</p>
            <p className="mt-0.5 text-xs text-tinta/45">{e.detalle}</p>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-tinta/10 pt-5">
        <p className="font-display text-sm italic text-taupe">Donde el estilo transforma.</p>
        <LogoutButton />
      </div>
    </div>
  );
}
