"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchX, Tag } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Encabezado, Tabla, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { avisar } from "@/components/ui/Avisos";
import { IconoCategoria } from "@/components/IconoCategoria";
import { EtiquetarPiezaModal, type CategoriaLiquidacion } from "@/components/liquidacion/EtiquetarPiezaModal";
import { PiezaLiquidacionModal } from "@/components/liquidacion/PiezaLiquidacionModal";
import { PrecioMinimoLiquidacion } from "@/components/liquidacion/PrecioMinimoLiquidacion";
import { createClient } from "@/lib/supabase/client";
import { normalizarBusqueda } from "@/lib/combo-reglas";
import {
  cifrasDe,
  codigoDeLiquidacion,
  diasALaVenta,
  tiempoALaVenta,
  fechaLima,
  filtrar,
  piezaLeidaDeJson,
  soles,
  type Filtro,
  type PiezaLiquidacion,
} from "@/lib/liquidacion-reglas";

// El código se esconde bajo 1024 px: angosto, la pieza (su categoría) es lo que tiene que leerse entero.
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_7rem] lg:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_5.5rem_7rem]";
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "disponibles", texto: "A la venta" },
  { valor: "vendidas", texto: "Vendidas" },
  { valor: "retiradas", texto: "Retiradas" },
];

type Abierta = { pieza: PiezaLiquidacion; codigoViejo: string | null };

/**
 * Catálogo ▸ Liquidación (ADR-0371): las prendas sueltas que la sede liquida sin registrarlas en el catálogo. Arriba, lo que hay a
 * la venta y lo cobrado este mes; abajo, la lista con su buscador, que también lee una etiqueta con la pistola y abre esa pieza
 * (incluida una etiqueta vieja: dice cuál es la que vale). «Etiquetar una pieza» es la acción de la pantalla.
 */
