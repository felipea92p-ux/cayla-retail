"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { CampoSelect } from "@/components/ui/campos";
import { CampoFin, SelectFin } from "@/components/finanzas/kit";
import {
  ayudaCuenta,
  cuentasDeLaClase,
  hayCuentasPara,
  leerCuentaElegible,
  opcionesDeCuenta,
  usable,
  type ClaseMovimiento,
  type CuentaElegible,
} from "@/lib/cuenta-sellada-reglas";

// La cuenta sellada (ADR-0195 F3b): las piezas que comparten los combos «Sale de», «Entra a», «Salió de» y «¿A qué
// banco?» de Compras, Por pagar, Producción, Gastos, Devoluciones, Apartados, notas de crédito y el cierre de caja.
// Las opciones salen de `opcionesDeCuenta` (agrupadas, con el cajón cerrado a la vista pero bloqueado) y van al combo del
// sistema (ADR-0209): `CampoSelect` en el resto del ERP, `SelectFin` en Finanzas, o un `Desplegable` en caja donde la
// pantalla lo pide. Qué cuenta va lo decide `cuentaEfectiva` (lib/cuenta-sellada-reglas.ts), sin efectos.

/** Cuentas fijas en lugar de pedirlas a la base: solo para dibujar los combos sin sesión (rutas de prueba visual). */
export const CuentasDePrueba = createContext<Partial<Record<ClaseMovimiento, CuentaElegible[]>> | null>(null);

/** Las cuentas que esta cuenta puede elegir, con la propuesta de cada medio para esa tienda. La lectura es `fn_`: el
 *  loader general no bloquea la pantalla mientras llega. Sin permiso o sin cuentas, lista vacía (el combo lo dice). */
export function useCuentasParaElegir(clase: ClaseMovimiento, ubicacionId: string | null | undefined, activo = true) {
  const clave = `${clase}|${ubicacionId ?? ""}`;
  const fijas = useContext(CuentasDePrueba)?.[clase] ?? null;
  const [estado, setEstado] = useState<{ clave: string; cuentas: CuentaElegible[] }>({ clave: "", cuentas: [] });
  useEffect(() => {
    if (!activo || fijas) return;
    let vivo = true;
    void createClient()
      .rpc("fn_cuentas_para_elegir" as never, { p_clase: clase, p_ubicacion_id: ubicacionId || null } as never)
      .then(({ data, error }) => {
        if (!vivo) return;
        setEstado({ clave, cuentas: error ? [] : ((data ?? []) as Record<string, unknown>[]).map(leerCuentaElegible) });
      });
    return () => {
      vivo = false;
    };
  }, [clase, ubicacionId, activo, clave, fijas]);
  if (fijas) return { cuentas: fijas, listo: true };
  return { cuentas: estado.cuentas, listo: estado.clave === clave };
}

const SIN_CUENTAS = "Sin cuentas para este medio: se agregan en Configuración ▸ Cuentas y cobros";

type PropsCampo = {
  cuentas: readonly CuentaElegible[];
  listo: boolean;
  clase: ClaseMovimiento;
  medio: string;
  /** La cuenta que va (`cuentaEfectiva`): la elegida o la propuesta. */
  valor: string | null;
  onValor: (id: string) => void;
  etiqueta?: ReactNode;
  sentido?: "sale" | "entra";
  id?: string;
  deshabilitado?: boolean;
};

/** Lo que dice el combo sin cuenta elegida: buscando, o por qué está bloqueado. Con cuentas, el «Elegir» de siempre. */
function marcadorDe(listo: boolean, hay: boolean) {
  if (!listo) return "…";
  return hay ? undefined : SIN_CUENTAS;
}

function ayudaDe({ cuentas, listo, valor, sentido = "sale" }: PropsCampo, hay: boolean) {
  if (!listo) return "Buscando las cuentas…";
  if (!hay) return "Queda «sin cuenta» hasta que el líder la agregue; se registra igual.";
  return ayudaCuenta(cuentas.find((c) => c.id === valor) ?? null, sentido);
}

/** «Sale de» con el campo del resto del ERP (Compras, Producción, Devoluciones, Apartados, notas de crédito, Caja). */
export function CampoSaleDe(props: PropsCampo) {
  const { cuentas, listo, clase, medio, valor, onValor, etiqueta = "Sale de", id, deshabilitado } = props;
  const hay = listo && hayCuentasPara(cuentas, clase, medio);
  // Sin cuentas para ese medio, el combo queda bloqueado y su marcador dice por qué (antes era una opción de mentira).
  return (
    <CampoSelect
      etiqueta={etiqueta}
      id={id}
      valor={hay ? (valor ?? "") : ""}
      onValor={onValor}
      opciones={hay ? opcionesDeCuenta(cuentas, clase, medio) : []}
      marcador={marcadorDe(listo, hay)}
      deshabilitado={deshabilitado || !hay}
      pie={ayudaDe(props, hay)}
    />
  );
}

/** El mismo combo con las piezas de Finanzas (`CampoFin` + `SelectFin`), para Gastos y Cuentas y dinero. */
export function CampoCuentaFin(props: PropsCampo & { sinMedio?: boolean; className?: string }) {
  const { cuentas, listo, clase, medio, valor, onValor, etiqueta = "Salió de", id, deshabilitado, sinMedio, className } = props;
  const hay = listo && (sinMedio ? cuentasDeLaClase(cuentas, clase).some(usable) : hayCuentasPara(cuentas, clase, medio));
  return (
    <CampoFin etiqueta={etiqueta} htmlFor={id} ayuda={ayudaDe(props, hay)} className={className}>
      <SelectFin
        id={id}
        valor={hay ? (valor ?? "") : ""}
        onValor={onValor}
        opciones={hay ? opcionesDeCuenta(cuentas, clase, sinMedio ? undefined : medio) : []}
        marcador={marcadorDe(listo, hay)}
        deshabilitado={deshabilitado || !hay}
      />
    </CampoFin>
  );
}
