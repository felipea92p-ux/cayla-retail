"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { debeEncolarse, traducirError } from "@/lib/error-escritura";
import { leerCostosAtipicos, type CostoAtipico } from "@/lib/costo-atipico-reglas";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { avisar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto, botonPrimario } from "@/components/ui/Modal";
import { CampoSelect, Desplegable } from "@/components/ui/campos";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { nuevaOperacion } from "@/lib/cola-offline";
import { useColaRecibir } from "@/lib/useColaRecibir";

// Fase UI 1 (2026-09-11): pantalla nueva sobre la RPC `recibir_lote` de V2
// (`supabase/migrations/0003_funciones.sql:179`). No es una adaptación de
// `RecibirLoteForm.tsx` (V1) — ese componente depende de `contenedores`,
// `ordenes_compra` y `producciones_pendientes`, ninguno con equivalente V2
// todavía. Mismo patrón de escritura que `RegistrarVentaModal.tsx`: RPC
// directa desde el cliente + `traducirError()`, sin backend propio.
//
// Costo atípico (20260930122000, Felipe 2026-09-30): el costo de una línea es opcional y lo teclea quien recibe. Si alguno sale
// fuera de lo normal, la base NO recibe nada y contesta `costo_atipico` con TODAS las líneas raras. Al líder se le muestra
// aquí, en línea, con dos salidas (corregir los costos o confirmarlos), y confirmar reenvía el MISMO intento (mismo token: el
// rechazo no guardó nada) con `p_confirma_costo_atipico`. A quien no es líder la base le dice, sin cifras, que un líder debe
// confirmarlo; su salida es recibir esa línea sin costo. La regla vive en la base; esta pantalla no la repite.
type Variante = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null };
type Proveedor = { id: string; nombre: string };

type Linea = { varianteId: string; cantidad: number; costoUnitario: string };

