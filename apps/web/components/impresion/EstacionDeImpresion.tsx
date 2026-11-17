"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { useSedeActiva } from "@/components/SedeActiva";
import { boletasPorAyudante } from "@/components/impresion/imprimirBoleta";
import { ventanaDelEquipo } from "@/lib/ventana-de-impresion";
import { estacionActiva, estacionDeLaCaja } from "@/lib/estacion-de-impresion";

// La estación de impresión de la caja (migración 20261116204000), montada una vez en el marco del ERP. Solo trabaja en la ventana
// «CAYLA Caja» con «Imprimir lo que se vende en el piso» encendido: en todo otro equipo —el teléfono del piso, el Mac de la oficina—
// no hace nada. Por eso aquí vive solo la pregunta (tres lecturas chicas del aparato) y la estación de verdad, con el recibo térmico y
// la lectura de la venta, se descarga recién cuando está encendida (ADR-0674): antes viajaba en el JavaScript de toda pantalla.
const EstacionActiva = dynamic(() => import("@/components/impresion/EstacionActiva").then((m) => m.EstacionActiva), { ssr: false });

export function EstacionDeImpresion() {
  const sede = useSedeActiva();
  const ventana = useSyncExternalStore(ventanaDelEquipo.suscribir, ventanaDelEquipo.leer, ventanaDelEquipo.leerEnServidor);
  const estacion = useSyncExternalStore(estacionDeLaCaja.suscribir, estacionDeLaCaja.leer, estacionDeLaCaja.leerEnServidor);
  const porAyudante = useSyncExternalStore(boletasPorAyudante.suscribir, boletasPorAyudante.leer, boletasPorAyudante.leerEnServidor);
  // La misma pregunta que hace la estación por dentro: si no está encendida, no se descarga nada.
  return estacionActiva(ventana, estacion, porAyudante) && sede?.ubicacionId ? <EstacionActiva /> : null;
}
