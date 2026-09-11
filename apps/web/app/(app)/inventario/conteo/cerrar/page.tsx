import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getConteoAbierto, getVarianza } from "@/lib/conteo";
import { InventarioNav } from "@/components/InventarioNav";
import { EsqueletoTabla } from "@/components/Esqueleto";
import { Ayuda } from "@/components/Ayuda";
import { CerrarConteoPanel } from "@/components/CerrarConteoPanel";

/**
 * Revisar y cerrar un conteo — la aprobación.
 *
 * Es una pantalla aparte de `/inventario/conteo` y no una sección más de aquella, porque
 * son dos trabajos distintos con dos personas distintas: contar lo hace la Encargada con
 * la pistola en la mano y dura una tarde; aprobar lo hace la Líder una sola vez, mirando
 * la cifra. Navegar acá es además lo que garantiza que la varianza esté fresca — un
 * conteo que sigue creciendo mientras alguien mira un resumen viejo es la peor forma de
 * decidir.
 */
export default async function CerrarConteoPage() {
  const persona = await requirePersonaActual();
  // El candado de verdad está en la RPC (`fn_es_lider()`); esto solo evita ofrecer una
  // pantalla que la base va a rechazar. Una pantalla no es un permiso (ADR-0016).
  if (persona.rol !== "lider") redirect("/inventario/conteo");

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Revisar y cerrar
          <Ayuda titulo="Cerrar un conteo">
            Cerrar es aprobar: el inventario deja de decir lo que creía y pasa a decir lo que se
            contó. Cada corrección queda como un movimiento con su motivo, así que el historial de
            la prenda explica de dónde salió. Solo se ajusta lo que se contó — lo que nadie tocó
            queda como estaba, así que un conteo a medias no borra nada.
          </Ayuda>
        </h1>
      </div>

      <InventarioNav />

      <Suspense fallback={<EsqueletoTabla filas={6} />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

const money = (n: number) => `S/${Math.abs(n).toFixed(2)}`;

async function Contenido() {
  const persona = await requirePersonaActual(); // memorizado por request
  const conteo = await getConteoAbierto(persona);

  if (!conteo) {
    return (
      <p className="card-cayla px-4 py-8 text-center text-sm text-tinta/70">
        No hay ningún conteo abierto en {persona.sedeCodigo}.{" "}
        <Link href="/inventario/conteo" className="text-rojo hover:underline">
          Abre uno para empezar a contar.
        </Link>
      </p>
    );
  }

  const v = await getVarianza(conteo.id);
  const conDiferencia = v.lineas.filter((l) => l.diferencia !== 0);
  const sinContar = conDiferencia.filter((l) => l.origen === "no_contado");

  return (
    <div className="space-y-6">
      {/* ---------- la cifra que decide ---------- */}
      <div className="card-cayla p-5">
        <p className="label-cayla text-[11px] text-tinta/65">Diferencia al costo</p>
        <p className={`font-display mt-1 text-3xl ${v.solesNeto < 0 ? "text-rojo" : "text-tinta"}`}>
          {v.solesNeto < 0 ? "−" : ""}
          {money(v.solesNeto)}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-tinta/75">
          <span>
            De más: <strong className="text-tinta">{v.unidadesSobrantes}</strong> unidades ·{" "}
            {money(v.solesSobrantes)}
          </span>
          <span>
            De menos: <strong className="text-tinta">{v.unidadesFaltantes}</strong> unidades ·{" "}
            {money(v.solesFaltantes)}
          </span>
        </div>
        {v.lineasSinCosto > 0 && (
          <p className="mt-3 text-xs text-ambar-profundo">
            {v.lineasSinCosto} {v.lineasSinCosto === 1 ? "prenda no tiene" : "prendas no tienen"} costo cargado, así
            que su diferencia no está sumada acá. La cifra real es mayor que esta, no menor.
          </p>
        )}
      </div>

      {/* ---------- lo que nadie contó ----------
          Solo aparece en conteos abiertos con `tratar_no_contado = 'poner_en_cero'`, y HOY
          ninguna pantalla los abre así: `abrir_conteo` deja el default `'ignorar'`. O sea que
          en la práctica este bloque no se ve. Se deja porque la RPC soporta el modo y el día
          que se ofrezca —un censo de verdad, donde no aparecer SÍ significa que no hay— este
          es el aviso que no puede faltar. */}
      {sinContar.length > 0 && (
        <div className="card-cayla border-ambar/50 p-5">
          <p className="label-cayla text-[11px] text-ambar-profundo">
            {sinContar.length} {sinContar.length === 1 ? "prenda" : "prendas"} que nadie contó
          </p>
          <p className="mt-1.5 text-sm text-tinta/75">
            El sistema cree que están en el piso y no aparecieron en el conteo, así que al cerrar
            quedan en cero. Si el conteo no terminó, esto no se cierra todavía.
          </p>
        </div>
      )}

      <CerrarConteoPanel
        conteoId={conteo.id}
        sedeCodigo={persona.sedeCodigo}
        solesNeto={v.solesNeto}
        lineasConDiferencia={conDiferencia.length}
      />

      {/* ---------- el detalle, para revisar antes de aprobar ---------- */}
      <div>
        <h2 className="label-cayla mb-3 text-[11px] text-tinta/65">
          Diferencias · {conDiferencia.length} de {v.lineas.length} revisadas
        </h2>
        {conDiferencia.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Todo cuadra: lo contado es exactamente lo que el sistema decía.
          </p>
        ) : (
          <div className="scroll-cayla overflow-x-auto card-cayla">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="label-cayla border-b border-tinta/15 text-[11px] text-tinta/65">
                <tr>
                  <th className="px-4 py-2.5">Prenda</th>
                  <th className="px-4 py-2.5 text-right">Contadas</th>
                  <th className="px-4 py-2.5 text-right">Sistema</th>
                  <th className="px-4 py-2.5 text-right">Diferencia</th>
                  <th className="px-4 py-2.5 text-right">Al costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/10">
                {conDiferencia.map((l) => (
                  <tr key={l.varianteId}>
                    <td className="px-4 py-2.5">
                      <span className="text-tinta">{l.referencia}</span>{" "}
                      <span className="text-tinta/65">{[l.talla, l.color].filter(Boolean).join("/")}</span>
                      {l.origen === "no_contado" && (
                        <span className="ml-2 text-xs text-ambar-profundo">nadie la contó</span>
                      )}
                      {l.codigo && <p className="font-mono text-xs text-tinta/65">{l.codigo}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-tinta/75">{l.contada}</td>
                    <td className="px-4 py-2.5 text-right text-tinta/75">{l.sistema}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        l.diferencia < 0 ? "text-rojo" : "text-verde-profundo"
                      }`}
                    >
                      {l.diferencia > 0 ? "+" : ""}
                      {l.diferencia}
                    </td>
                    <td className="px-4 py-2.5 text-right text-tinta/75">
                      {l.sinCosto ? <span className="text-xs text-ambar-profundo">sin costo</span> : money(l.soles)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
