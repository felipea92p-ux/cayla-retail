---
paths:
  - "apps/web/components/VersionNueva.tsx"
  - "apps/web/app/api/version/**"
  - "apps/web/lib/version-nueva*"
  - "apps/web/next.config.ts"
---

## Aviso de versión nueva (regla — ADR-0422, Felipe 2026-10-15)

**Quien tiene el ERP abierto desde antes de la última publicación ve la píldora flotante «Hay una versión nueva» con «Actualizar» y una ✕ («Más tarde»)**
(`components/VersionNueva.tsx`, montado una vez en `app/(app)/layout.tsx`, junto a «Sin conexión»): una pantalla nueva no tiene que hacer nada.
Cada compilación graba su commit (`NEXT_PUBLIC_BUILD_ID`, en `next.config.ts`) y cada pestaña a la vista pregunta cada 5 min a `GET /api/version`.
**Nunca recarga sola** (en Vender el ticket en curso vive solo en la pantalla) y sin respuesta calla. Dos cosas que no se tocan sin leer el ADR:
el `fetch` de la pregunta no lleva `?dpl=` ni `x-deployment-id` (con la protección de versiones de Vercel, activa a 12 h, una pregunta con esa
marca recibiría la respuesta de la versión VIEJA y el aviso nunca saldría), y `/api/version` no es pública. Con ~6 publicaciones por hora el
aviso debe seguir siendo discreto: subirle el tono es decisión de Felipe. Pruebas: `lib/version-nueva-reglas.test.ts`.
