import Link from "next/link";
import type { ComponentProps } from "react";
import { exactitudConteos, tonoExactitud } from "@/lib/conteo-varianza";
import { ultimoConteoConPrendas, type PrendaPendiente } from "@/lib/conteo-reglas";
import type { ConteoAbierto, ConteoResumen, PrioridadConteo } from "@/lib/conteos";
import type { Sububicacion } from "@/lib/sububicaciones";
import { ConteoPanel } from "@/components/ConteoPanel";
import { ConteosLista } from "@/components/ConteosLista";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "America/Lima" });
}

// null = quien mira no ve el dinero (20260923193700): «—», nunca S/ 0.
function soles(n: number | null) {
  if (n === null) return "—";
  return `${n < 0 ? "−" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Conteos físicos (Felipe, 2026-09-14): el backend (abrir_conteo,
// conteo_contar, cerrar_conteo) ya existía — esta es la pantalla que le
// faltaba. Piso/almacén (20260914210000_inventario_piso_almacen.sql): una
// ubicación que los separa exige elegir cuál se cuenta — `sububicaciones`
// llega para que `ConteoPanel` decida si ofrece ese selector o abre directo.
//
// Rediseño 2026-09-22 (ADR-0174, demo en docs/maquetas/conteo-rediseno-2026-09/):
//  · Con un conteo abierto ya NO se muestra «Diferencia hasta ahora»: le decía a quien cuenta cuánto se alejaba
//    del sistema mientras contaba, y el conteo dejaba de ser a ciegas. La diferencia se ve al revisar.
//  · Sin conteo abierto, la tarjeta del medio deja de decir «Ninguno» y dice cuánta plata hay en lo que más
//    conviene contar; el abrir en tres pasos vive en `ConteoPanel`.
//  · Los conteos cerrados sin prendas son «Vacío»: no cuentan para la exactitud (ya no contaban) ni como «último».
//  · Mientras se cuenta, `pendientes` viaja al navegador SIN la cifra del sistema (`pendientesSinCifras`).
// Sin estado «por revisar» (decisión de Felipe, 2026-09-16): quien cuenta, cierra —
// un conteo está abierto o cerrado, nada más.
//
// Server Component sin datos propios: `app/(app)/inventario/conteo/page.tsx` lee y esto dibuja. Separado para poder
// mirarlo con datos de muestra sin base (principio 7).
export function ConteoVista({
  ubicacionEtiqueta,
  ubicacionId,
  puedeCerrar,
  puedeCrearMarcas,
  conteoAbierto,
  conteos,
  pendientes,
  sububicaciones,
  categorias,
  prioridad,
  colores,
  tallasPorCategoria,
  marcas,
  catalogo,
}: {
  ubicacionEtiqueta: string;
  ubicacionId: string;
  puedeCerrar: boolean;
  puedeCrearMarcas: boolean;
  conteoAbierto: ConteoAbierto | null;
  conteos: ConteoResumen[];
  pendientes: PrendaPendiente[];
  sububicaciones: Sububicacion[];
  categorias: { id: string; nombre: string }[];
  prioridad: PrioridadConteo[];
  colores: { codigo: string; nombre: string }[];
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  marcas: ComponentProps<typeof ConteoPanel>["marcas"];
  catalogo: ComponentProps<typeof ConteoPanel>["catalogo"];
}) {
  const exactitud = exactitudConteos(conteos);
  const ultimo = ultimoConteoConPrendas(conteos);
  const vacios = conteos.filter((c) => c.estado === "cerrado" && c.lineas === 0).length;
  const enRiesgo = prioridad.reduce((acc, p) => acc + p.valorEnRiesgo, 0);
  // Una línea por lugar (piso / almacén) para elegir dónde contar: su último conteo con prendas, o que el último
  // salió vacío. Sale de la misma lista del historial (viene del más reciente al más antiguo).
  const ultimoPorLugar = Object.fromEntries(
    sububicaciones.map((s) => {
      const delLugar = conteos.filter((c) => c.estado === "cerrado" && c.sububicacionNombre === s.nombre);
      const conPrendas = delLugar.find((c) => c.lineas > 0);
      const texto = conPrendas
        ? `Último conteo: ${conPrendas.numero} · ${fecha(conPrendas.cerradoEn ?? conPrendas.creadoEn)}`
        : delLugar[0]
          ? `Aún sin conteo con prendas · el ${delLugar[0].numero} cerró vacío`
          : "Nunca se contó";
      return [s.id, texto];
    })
  );

  return (
    <div className="space-y-6">
      <InventarioHero
        eyebrow={`Inventario · Conteo · ${ubicacionEtiqueta}`}
        titulo="Conteo físico"
        descripcion="Compara lo que dice el sistema contra lo que hay de verdad en la tienda. Se cuenta a ciegas: el sistema no muestra su cifra hasta revisar."
        foto={fotoHeroPorPantalla("conteo")}
        variante="integrado"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta
          etiqueta="Exactitud del inventario"
          valor={exactitud ? `${exactitud.porcentaje.toLocaleString("es-PE")} %` : "—"}
          tono={exactitud ? tonoExactitud(exactitud.porcentaje) : "text-taupe"}
        >
          {exactitud
            ? `${exactitud.correctas} de ${exactitud.lineas} prendas coincidieron · ${exactitud.conteos} ${exactitud.conteos === 1 ? "conteo" : "conteos"} con prendas`
            : vacios > 0
              ? `Todavía ningún conteo con prendas: ${vacios === 1 ? "el cerrado salió vacío" : `los ${vacios} cerrados salieron vacíos`} y no cuentan.`
              : "Sin conteos cerrados todavía — el primero que se cierre estrena esta cifra"}
        </Tarjeta>
        {conteoAbierto ? (
          // Sin avance ni diferencia: el avance vive en vivo en el panel de abajo (esta tarjeta no se refresca en
          // cada escaneo) y la diferencia no se muestra mientras se cuenta.
          <Tarjeta
            etiqueta="Conteo abierto"
            valor={`Conteo ${conteoAbierto.numero}`}
            accion={{ href: "#contar", texto: "Seguir contando" }}
          >
            {conteoAbierto.sububicacionNombre ?? "Toda la ubicación"}
            {conteoAbierto.alcance === "categoria" && conteoAbierto.alcanceCategoriaNombre ? ` · solo ${conteoAbierto.alcanceCategoriaNombre}` : " · todo el catálogo"} · abrió{" "}
            {conteoAbierto.abiertoPorNombre}
          </Tarjeta>
        ) : (
          <Tarjeta etiqueta="Conviene contar primero" valor={prioridad.length > 0 ? soles(enRiesgo) : "—"} tono={prioridad.length > 0 ? undefined : "text-taupe"}>
            {prioridad.length > 0
              ? `A precio de venta, en las ${prioridad.length} prendas de la lista de abajo: las nunca contadas y las de más plata en la percha.`
              : "Nada con stock pendiente de contar en esta tienda."}
          </Tarjeta>
        )}
        <Tarjeta
          etiqueta="Último conteo con prendas"
          valor={ultimo ? soles(ultimo.solesDiferencia) : "—"}
          tono={ultimo ? ((ultimo.solesDiferencia ?? 0) < 0 ? "text-rojo-profundo" : "text-tinta") : "text-taupe"}
        >
          {ultimo
            ? `Conteo ${ultimo.numero} · ${ultimo.lineasConDiferencia === 0 ? "todo coincidió" : `${ultimo.lineasConDiferencia} ${ultimo.lineasConDiferencia === 1 ? "prenda" : "prendas"} con diferencia`} · ya ajustado en el stock`
            : "Ningún conteo con prendas todavía."}
        </Tarjeta>
      </div>

      <div id="contar" className="scroll-mt-6">
        <ConteoPanel
          ubicacionId={ubicacionId}
          puedeCerrar={puedeCerrar}
          puedeCrearMarcas={puedeCrearMarcas}
          conteoAbierto={conteoAbierto}
          pendientes={pendientes}
          ultimoPorLugar={ultimoPorLugar}
          sububicaciones={sububicaciones}
          categorias={categorias}
          prioridad={prioridad}
          colores={colores}
          tallasPorCategoria={tallasPorCategoria}
          marcas={marcas}
          catalogo={catalogo}
        />
      </div>

      {conteos.length > 0 && (
        <section className="card-cayla space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg text-tinta">Conteos de esta ubicación</h2>
            <p className="text-xs text-taupe">Un conteo está abierto o cerrado, nada más.</p>
          </div>
          <ConteosLista conteos={conteos} />
        </section>
      )}

      <p className="nota-cayla">
        <b>Cómo se cuenta:</b> se escanea o se escribe el SKU y se anota lo que hay físicamente, sin ver la cifra del sistema. Al
        revisar, se ve la diferencia en unidades y en soles; al cerrar, el stock queda ajustado a lo contado y cada ajuste queda como movimiento.{" "}
        <Link href="/inventario/movimientos?proc=conteo" className="text-tinta underline underline-offset-2 hover:text-taupe">
          Ver ajustes por conteo →
        </Link>
      </p>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  tono,
  accion,
  children,
}: {
  etiqueta: string;
  valor: string;
  tono?: string;
  accion?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  // La tarjeta del sistema (`ui/TarjetaCifra`, guía oficial). El enlace de acción sigue siendo un <a>
  // nativo: es un salto de ancla dentro de la misma página (#contar) — el <Link> de Next no siempre dispara
  // el scroll nativo para un href de solo-hash en la misma ruta.
  return (
    <TarjetaCifra etiqueta={etiqueta} valor={valor} tono={tono}>
      {children}
      {accion && (
        <a href={accion.href} className="label-cayla mt-3 block text-[11px] text-tinta underline underline-offset-2 hover:no-underline">
          {accion.texto} →
        </a>
      )}
    </TarjetaCifra>
  );
}
