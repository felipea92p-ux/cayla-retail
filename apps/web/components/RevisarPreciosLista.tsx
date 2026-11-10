"use client";

// «Revisar precios» (Catálogo ▸ Productos, ADR-0641): las cuatro cifras —que filtran— y la tabla de prendas cuyo precio conviene mirar.
// La cuenta la hizo la base, sin IA. En cada fila, «Proponer» le pide a la IA un precio para ESA prenda (con su costo y sus parecidas) y
// «Cambiar» abre la hoja que lo aplica con el responsable: uno por uno, confirmando (Felipe 2026-11-10).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { RespuestaProponer } from "@/app/api/precio/proponer/route";
import { AplicarPrecioHoja } from "@/components/AplicarPrecioHoja";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/compras-reglas";
import { esMismoPrecio, textoMotivo, type CuentasPrecios, type FiltroPrecio, type PrendaARevisar } from "@/lib/revisar-precios-reglas";

const PLANTILLA = "sm:grid-cols-[minmax(0,2fr)_6.5rem_7.5rem_5rem_7rem_minmax(0,1.2fr)_8.5rem]";

type EstadoFila = { tipo: "pidiendo" } | { tipo: "error"; texto: string } | { tipo: "listo"; respuesta: RespuestaProponer };

export function RevisarPreciosCifras({ cuentas, filtro }: { cuentas: CuentasPrecios; filtro: FiltroPrecio | null }) {
  const router = useRouter();
  // Tocar la cifra puesta otra vez vuelve a «todas».
  const filtrar = (f: FiltroPrecio) => router.push(f === filtro ? "/productos/revisar-precios" : `/productos/revisar-precios?motivo=${f}`);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-guia="revisar-precios.cifras">
      <TarjetaCifra etiqueta="Pierden dinero" valor={cuentas.pierde} punto={cuentas.pierde > 0 ? "rojo" : undefined} onClick={() => filtrar("pierde_dinero")} activa={filtro === "pierde_dinero"}>
        El precio no cubre el costo
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Margen bajo" valor={cuentas.margen} punto={cuentas.margen > 0 ? "ambar" : undefined} onClick={() => filtrar("margen_bajo")} activa={filtro === "margen_bajo"}>
        Ganan menos de 30 %
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Lejos de su categoría" valor={cuentas.lejos} onClick={() => filtrar("lejos")} activa={filtro === "lejos"}>
        35 % más caras o más baratas que sus parecidas
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Sin costo propio" valor={cuentas.sinCosto} onClick={() => filtrar("sin_costo")} activa={filtro === "sin_costo"}>
        Su margen no se puede saber
      </TarjetaCifra>
    </div>
  );
}

