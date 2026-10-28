"use client";

import Link from "next/link";
import { fraseSinRegistrar, TEXTO_ENLACE_MESA, type ConteoSinRegistrar } from "@/lib/vender-sin-registrar-reglas";

/**
 * El pie del ticket sobre las prendas sin registrar (A5, auditoría 2026-10-14): «Hoy 3 sin registrar · 71 por regularizar en tu
 * tienda · Regularizar». Una frase tenue bajo «Cobrar», que no compite con el total; el enlace es el de una frase (`btn-enlace`,
 * ADR-0358) y solo existe si la cuenta ve Existencias, donde vive la mesa (ADR-0306). Sin nada que decir, no se dibuja.
 */
export function SinRegistrarDeHoy({ conteo, verMesa }: { conteo: ConteoSinRegistrar | null; verMesa: boolean }) {
  const frase = fraseSinRegistrar(conteo);
  if (!frase) return null;
  return (
    <p className="mt-3 text-center text-xs text-tinta/65" data-sin-registrar-hoy>
      {frase}
      {verMesa && (
        <>
          {" · "}
          <Link href="/inventario/por-regularizar" className="btn-cayla btn-enlace">
            {TEXTO_ENLACE_MESA}
          </Link>
        </>
      )}
    </p>
  );
}
