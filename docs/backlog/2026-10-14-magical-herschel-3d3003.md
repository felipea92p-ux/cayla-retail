## 🔄 Tras un guardado sin respuesta, la pantalla se vuelve a leer sola (2026-10-14, ADR-0411) — solo web, sin migración; rama `claude/magical-herschel-3d3003`

- [x] `components/ui/Espera.tsx`: el interceptor de `fetch` anota el guardado que termina sin respuesta (`lib/refresco-tras-corte.ts`).
- [x] `components/RefrescoTrasCorte.tsx`, montado en `app/(app)/layout.tsx`: pregunta a la base (`lib/sondear-la-base.ts`, mudada desde
      `SinConexion.tsx`), espera la red y la pausa del tecleo, y refresca sin loader. Fuera de Vender, Recibir y Nuevo producto.
- [x] Prueba pura `lib/refresco-tras-corte.test.ts` (18 casos, incluida la guardia de que está conectado en el interceptor y el layout);
      vitest completo, tsc, eslint, knip y knip de producción en verde.
- [x] Navegador local con un proxy que corta la respuesta después de que la base guardó: refresco con red, sin refresco sin red hasta
      `online`, y espera a que la persona deje de teclear. Base local restaurada a su foto.
- [ ] OK de Felipe y PR con `/abrir-pr`. Convive con ADR-0410 (`claude/happy-euler-dda937`): no tocan los mismos archivos.
- [ ] **Chrome repite un POST cortado** (`ERR_EMPTY_RESPONSE` en una conexión reutilizada): en local, cada clic de Ingresar insumo llegó tres
      veces a la base y la marca lo dejó en un lote. Medir si pasa con el HTTP/2 de Supabase en producción y, si pasa, qué escrituras sin
      `p_token` quedan expuestas (las 114 sin marca de ADR-0410).
