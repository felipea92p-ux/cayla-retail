import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoInteligente } from "@/lib/inteligencia";
import { getCajaAbierta } from "@/lib/finanzas";
import { getPanelLider } from "@/lib/panel";
import { BuscadorHero } from "@/components/BuscadorHero";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

// Inicio por rol (rediseño UX 2026-07-18): la Encargada abre con el buscador
// protagonista y acciones directas; el Líder abre con el pulso completo del negocio.
export default async function InicioPage() {
  const persona = await requirePersonaActual();
  const esLider = persona.rol === "lider";

  const [{ variantes, alertasReposicion }, cajaAbierta, panel] = await Promise.all([
    getCatalogoInteligente(persona),
    getCajaAbierta(persona.sedeId),
    getPanelLider(persona),
  ]);

  const reponerYa = variantes.filter((v) => v.reponerYa).length;
  const estancados = variantes.filter((v) => v.estancado).length;

  const accionesRapidas = [
    { href: "/vender", etiqueta: "Vender", detalle: cajaAbierta ? "Caja abierta" : "Caja cerrada — ábrela aquí" },
    { href: "/inventario/recibir", etiqueta: "Recibir mercadería", detalle: "Ingresar un fardo al almacén" },
    { href: "/inventario/almacen", etiqueta: "Bajar a tienda", detalle: "Del almacén al piso de venta" },
    { href: "/inventario", etiqueta: "Inventario", detalle: "Catálogo completo con stock" },
  ];

  // ==================== Inicio de Encargada ====================
  if (!esLider) {
    return (
      <div className="space-y-10">
        <BuscadorHero />

        <div>
          <p className="label-cayla mb-3 text-[10px] text-tinta/45">Acciones</p>
          <div className="grid grid-cols-2 gap-px border border-tinta/10 bg-tinta/10">
            {accionesRapidas.map((a) => (
              <Link key={a.href} href={a.href} className="group bg-crema p-5 transition-colors hover:bg-papel">
                <p className="text-sm font-medium text-tinta group-hover:text-rojo">{a.etiqueta}</p>
                <p className="mt-1 text-xs text-tinta/45">{a.detalle}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-tinta/60">
          <span>
            Caja de {persona.sedeCodigo}:{" "}
            <Link href="/vender" className={cajaAbierta ? "text-tinta hover:text-rojo" : "text-rojo hover:underline"}>
              {cajaAbierta ? `abierta (apertura ${money(cajaAbierta.montoApertura)})` : "cerrada"}
            </Link>
          </span>
          {reponerYa > 0 && (
            <Link href="/inventario" className="text-tinta hover:text-rojo">
              {reponerYa} prenda{reponerYa === 1 ? "" : "s"} por reponer
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ==================== Inicio de Líder: panel del día ====================
  return (
    <div className="space-y-10">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Hoy</p>
        <div className="mt-3 grid grid-cols-2 gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-4">
          <div className="bg-crema p-5">
            <p className="label-cayla text-[9px] text-tinta/45">Ventas de hoy</p>
            <p className="font-display mt-1 text-3xl text-tinta">{money(panel?.ventasHoyTotal ?? 0)}</p>
            {panel && panel.ventasHoyPorSede.length > 0 && (
              <p className="mt-1 text-xs text-tinta/45">
                {panel.ventasHoyPorSede.map((s) => `${s.codigo} ${money(s.monto)}`).join(" · ")}
              </p>
            )}
          </div>
          <div className="bg-crema p-5">
            <p className="label-cayla text-[9px] text-tinta/45">Cajas</p>
            <div className="mt-2 space-y-1">
              {(panel?.cajasTiendas ?? []).map((c) => (
                <p key={c.codigo} className="text-sm">
                  <span className="text-tinta/60">{c.codigo}</span>{" "}
                  {c.abierta ? <span className="text-tinta">abierta</span> : <span className="text-rojo">cerrada</span>}
                </p>
              ))}
            </div>
          </div>
          <div className="bg-crema p-5">
            <p className="label-cayla text-[9px] text-tinta/45">Reponer ya</p>
            <p className="font-display mt-1 text-3xl text-rojo">{reponerYa}</p>
            <p className="mt-1 text-xs text-tinta/45">{estancados} estancada{estancados === 1 ? "" : "s"}</p>
          </div>
          <div className="bg-crema p-5">
            <p className="label-cayla text-[9px] text-tinta/45">Inventario a costo</p>
            <p className="font-display mt-1 text-3xl text-tinta">{money(panel?.valorInventarioTotal ?? 0)}</p>
            <Link href="/comercial" className="mt-1 inline-block text-xs text-tinta/45 hover:text-rojo">
              Ver análisis →
            </Link>
          </div>
        </div>
      </div>

      {alertasReposicion.length > 0 && (
        <div className="border border-tinta/10 bg-papel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label-cayla text-[10px] text-rojo">Reponer pronto</h2>
            <Link href="/comercial" className="label-cayla text-[9px] text-tinta/40 hover:text-rojo">
              Sugerencias de compra →
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {alertasReposicion.slice(0, 5).map((v) => (
              <li key={v.varianteId}>
                <Link href={`/producto/${v.varianteId}`} className="text-tinta transition-colors hover:text-rojo">
                  {v.referencia} <span className="text-tinta/40">{[v.talla, v.color].filter(Boolean).join("/")}</span>{" "}
                  <span className="text-tinta/40">({v.stockTotal} vs. reorden {v.reorderPoint})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="label-cayla mb-3 text-[10px] text-tinta/45">Acciones</p>
        <div className="grid grid-cols-2 gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-4">
          {accionesRapidas.map((a) => (
            <Link key={a.href} href={a.href} className="group bg-crema p-5 transition-colors hover:bg-papel">
              <p className="text-sm font-medium text-tinta group-hover:text-rojo">{a.etiqueta}</p>
              <p className="mt-1 text-xs text-tinta/45">{a.detalle}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
