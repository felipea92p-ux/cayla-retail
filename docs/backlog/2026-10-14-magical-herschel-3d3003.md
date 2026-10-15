## 🔄 Tras un guardado sin respuesta, la pantalla se vuelve a leer sola (2026-10-14, ADR-0411) — solo web, sin migración; rama `claude/magical-herschel-3d3003`

- [x] `components/ui/Espera.tsx`: el interceptor de `fetch` anota el guardado que termina sin respuesta (`lib/refresco-tras-corte.ts`).
- [x] `components/RefrescoTrasCorte.tsx`, montado en `app/(app)/layout.tsx`: pregunta a la base (`lib/sondear-la-base.ts`, mudada desde
      `SinConexion.tsx`), espera la red y la pausa del tecleo, y refresca sin loader. Fuera de Vender, Recibir y Nuevo producto.
- [x] Prueba pura `lib/refresco-tras-corte.test.ts` (18 casos, incluida la guardia de que está conectado en el interceptor y el layout);
      vitest completo, tsc, eslint, knip y knip de producción en verde.
- [x] Navegador local con un proxy que corta la respuesta después de que la base guardó: refresco con red, sin refresco sin red hasta
      `online`, y espera a que la persona deje de teclear. Base local restaurada a su foto.
- [ ] OK de Felipe y PR con `/abrir-pr`. Convive con ADR-0410 (`claude/happy-euler-dda937`): no tocan los mismos archivos.
- [x] **Chrome repite un POST cortado:** medido el 2026-10-15 con HTTP/1.1 y HTTP/2 y leído en Chromium (HTTP/3 incluido): sí, y si solo se
      corta el primer envío la pantalla recibe un OK y la base guardó dos veces. Informe:
      `docs/investigacion/2026-10-15-reintento-de-post-cortado.md`; experimento: `scripts/investigacion/reintento-post-cortado.mjs`.
- [ ] **`p_token` en `crear_devolucion`** (Devoluciones): con una línea de 2 o más unidades, un reenvío crea otra devolución pendiente;
      aprobada, reembolso doble y dos notas de crédito. Migración (reemplazo anclado) + pantalla. Toca dinero, stock y SUNAT: OK de Felipe.
- [ ] **`p_token` en las otras cinco que pueden duplicar:** `registrar_consumo_insumo`, `devolver_insumo_de_produccion`, `cerrar_linea_compra`,
      `reasignar_reparto_compra`, `crear_proforma` (en ese orden). OK de Felipe.
- [ ] **Decidir la marca por petición (`x-intento` + `db_pre_request`)** para las 141 funciones sin marca: escribir el ADR, primero en modo
      «solo anotar» para medir cuántos reenvíos hay. Toca la configuración de PostgREST del proyecto compartido con Dynamic: decide Felipe.
