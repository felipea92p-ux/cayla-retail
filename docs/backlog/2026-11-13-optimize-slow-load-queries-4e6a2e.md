## ⏱ Cambiar de módulo más rápido (2026-11-13, `/innovar`, informe `docs/innovacion/2026-11-13-cambiar-de-modulo.md`) — solo web, sin migración; rama `claude/optimize-slow-load-queries-4e6a2e`

- [x] #3 La copia del catálogo no se tira con cada publicación (`FORMA_COPIA_CATALOGO`, la huella del código que arma cada parte).
- [x] #4 Existencias y sus hermanas: cantidades delgadas + detalle desde la copia; respaldo con la lectura completa (`stock_sede_fuera_de_la_copia` en los registros si pasa).
- [ ] Tras publicar: correr `scripts/rendimiento/diagnostico-produccion.sql` y comparar la lectura de `stock` embebida (716 ms, 771 llamadas el 2026-11-13) — debería desaparecer de la lista — y contar en Vercel `copia_por_version_lectura` (cuántas veces se lee una copia en vivo, por `copia`) y `stock_sede_fuera_de_la_copia` (debería ser 0).
- [x] #1 Foto del diario ENCENDIDA en producción el 2026-11-13 (detalle en `docs/backlog/2026-11-09-foto-del-diario-cb64df.md`). Volver atrás: `update retail.parametros_finanzas set usar_foto_diario = false`.
- [ ] Medir Finanzas ▸ Resumen después: `vercel logs --query finanzas_resumen_ms` o la media de `fn_resumen_finanzas` en `diagnostico-produccion.sql` (antes: 4.490 ms). Solo octubre tiene foto: noviembre se sigue calculando en vivo, así que la baja será parcial hasta que cierre el mes.
- [ ] #6 El cronómetro del clic: propuesto como sesión aparte.
- [ ] Probado con datos reales salvo el precio propio de sede (la base local no tiene ninguno): lo cubre `stock-de-sede-reglas.test.ts`.
- [x] #8 (parte) Una sola pieza `conCopiaPorVersion` (`lib/copia-por-version.ts`) para `getCatalogo` y las fichas parecidas de Productos.
- [ ] #8 (resto) Vocabularios con la misma pieza (categorías, colores, marcas y tallas: los cubre `fn_catalogo_version`; familias, tejidos, patrones y proveedores NO, primero habría que sumarles el disparador). Son lecturas en paralelo: bajan carga de la base, no el tiempo de la pantalla.
- [ ] Ver acertar la copia de duplicados con la función presente (la base local no tiene `20261112204000`–`20261112212000`).
- [x] Existencias: ritmo reciente, reparto por dueño y etapas arrancan apenas tienen su dato (no esperan al plan del piso).
- [ ] #7 en espera: precargar al posar el mouse sirve la pantalla de hasta 5 min (`staleTimes.static`), y bajarlo a 30 s multiplica las precargas del menú (cada una pasa por el `layout` del módulo y sus 6 consultas de identidad). Decidir con los datos del cronómetro (#6, PR #1817) y una build de producción local, que es donde Next precarga.
- [ ] #12 en espera: parchar solo cantidades dejaría desfasada la columna «Hoy» (el plan del piso se calcula en la base con esas cantidades). Con #4, cada refresco ya no paga la lectura de 716 ms.
- [ ] Las demás («sin cambiar el uso») van en sesiones aparte: #5+#14 vigía y presupuesto, #13 lo vendido por día, #15 paso 1 + #9 identidad, #11 tienda web.
