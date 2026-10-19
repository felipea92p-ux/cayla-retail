import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Tienda web ▸ Campañas (ADR-0436): las migraciones ya pegadas en producción, CONGELADAS. Se pegaron el 2026-10-17, tal como estaban en el
// commit d32f50113, y Supabase las registró con otra versión (la del momento en que se pegaron). Si una cambia, el repo dice algo distinto
// de lo que corrió en producción y nada más avisa: `migraciones:deriva` compara las funciones, no el resto del archivo. Un cambio va SIEMPRE
// en una migración nueva (`pnpm reservar migracion`); una que se pegue después se suma aquí con su huella y su registro.
const PEGADAS = [
  { archivo: "20261017144000_campanas_modulo_y_portada_por_dia.sql", registro: "20261017202815", sha256: "1e1bf8fda052c905c7902bd72796861f740139dc24142c775c9008cda5ca422b" },
  { archivo: "20261017151000_campanas_una_sola_llave.sql", registro: "20261017203618", sha256: "f80da84f6e2e94281cb6ce1caf08a530b493d891dcfb3b4100b9850a4b5decc7" },
  { archivo: "20261017160000_campanas_diseno.sql", registro: "20261017202943", sha256: "98dae5227ffe56b45c570d7592f10522e322d75d6c44f8ea069fa4cf7080176d" },
  { archivo: "20261017200000_campanas_diseno_en_la_tienda.sql", registro: "20261017203014", sha256: "641ef96a228e043c45511b722e644b8aa094671b46546eed07f98577d10a7dae" },
] as const;

describe("las migraciones de Campañas pegadas en producción no cambian", () => {
  it.each(PEGADAS)("$archivo (registrada como $registro) sigue como se pegó", ({ archivo, registro, sha256 }) => {
    const texto = readFileSync(new URL(`../../../supabase/migrations/${archivo}`, import.meta.url));
    const huella = createHash("sha256").update(texto).digest("hex");
    expect(
      huella,
      `${archivo} ya está pegada en producción (registro ${registro}) y cambió. Deshaz el cambio (git checkout d32f50113 -- supabase/migrations/${archivo}) y escríbelo en una migración nueva, reservada con «pnpm reservar migracion».`,
    ).toBe(sha256);
  });
});
