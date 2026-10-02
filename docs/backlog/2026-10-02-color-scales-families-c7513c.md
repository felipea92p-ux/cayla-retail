## 🎨 Familias de color en espectro y una sola escala (2026-10-02, ADR-0312) — web + 1 migración EN PRODUCCIÓN (pegada por Felipe el 2026-10-02); rama `claude/color-scales-families-c7513c`

- [x] `lib/color-escala.ts` (nuevo): orden único calculado del hex en OKLab — gama y luego claridad. Prueba con los 75 colores de
  producción (`lib/color-escala.test.ts`, 26 casos); la disposición esperada viene de un prototipo independiente y una mutación la hace fallar.
- [x] `lib/colores-familias.ts`: 11 familias en espectro (se suman Rosado y Naranja), prioridad de pertenencia escrita, `esFamiliaDeColor`, `enLaCarta`.
- [x] Nuevo producto, Agregar colores y «Prenda sin registrar» ordenan con `enEscala`; Atributos → Colores con `enLaCarta`. Sale el campo «Orden» del modal Editar color.
- [x] `app/api/productos/colores/route.ts` valida con la lista única (la tercera copia, a mano, desaparece).
- [x] Carta de Nuevo producto: círculos de 32 px, borde del propio tono, respiro entre gamas, metal cepillado, ✓ por claridad OKLab, pie con Pantone TCX y «se confunde con». Verificada a 1280 y 375 px (sin desborde) con un andamio sin base, en Chrome sin ventana.
- [x] Suite completa de la web en verde (307 archivos, 154.745 pruebas), `tsc` y ESLint limpios.
- [x] Migración `supabase/migrations/20261002180000_colores_familias_rosado_naranja.sql` ensayada en un Postgres desechable con los 79 colores de producción (`UPDATE 8 / 1 / 79`, idempotente, mutación detectada y revertida).
- [x] **Migración pegada en producción** (Felipe, 2026-10-02) y **verificada en vivo** con consultas de solo lectura: candado de 11 familias, 75 activos con conteos
  neutro 13, tierra 8, rosado 3, rojo 5, naranja 4, amarillo 5, verde 9, azul 11, morado 9, metalico 8; `AMM` = «Amarillo mantequilla»; los 75 códigos ordenados por `orden` salen
  en la misma secuencia que fija `lib/color-escala.test.ts`; ningún activo queda en `orden = 2000`. Con esto la web ya se puede fusionar.
- [ ] Refrescar `docs/datos/generado/` (`COMO-REFRESCAR.md`): el volcado guardado todavía describe 9 familias.
- [ ] **Sin probar:** crear un color en Rosado o Naranja de punta a punta desde la carta (la migración ya está pegada: falta hacerlo en la pantalla real); y la pantalla real con sesión (solo se probó con un andamio sin base).
- [ ] **Decisión de Felipe:** Coral queda en Rojo, Mora en Morado (por su nombre) y Salmón en Naranja; cualquiera se revierte con un `update` de una fila.
- [ ] **Decisión de Felipe:** de los 4 colores creados a mano (23 variantes con stock), Perla ≈ Crudo (ΔE 2,1) y «Amarillo mantequilla» ≈ Vainilla / Amarillo limón (7,8 / 7,2). No se fusionan sin tocar SKUs.
- [ ] `colores.orden` queda sin uso en la web; solo lo leen Vender (`vender/page.tsx`), Conteo e `alta-producto-datos.ts`. Cuando se toquen, ordenar con `enLaCarta` y retirar la lectura.
- [ ] «Gris melange» es de tipo `textura` y se pinta como un gris liso: mostrarlo jaspeado exige llevar `tipo` hasta `fondoDeMuestra`.
