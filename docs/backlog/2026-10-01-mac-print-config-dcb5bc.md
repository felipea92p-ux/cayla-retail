## 🏷️ Etiquetas de precio desde una Mac con el ayudante local (2026-10-01, ADR-0304) — web + script por Mac, sin migración; rama `claude/mac-print-config-dcb5bc`

- [x] **Ayudante** `apps/web/public/mac-etiquetas/servidor.sh` + `instalar.sh` (LaunchAgent `pe.cayla.etiquetas`, 127.0.0.1:9631, sin contraseña). `node scripts/mac-etiquetas/servidor.prueba.mjs`: 9/9 contra el Chrome real con impresora falsa.
- [x] **Web:** `lib/mac-etiquetas.ts` (puro, con prueba) + `ImprimirEtiquetasPrecio.tsx`. En una Mac con ayudante, «Imprimir» va por él; sin él, una nota con lo que falta y Copiar. La pestaña Mac de `GuiaImpresion.tsx` pasó a esos dos pasos. `tsc`, `eslint` y las 301 suites de `vitest` en verde.
- [x] **Probado en la MacBook de la tienda:** ayudante instalado con launchd; etiqueta de prueba de 62 × 40,1 por el ayudante, justa, derecha y cortada (trabajo 13).
- [ ] **Sin probar hasta el deploy:** «Imprimir» desde la pantalla de producción con una tanda real. Verlo también con una prenda en campaña, que tiene otro diseño. La primera vez Chrome puede pedir «acceso a la red local»: hay que elegir Permitir.
- [ ] **Instalar en las otras 2 Macs** (después del deploy): `curl -fsSL https://cayla-retail.vercel.app/mac-etiquetas/instalar.sh | sh`. En esta MacBook ya está instalado desde la copia local; conviene reinstalarlo desde la web para que quede la versión publicada.
- [ ] **Limpiar las pruebas del 2026-10-01 en la MacBook** (piden el ok de Felipe):
  - la cola `Brother_QL_CAYLA` (`lpadmin -x Brother_QL_CAYLA`);
  - los papeles personalizados `CAYLA Etiqueta`, `CAYLA Etiqueta vertical` y `CAYLA Etiqueta 62x62`. El respaldo del archivo de papeles original quedó en el scratchpad de la sesión.
- [ ] La pantalla no se vio en el navegador local: esta copia no tiene `.env.local` de Supabase y la pantalla pide sesión. La nota sin ayudante y el botón se ven recién en producción.
