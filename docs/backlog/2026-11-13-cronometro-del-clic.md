## ⏱️ El cronómetro del clic (2026-11-13) — rama `claude/cronometro-del-clic`, ADR-0654, `cambiar-de-modulo#6`

- [x] Paso 1: `onRouterTransitionStart` + `instrumentationClientRouterTransitionEvents`, cierre por `[data-esqueleto-pantalla]`, tope de 15 s, patrón de ruta, envío en lote a `POST /api/tiempos` → línea `tiempo_de_pantalla`.
- [ ] **Tras publicar:** entrar a tres módulos en producción, esperar 30 s y correr la receta de «Cómo se lee» del ADR-0654 (`vercel logs … --query tiempo_de_pantalla --json` + `jq`): tienen que salir. Si `.data.message` no trae la línea, mirar el formato de la CLI (ADR-0447).
- [ ] **Leer a diario una semana** (el registro de Vercel Pro guarda 24 h) y guardar los `tiempos-AAAA-MM-DD.jsonl`: es la línea base para #3, #4 y #7 del informe.
- [ ] **Paso 2, espera el OK de Felipe con esa semana en la mano:** guardar por hora en la base y la lente «p75 por módulo y sede» en el Observatorio, con un tope por módulo. Si se prefiere no tocar la base, un lector como el de la tienda (`pnpm --filter tienda medicion:leer`, ADR-0447) que junte los días.
- [ ] Marcar `cambiar-de-modulo#6` como `hecha` en `docs/innovacion/README.md` con este PR: la fila llega con el informe en la rama `claude/optimize-slow-load-queries-4e6a2e` (no está en `main` al abrir este PR; agregarla aquí chocaría con ese bloque).
- [ ] Lo que se vio de paso: la hoja interceptada de la factura de una compra (`/compras/factura/[compraId]`) tarda ~1 s sin mostrar nada (sin esqueleto). Con datos de producción, decidir si lleva el suyo.
