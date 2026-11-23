---
paths:
  - "apps/web/app/**/*.ts"
  - "apps/web/app/**/*.tsx"
  - "apps/web/components/**/*.ts"
  - "apps/web/components/**/*.tsx"
  - "apps/web/lib/**/*.ts"
  - "apps/web/lib/**/*.tsx"
  - "scripts/rendimiento/**"
---

## Relleno silencioso: un `.catch(() => null)` dice por qué (regla — ADR-0693, Felipe 2026-11-23)

**Un relleno pone un valor en lugar del error y nadie se entera:** `.catch(() => null)`, `.catch(() => [])`, `.catch(() => {})` o un
`catch { return [] }`. Muchos son a propósito (una parte opcional que, si no responde, deja la pantalla como antes) y otros esconden una
falla; el que es a propósito **lo dice en su línea**, en el comentario pegado arriba o dentro del manejador:
`// relleno-a-proposito: <qué pasa si falla, 10 caracteres o más>`. Si no es a propósito, que el error se vea (`capturarError`, `avisar.error`)
o que suba. No es relleno lo que ya avisa o usa el error, ni `res.json().catch(() => null)` (la falla se ve en `res.ok`). Lo hace cumplir
`lib/relleno-silencioso.test.ts` con el escáner `scripts/rendimiento/observabilidad.mjs` como definición única; lo de antes de la regla es
deuda por archivo en `lib/relleno-silencioso-archivos.ts` (`PENDIENTES_HOY`, solo baja): un relleno nuevo sin marca pone el PR en rojo.