export function RecepcionFormV2({
  ubicacionId,
  ubicacionEtiqueta,
  variantes,
  proveedores,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  variantes: Variante[];
  proveedores: Proveedor[];
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ varianteId: variantes[0]?.varianteId ?? "", cantidad: 1, costoUnitario: "" }]);
  const [loading, setLoading] = useState(false);
  // Las líneas cuyo costo la base marcó como atípico (solo las ve el líder); mientras haya algo, la pregunta está abierta.
  const [atipicos, setAtipicos] = useState<CostoAtipico[] | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  // `sinConexion`: el lote quedó guardado en este navegador y sube solo al volver la red (ADR-0210).
  const [ok, setOk] = useState<{ unidades: number; loteId: string | null; sinConexion?: boolean } | null>(null);
  const colaOffline = useColaRecibir();
  // Quién recibe (ADR-0161/0162): `recibir_lote` firma con esa persona, en la tienda que recibe.
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta });
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de sumar el lote dos veces. Se renueva solo al guardar bien.
  // «Me olvidé una línea» sigue siendo un lote NUEVO: después de guardar, el token cambia.
  const token = useRef<string>(crypto.randomUUID());

  function agregarLinea() {
    setAtipicos(null);
    setLineas((actual) => [...actual, { varianteId: variantes[0]?.varianteId ?? "", cantidad: 1, costoUnitario: "" }]);
  }

  function quitarLinea(i: number) {
    setAtipicos(null);
    setLineas((actual) => actual.filter((_, n) => n !== i));
  }

  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    // Cambiar cualquier línea borra la pregunta: lo que se le mostró ya no es lo que se va a recibir.
    setAtipicos(null);
    setLineas((actual) => actual.map((l, n) => (n === i ? { ...l, ...cambio } : l)));
  }

  // La primera línea con costo cuya prenda la base marcó como atípica (o, sin saber cuál, la primera con costo).
  function lineaDelCostoAtipico(marcadas: CostoAtipico[] | null): number {
    const conCosto = lineas.map((l, i) => ({ l, i })).filter(({ l }) => l.costoUnitario);
    const marcada = marcadas ? conCosto.find(({ l }) => marcadas.some((a) => a.varianteId === l.varianteId)) : undefined;
    return (marcada ?? conCosto[0])?.i ?? 0;
  }

  function corregirCostos() {
    const i = lineaDelCostoAtipico(atipicos);
    setAtipicos(null);
    formulario.current?.querySelector<HTMLInputElement>(`[data-campo="recepcion-costo-${i}"]`)?.focus();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await enviar(false);
  }

  async function enviar(confirmaCostoAtipico: boolean) {
    const validas = lineas.filter((l) => l.varianteId && l.cantidad > 0);
    if (validas.length === 0) {
      avisar.error("Agrega al menos una línea con una prenda y una cantidad mayor que cero.", { enfocar: "recepcion-linea-0" });
      return;
    }
    if (!proveedorId) {
      avisar.error("Elige un proveedor.", { enfocar: "recepcion-proveedor" });
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const params = {
      p_ubicacion_id: ubicacionId,
      p_proveedor_id: proveedorId,
      p_items: validas.map((l) => ({
        variante_id: l.varianteId,
        cantidad: l.cantidad,
        ...(l.costoUnitario ? { costo_unitario: Number(l.costoUnitario) } : {}),
      })),
      p_numero_guia: numeroGuia || undefined,
      p_token: token.current,
      // Solo en el reintento tras `costo_atipico`: el primer intento no manda el parámetro, así la pantalla nueva funciona
      // igual contra una base que todavía no lo conoce.
      ...(confirmaCostoAtipico ? { p_confirma_costo_atipico: true } : {}),
    };
    const firma = responsable.firma();
    const { data: loteId, error, status } = await firmar(supabase.rpc("recibir_lote", params), firma);

    setLoading(false);
    const unidades = validas.reduce((acc, l) => acc + l.cantidad, 0);
    // Sin red (ADR-0210): el lote no se pierde. Entra a la cola con su token y la hora de ahora, y sube solo.
    if (error && debeEncolarse(error, status)) {
      const proveedor = proveedores.find((p) => p.id === proveedorId)?.nombre ?? "proveedor";
      const op = nuevaOperacion({
        token: token.current,
        rpc: "recibir_lote",
        params,
        firma,
        resumen: `Lote de ${unidades} ${unidades === 1 ? "unidad" : "unidades"} · ${proveedor} · ${ubicacionEtiqueta}`,
      });
      if (!colaOffline.encolar(op)) {
        avisar.error("Se cortó el internet y este navegador no pudo guardar el lote. Anota lo recibido y regístralo cuando vuelva la conexión.");
        return;
      }
      token.current = crypto.randomUUID();
      avisar.aviso("Lote guardado sin conexión", { detalle: "Sube solo cuando vuelva el internet." });
      setOk({ unidades, loteId: null, sinConexion: true });
      return;
    }
    responsable.despues(error);
    if (error) {
      const marcadas = leerCostosAtipicos(error);
      if (marcadas) {
        setAtipicos(marcadas);
        return;
      }
      if (error.message === "costo_atipico_sin_lider") {
        avisar.error(
          "El costo que escribiste está fuera de lo normal y solo un líder puede confirmarlo. Bórralo (el costo es opcional) y recibe el lote sin costo, o pídele a un líder que lo confirme.",
          { enfocar: `recepcion-linea-${lineaDelCostoAtipico(null)}` },
        );
        return;
      }
      avisar.error(traducirError(error, "recibir el lote"));
      return;
    }
    setAtipicos(null);
    token.current = crypto.randomUUID();
    avisar.exito(`Lote recibido · ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`, { detalle: "Ya suman al stock." });
    setOk({ unidades, loteId: loteId ?? null });
    router.refresh();
  }

  if (ok) {
    return (
      <div className="space-y-3 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">{ok.sinConexion ? "Lote guardado sin conexión" : "Lote recibido"}</p>
        <p className="font-display text-3xl text-tinta">{ok.unidades} unidades</p>
        <p className="text-sm text-tinta/70">
          {ok.sinConexion
            ? `Sumarán al stock de ${ubicacionEtiqueta} cuando vuelva el internet. Las etiquetas de precio se imprimen después, desde el lote.`
            : `Ya suman al stock de ${ubicacionEtiqueta}.`}
        </p>
        {ok.loteId && (
          <Link href={urlEtiquetasDePrecio({ lotes: [ok.loteId] })} className="btn-cayla btn-primario w-full">
            Imprimir {ok.unidades === 1 ? "la etiqueta" : `${ok.unidades} etiquetas`} de precio
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            setOk(null);
            setLineas([{ varianteId: variantes[0]?.varianteId ?? "", cantidad: 1, costoUnitario: "" }]);
            setNumeroGuia("");
          }}
          // Un solo primario por pantalla (ADR-0169): el siguiente paso es etiquetar; recibir otro va en secundario.
          className={ok.loteId ? "btn-cayla btn-secundario w-full" : `${botonPrimario} w-full`}
        >
          Recibir otro lote
        </button>
      </div>
    );
  }

  return (
    <form ref={formulario} onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSelect
          etiqueta="Proveedor"
          valor={proveedorId}
          onValor={(v) => setProveedorId(v)}
          opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))}
        />
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="recepcion-guia">
            Número de guía (opcional)
          </label>
          <input
            id="recepcion-guia"
            value={numeroGuia}
            onChange={(e) => setNumeroGuia(e.target.value)}
            className={campoTexto}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className={campoEtiqueta}>Prendas recibidas</p>
        {lineas.map((l, i) => (
          <div key={i} id={`recepcion-linea-${i}`} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <Desplegable
                etiquetaAccesible="Prenda"
                valor={l.varianteId}
                onValor={(v) => actualizarLinea(i, { varianteId: v })}
                opciones={variantes.map((v) => ({
                  valor: v.varianteId,
                  texto: `${v.referencia} · ${v.sku} ${[v.talla, v.color].filter(Boolean).join("/")}`,
                }))}
              />
            </div>
            <input
              type="number"
              min={1}
              aria-label="Cantidad"
              value={l.cantidad}
              onChange={(e) => actualizarLinea(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20 border-b border-tinta/20 bg-transparent px-1 py-2 text-center text-sm text-tinta outline-none focus:border-rojo"
            />
            <input
              type="number"
              min={0}
              step="0.10"
              placeholder="Costo (opc.)"
              aria-label="Costo unitario"
              data-campo={`recepcion-costo-${i}`}
              value={l.costoUnitario}
              onChange={(e) => {
                const v = e.target.value;
                // Vacío se deja pasar (el costo es opcional); un número
                // negativo se recorta a 0 en vez de dejarlo viajar hasta el
                // `check (costo >= 0)` de la base.
                actualizarLinea(i, { costoUnitario: v === "" ? "" : String(Math.max(0, Number(v) || 0)) });
              }}
              className="w-28 border-b border-tinta/20 bg-transparent px-1 py-2 text-right text-sm text-tinta outline-none placeholder:text-tinta/40 focus:border-rojo"
            />
            {lineas.length > 1 && (
              <button type="button" onClick={() => quitarLinea(i)} className="text-xs text-rojo">
                Quitar
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarLinea} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Agregar línea
        </button>
      </div>


      <ComboResponsable control={responsable} deshabilitado={loading} />
      {atipicos ? (
        <AvisoCostoAtipico
          costos={atipicos}
          pie="Revisa los costos que escribiste. Si son correctos, confírmalos: entran al costo de esas prendas en todas las sedes."
          textoCorregir="Corregir los costos"
          textoConfirmar="Sí, son correctos — recibir con estos costos"
          cargando={loading}
          listo={responsable.listo}
          motivoNoListo={responsable.motivo}
          onCorregir={corregirCostos}
          onConfirmar={() => enviar(true)}
        />
      ) : (
        <button type="submit" disabled={loading} className={botonPrimario}>
          {loading ? "Registrando…" : `Recibir en ${ubicacionEtiqueta}`}
        </button>
      )}
    </form>
  );
}
