"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { SedeSwitcher } from "@/components/SedeSwitcher";

// Navegación v3 (aprobada 2026-07-18, investigada de QuickBooks + POS retail):
// escritorio = lateral con "+ Nuevo" global; celular = 4 pestañas + botón + central.
// "Inventario" es el mundo único del stock físico (catálogo, recibir, almacén).

type Persona = { nombre: string; rol: "lider" | "integrante"; sedeCodigo: string; sedeId: string };

type Props = {
  persona: Persona;
  /** Tiendas + taller para el selector del Líder (vacío para una Encargada). */
  sedesOperativas: { id: string; codigo: string }[];
  children: React.ReactNode;
};

// Íconos de línea (brandbook: "íconos rellenos ×, solo línea") — trazo 1.5
function Icono({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-[18px] w-[18px]"}>
      <path d={d} />
    </svg>
  );
}
const IC = {
  inicio: "M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5",
  vender: "M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2m7 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z",
  inventario: "M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4L4 7m8 4l8-4m-8 4v10",
  comercial: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  finanzas: "M12 3v18m4-15H10a2.5 2.5 0 000 5h4a2.5 2.5 0 010 5H8",
  mas: "M5 12h.01M12 12h.01M19 12h.01",
  buscar: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35",
  nuevo: "M12 5v14m-7-7h14",
};

function BuscadorGlobal({ compacto = false }: { compacto?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) {
          router.push(`/buscar?q=${encodeURIComponent(term)}`);
          setQ("");
        }
      }}
      className={compacto ? "w-full" : "w-full max-w-md"}
    >
      <div className="flex items-center gap-2 border-b border-tinta/20 px-1 py-1.5 transition-colors focus-within:border-rojo">
        <Icono d={IC.buscar} className="h-4 w-4 shrink-0 text-tinta/35" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar o escanear prenda…"
          className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/35"
        />
      </div>
    </form>
  );
}

function MenuNuevo({ esLider, onClose }: { esLider: boolean; onClose: () => void }) {
  const acciones = [
    { href: "/vender", etiqueta: "Nueva venta", detalle: "Registrar la compra de una clienta" },
    { href: "/inventario/recibir", etiqueta: "Recibir mercadería", detalle: "Ingresar un fardo o lote al almacén" },
    { href: "/inventario/almacen", etiqueta: "Bajar a tienda", detalle: "Pasar prendas del almacén al piso" },
    ...(esLider ? [{ href: "/finanzas", etiqueta: "Registrar gasto", detalle: "Alquiler, servicios, transporte…" }] : []),
  ];
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-tinta/30" />
      <div className="absolute inset-x-4 bottom-24 border border-tinta/15 bg-crema p-2 sm:inset-x-auto sm:bottom-auto sm:left-60 sm:top-24 sm:w-80">
        <p className="label-cayla px-3 pb-1 pt-2 text-[9px] text-tinta/40">Nuevo</p>
        {acciones.map((a) => (
          <Link key={a.href} href={a.href} onClick={onClose} className="block px-3 py-2.5 transition-colors hover:bg-sand">
            <p className="text-sm font-medium text-tinta">{a.etiqueta}</p>
            <p className="text-xs text-tinta/45">{a.detalle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ persona, sedesOperativas, children }: Props) {
  const pathname = usePathname();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const esLider = persona.rol === "lider";

  const items = [
    { href: "/", etiqueta: "Inicio", icono: IC.inicio, movil: true },
    { href: "/vender", etiqueta: "Vender", icono: IC.vender, movil: true },
    { href: "/inventario", etiqueta: "Inventario", icono: IC.inventario, movil: true },
    ...(esLider ? [{ href: "/comercial", etiqueta: "Comercial", icono: IC.comercial, movil: false }] : []),
    ...(esLider ? [{ href: "/finanzas", etiqueta: "Finanzas", icono: IC.finanzas, movil: false }] : []),
    { href: "/mas", etiqueta: "Más", icono: IC.mas, movil: true, soloMovil: true },
  ];

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen bg-crema">
      {/* ==================== Lateral (escritorio) ==================== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-tinta/10 bg-crema sm:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <Image src="/cayla-isotipo.png" alt="CAYLA" width={28} height={28} priority className="h-7 w-auto" />
          <span className="label-cayla text-sm text-tinta" style={{ letterSpacing: "0.26em" }}>CAYLA</span>
        </Link>

        <div className="px-4 pb-4">
          <button
            onClick={() => setNuevoAbierto(true)}
            className="label-cayla flex w-full items-center justify-center gap-2 bg-tinta py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
          >
            <Icono d={IC.nuevo} className="h-3.5 w-3.5" /> Nuevo
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {items.filter((i) => !i.soloMovil).map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                activo(i.href) ? "bg-sand font-medium text-tinta" : "text-tinta/60 hover:text-rojo"
              }`}
            >
              <Icono d={i.icono} />
              {i.etiqueta}
            </Link>
          ))}
        </nav>

        <div className="border-t border-tinta/10 px-5 py-4">
          <p className="truncate text-sm text-tinta">{persona.nombre}</p>
          <p className="mt-0.5 text-xs text-tinta/45">
            {esLider ? "Líder" : "Encargada"} · {persona.sedeCodigo}
          </p>
          <div className="mt-2"><LogoutButton /></div>
        </div>
      </aside>

      {/* ==================== Cabecera ==================== */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-tinta/10 bg-crema sm:left-56">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2 sm:hidden">
            <Image src="/cayla-isotipo.png" alt="CAYLA" width={26} height={26} priority className="h-[26px] w-auto" />
          </Link>
          <div className="flex-1"><BuscadorGlobal compacto /></div>
          {esLider && sedesOperativas.length > 0 ? (
            <SedeSwitcher sedes={sedesOperativas} sedeActualId={persona.sedeId} />
          ) : (
            <span className="label-cayla text-[9px] text-tinta/40">{persona.sedeCodigo}</span>
          )}
        </div>
      </header>

      {/* ==================== Contenido ==================== */}
      <main className="px-4 pb-28 pt-20 sm:ml-56 sm:px-8 sm:pb-12 sm:pt-24">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {/* ==================== Pestañas (celular) ==================== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-tinta/10 bg-crema sm:hidden">
        <div className="grid grid-cols-5">
          {items.filter((i) => i.movil).slice(0, 2).map((i) => (
            <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-1 py-2.5 ${activo(i.href) ? "text-rojo" : "text-tinta/50"}`}>
              <Icono d={i.icono} className="h-5 w-5" />
              <span className="text-[10px]">{i.etiqueta}</span>
            </Link>
          ))}
          {/* Botón + central — el "+ Nuevo" de QuickBooks, siempre a un toque */}
          <button onClick={() => setNuevoAbierto(true)} className="flex flex-col items-center justify-center py-2">
            <span className="flex h-11 w-11 items-center justify-center bg-tinta text-crema">
              <Icono d={IC.nuevo} className="h-5 w-5" />
            </span>
          </button>
          {items.filter((i) => i.movil).slice(2).map((i) => (
            <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-1 py-2.5 ${activo(i.href) ? "text-rojo" : "text-tinta/50"}`}>
              <Icono d={i.icono} className="h-5 w-5" />
              <span className="text-[10px]">{i.etiqueta}</span>
            </Link>
          ))}
        </div>
      </nav>

      {nuevoAbierto && <MenuNuevo esLider={esLider} onClose={() => setNuevoAbierto(false)} />}
    </div>
  );
}