export function RevisarPreciosTabla({ prendas }: { prendas: PrendaARevisar[] }) {
  const [filas, setFilas] = useState<Record<string, EstadoFila>>({});
  const [aplicando, setAplicando] = useState<string | null>(null);
  const poner = (id: string, e: EstadoFila) => setFilas((antes) => ({ ...antes, [id]: e }));

  const proponer = async (p: PrendaARevisar) => {
    poner(p.productoId, { tipo: "pidiendo" });
    try {
      const r = await fetch("/api/precio/proponer", {
        method: "POST",
        // Sin el loader de pantalla completa: la lista sigue a la vista y el botón dice «Calculando…».
        headers: { "content-type": "application/json", "x-espera": "no" },
        body: JSON.stringify({ origen: "revision", categoriaId: p.categoriaId, productoId: p.productoId, tejidoId: p.tejidoId }),
      });
      const datos = (await r.json().catch(() => null)) as (RespuestaProponer & { error?: string }) | null;
      if (!r.ok || !datos || datos.error) {
        poner(p.productoId, { tipo: "error", texto: datos?.error ?? "No se pudo calcular ahora. Prueba de nuevo en un momento." });
        return;
      }
      poner(p.productoId, { tipo: "listo", respuesta: datos });
    } catch {
      poner(p.productoId, { tipo: "error", texto: "Sin conexión: no se pudo calcular. Prueba de nuevo." });
    }
  };

  const prendaAplicando = aplicando ? prendas.find((p) => p.productoId === aplicando) : undefined;
  const estadoAplicando = aplicando ? filas[aplicando] : undefined;
  const propuestaAplicando = estadoAplicando?.tipo === "listo" && "propuesta" in estadoAplicando.respuesta ? estadoAplicando.respuesta.propuesta : null;

  return (
    <>
      <Tabla guia="revisar-precios.tabla">
        <Encabezado
          plantilla={PLANTILLA}
          columnas={[
            { titulo: "Prenda" },
            { titulo: "Precio", alinear: "der" },
            { titulo: "Costo", alinear: "der" },
            { titulo: "Margen", alinear: "der" },
            { titulo: "Medio de su categoría", alinear: "der", ayuda: "El precio del medio de las prendas de su categoría (la mitad cuesta más y la mitad menos)." },
            { titulo: "Por qué" },
            { titulo: "" },
          ]}
        />
        <div data-resultados>
          {prendas.map((p, i) => {
            const motivo = textoMotivo(p);
            const estado = filas[p.productoId];
            const propuesta = estado?.tipo === "listo" && "propuesta" in estado.respuesta ? estado.respuesta.propuesta : null;
            const igual = propuesta !== null && esMismoPrecio(p.precio, propuesta.precio);
            return (
              <div key={p.productoId}>
                <div className={fila(PLANTILLA)}>
                  <div className={celda("izq")}>
                    <p className="truncate text-[15px]">{p.referencia}</p>
                    <p className="texto-detalle truncate text-taupe">
                      {p.categoria} · {p.vendidas90 === 1 ? "1 vendida" : `${p.vendidas90} vendidas`} en 90 días · {p.stock} en stock
                    </p>
                  </div>
                  <div className={celda("der")}>
                    <span className="sm:hidden text-taupe">Precio </span>
                    {soles(p.precio)}
                  </div>
                  <div className={celda("der")}>
                    <span className="sm:hidden text-taupe">Costo </span>
                    {p.costo === null ? "—" : soles(p.costo)}
                    {p.costoEstimado && <span className="block text-xs text-taupe">estimado</span>}
                  </div>
                  <div className={celda("der")}>
                    <span className="sm:hidden text-taupe">Margen </span>
                    {p.margen === null ? "—" : `${Math.round(p.margen)} %`}
                  </div>
                  <div className={celda("der")}>
                    <span className="sm:hidden text-taupe">Medio de su categoría </span>
                    {p.medianaCategoria === null ? "—" : soles(p.medianaCategoria)}
                  </div>
                  <div className={celda("izq")}>
                    <Chip tono={motivo.tono} versalitas={false} title={motivo.frase}>
                      {motivo.texto}
                    </Chip>
                  </div>
                  <div className={celda("der", "overflow-visible")} data-guia={i === 0 ? "revisar-precios.proponer" : undefined}>
                    {!propuesta && (
                      <Boton type="button" peso="fantasma" className="btn-chico" onClick={() => void proponer(p)} cargando={estado?.tipo === "pidiendo"} textoCargando="Calculando…">
                        <span className="inline-flex items-center gap-1.5">
                          <Sparkles aria-hidden className="h-4 w-4" />
                          Proponer
                        </span>
                      </Boton>
                    )}
                  </div>
                </div>

                {estado?.tipo === "error" && (
                  <div className="px-5 pb-3">
                    <Aviso tono="error" chico>
                      {estado.texto}
                    </Aviso>
                  </div>
                )}
                {estado?.tipo === "listo" && "sinPropuesta" in estado.respuesta && (
                  <div className="px-5 pb-3">
                    <Aviso tono="atencion" chico>
                      {estado.respuesta.sinPropuesta.texto}
                    </Aviso>
                  </div>
                )}
                {propuesta && (
                  <div className="px-5 pb-4">
                    <div className="nota-cayla sin-i space-y-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="text-sm text-taupe">{igual ? "Déjalo en" : "Te propongo"}</p>
                        <p className="font-display text-[1.5rem] leading-none tabular-nums">{soles(propuesta.precio)}</p>
                        <p className="text-sm tabular-nums text-taupe">margen {Math.round(propuesta.margen)} %</p>
                        {propuesta.costoEstimado && (
                          <Chip tono="ambar" title={`Esta prenda no tiene costo: se usó el promedio de su categoría (${soles(propuesta.costo)}).`}>
                            Costo estimado
                          </Chip>
                        )}
                      </div>
                      <p className="text-sm">{propuesta.razon}</p>
                      {propuesta.subidoAlPiso && <p className="text-sm text-taupe">Lo subí a {soles(propuesta.piso)}: es lo mínimo para no ganar menos de 30 % con este costo.</p>}
                      {propuesta.parecidas.length > 0 && (
                        <p className="text-sm text-taupe">Parecidas: {propuesta.parecidas.map((x) => `${x.referencia} (${soles(x.precio)})`).join(" · ")}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {!igual && propuesta.id && (
                          <Boton type="button" peso="fantasma" onClick={() => setAplicando(p.productoId)}>
                            Cambiar a {soles(propuesta.precio)}
                          </Boton>
                        )}
                        <button type="button" className="btn-cayla btn-enlace" onClick={() => void proponer(p)}>
                          Proponer otro
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Tabla>
      {prendaAplicando && propuestaAplicando?.id && (
        <AplicarPrecioHoja
          prenda={prendaAplicando}
          propuesta={{ id: propuestaAplicando.id, precio: propuestaAplicando.precio, margen: propuestaAplicando.margen, costoEstimado: propuestaAplicando.costoEstimado }}
          onClose={() => setAplicando(null)}
        />
      )}
    </>
  );
}