export function LiquidacionPantalla({
  piezas: iniciales,
  categorias,
  minimo,
  esLider,
  ubicacionId,
  hoy,
  impreso,
}: {
  piezas: PiezaLiquidacion[];
  categorias: CategoriaLiquidacion[];
  minimo: number;
  esLider: boolean;
  ubicacionId: string;
  hoy: string;
  impreso: string;
}) {
  const router = useRouter();
  const [piezas, setPiezas] = useState(iniciales);
  // Lo que trae el servidor al refrescar manda (sin un efecto: se ajusta al dibujar, como pide React).
  const [deServidor, setDeServidor] = useState(iniciales);
  if (deServidor !== iniciales) {
    setDeServidor(iniciales);
    setPiezas(iniciales);
  }
  const [filtro, setFiltro] = useState<Filtro>("disponibles");
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [etiquetando, setEtiquetando] = useState(false);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const ultimoLeido = useRef<string | null>(null);

  const cifras = cifrasDe(piezas, hoy);
  const conteos = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.valor, filtrar(piezas, f.valor).length])) as Record<Filtro, number>, [piezas]);
  const q = normalizarBusqueda(texto.trim());
  const visibles = filtrar(piezas, filtro).filter((p) => !q || normalizarBusqueda(`${p.categoria} ${p.codigo ?? ""} ${soles(p.precio)}`).includes(q));

  const actualizar = (nueva: PiezaLiquidacion) => {
    setPiezas((ps) => (ps.some((p) => p.id === nueva.id) ? ps.map((p) => (p.id === nueva.id ? nueva : p)) : [nueva, ...ps]));
    router.refresh();
  };

  // La pistola escribe el código entero de golpe: un código completo abre su pieza sin esperar un Enter.
  function leer(codigo: string) {
    if (ultimoLeido.current === codigo) return;
    ultimoLeido.current = codigo;
    const enLista = piezas.find((p) => p.codigo === codigo);
    if (enLista) {
      setAbierta({ pieza: enLista, codigoViejo: null });
      setTexto("");
      return;
    }
    setBuscando(true);
    void createClient()
      .rpc("fn_pieza_liquidacion", { p_codigo: codigo })
      .then(({ data, error }) => {
        setBuscando(false);
        const leida = error ? null : piezaLeidaDeJson(data);
        if (!leida) {
          avisar.error("No encontramos esa etiqueta", { detalle: `${codigo} no es de ninguna pieza de liquidación.` });
          return;
        }
        if (leida.tipo === "otra_sede") {
          avisar.error("Esa pieza es de otra tienda", { detalle: `La etiqueta ${codigo} es de ${leida.ubicacion}.` });
          return;
        }
        setAbierta({ pieza: leida.pieza, codigoViejo: leida.vigente ? null : leida.codigoLeido });
        setTexto("");
      });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra
          punto="verde"
          etiqueta="A la venta"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.disponibles} alMontar />}
          activa={filtro === "disponibles"}
          onClick={() => setFiltro("disponibles")}
        >
          {cifras.disponibles === 0 ? "ninguna pieza todavía" : `S/ ${soles(cifras.valorDisponible)} si se venden todas`}
        </TarjetaCifra>
        <TarjetaCifra
          punto="neutro"
          etiqueta="Vendidas este mes"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.vendidasMes} alMontar />}
          activa={filtro === "vendidas"}
          onClick={() => setFiltro("vendidas")}
        >
          {cifras.vendidasMes === 0 ? "nada cobrado este mes" : `S/ ${soles(cifras.cobradoMes)} cobrados`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.rebajadas > 0 ? "ambar" : "neutro"}
          etiqueta="Rebajadas"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={<CifraQueCuenta valor={cifras.rebajadas} alMontar />}
        >
          {cifras.rebajadas === 0 ? "ninguna bajó de precio" : "a la venta con una etiqueta nueva"}
        </TarjetaCifra>
      </div>

      <section className="card-cayla space-y-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
          <div className="min-w-[14rem] flex-1">
            <Buscador
              valor={texto}
              onCambio={(v) => {
                setTexto(v);
                const codigo = codigoDeLiquidacion(v);
                if (codigo) leer(codigo);
                else ultimoLeido.current = null;
              }}
              buscando={buscando}
              icono="barras"
              atajo
              placeholder="Escanea una etiqueta o busca por categoría o código"
              conteo={q ? `${visibles.length} ${visibles.length === 1 ? "coincide" : "coinciden"}` : undefined}
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Qué piezas ver">
            {FILTROS.map((f) => (
              <button key={f.valor} type="button" className="pildora-cayla" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
                {f.texto} · {conteos[f.valor]}
              </button>
            ))}
          </div>
          <Boton type="button" peso="primario" onClick={() => setEtiquetando(true)}>
            + Etiquetar una pieza
          </Boton>
        </div>

        {visibles.length === 0 ? (
          q ? (
            <Vacio icono={<SearchX />} titulo={`Nada coincide con «${texto.trim()}»`} acciones={<Boton onClick={() => setTexto("")}>Borrar la búsqueda</Boton>}>
              Busca por categoría, código o precio, o escanea la etiqueta.
            </Vacio>
          ) : filtro === "disponibles" ? (
            <Vacio
              icono={<Tag />}
              titulo="No hay piezas a la venta"
              acciones={
                <Boton peso="primario" onClick={() => setEtiquetando(true)}>
                  + Etiquetar una pieza
                </Boton>
              }
            >
              Etiqueta cada prenda suelta que vas a liquidar: solo su categoría y su precio. La caja la cobra escaneando la etiqueta.
            </Vacio>
          ) : (
            <Vacio icono={<Tag />} tamano="chico">
              {filtro === "vendidas" ? "Ninguna pieza vendida en los últimos 120 días." : "Ninguna pieza retirada en los últimos 120 días."}
            </Vacio>
          )
        ) : (
          <Tabla className="rounded-none border-0 shadow-none">
            <Encabezado
              plantilla={PLANTILLA}
              columnas={[
                { titulo: "Pieza" },
                { titulo: "Código", desdeLg: true },
                { titulo: "Precio", alinear: "der" },
                { titulo: filtro === "disponibles" ? "A la venta" : filtro === "vendidas" ? "Vendida" : "Retirada" },
                { titulo: "Estado", alinear: "der" },
              ]}
            />
            {visibles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setAbierta({ pieza: p, codigoViejo: null })}
                className={`${fila(PLANTILLA)} w-full text-left`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sand text-taupe-profundo">
                    <IconoCategoria prefijo={p.prefijo} familia={null} className="h-5 w-5" />
                  </span>
                  <span className="truncate font-medium text-tinta">{p.categoria}</span>
                </span>
                <span className="hidden font-mono text-[13px] text-taupe lg:block">{p.codigo ?? "—"}</span>
                <span className="text-right tabular-nums text-tinta">
                  {p.precioInicial > p.precio && <span className="liq-tachado mr-2 text-[12px]">{soles(p.precioInicial)}</span>}
                  S/ {soles(p.precio)}
                </span>
                <span className="text-[13px] text-taupe">
                  {p.estado === "disponible"
                    ? tiempoALaVenta(diasALaVenta(p, hoy))
                    : (fechaLima(p.estado === "vendida" ? p.vendidaEn : p.retiradaEn) ?? "—")}
                </span>
                <span className="text-right">
                  <Chip tono={p.estado === "disponible" ? (p.etiquetas > 1 ? "ambar" : "verde") : p.estado === "vendida" ? "pizarra" : "apagado"}>
                    {p.estado === "disponible" ? (p.etiquetas > 1 ? "Rebajada" : "A la venta") : p.estado === "vendida" ? "Vendida" : "Retirada"}
                  </Chip>
                </span>
              </button>
            ))}
          </Tabla>
        )}
      </section>

      <div className="nota-cayla space-y-2 text-[13px]">
        <p>
          Una pieza de liquidación <b>no entra al catálogo ni al stock</b>: la caja la cobra escaneando su etiqueta, al precio que dice, sin
          descuentos. Es venta final. Para bajarle el precio, ábrela y sale una etiqueta nueva; la vieja deja de valer en la caja.
        </p>
        <PrecioMinimoLiquidacion minimo={minimo} esLider={esLider} />
      </div>

      {etiquetando && (
        <EtiquetarPiezaModal
          ubicacionId={ubicacionId}
          categorias={categorias}
          minimo={minimo}
          esLider={esLider}
          impreso={impreso}
          onClose={() => setEtiquetando(false)}
          onEtiquetada={actualizar}
        />
      )}
      {abierta && (
        <PiezaLiquidacionModal
          key={abierta.pieza.id}
          pieza={abierta.pieza}
          codigoViejo={abierta.codigoViejo}
          minimo={minimo}
          esLider={esLider}
          impreso={impreso}
          hoy={hoy}
          onClose={() => setAbierta(null)}
          onCambio={actualizar}
        />
      )}
    </div>
  );
}
