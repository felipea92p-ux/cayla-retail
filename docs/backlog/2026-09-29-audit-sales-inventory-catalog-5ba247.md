## 🔎 Auditoría de Ventas, Inventario y Catálogo, para salir a piso en TRU (2026-09-29) — solo diagnóstico, sin migración ni código; rama `claude/audit-sales-inventory-catalog-5ba247`

Dos workflows en paralelo (8 + 7 frentes, con verificación adversarial de cada hallazgo grave). 81 + algo más de
hallazgos se redujeron a 35 + 15, ninguno refutado entero. Los informes completos (con evidencia archivo:línea,
DECIDÍ/DESCARTÉ/SE ROMPE SI e implementación de cada uno) se le entregaron a Felipe como archivos aparte —no viven
en este repo: son extensos y el segundo trae una sección de seguridad que no se publica mientras el repo sea
público (ver `docs/backlog/2026-09-26-*` sobre F-01). Lo de abajo es el resumen accionable.

### Decisiones de Felipe, esta noche

- [x] **D1** — mañana la boleta la emite el ERP por Lucode desde la apertura (no Alegra). Requiere desplegar la
      fecha en hora de Lima (hoy va en UTC) y pasar Lucode a producción antes de abrir.
- [x] **D2** — el catálogo y el stock de TRU entran por **censo físico en el piso**, cargado **en lotes** desde ese
      conteo (no se tipea cada prenda por el formulario de 4 pasos, y no se usa el stock de Alegra: 25 % de sus
      filas están en negativo o en cero).
- [x] **D11** — apartados mañana, sin adelanto (se aparta sin dinero desde Existencias o se cobra completo).
- [x] **D12** — la nota de crédito de una devolución acredita lo pagado, no el precio de lista; se corrige esta
      noche antes de aprobar devoluciones.
- [ ] **D3–D10, D13–D17** — pendientes, cada una con opción recomendada (detalle en el informe de triage que tiene
      Felipe): qué stock inicial cargar, tejido vacío en lo sin dato, marca desconocida → «Por identificar», talla
      neutra en 6 categorías, precio de los ítems sin IGV en Alegra, costo desde Alegra, descuentos de contingencia,
      quién corrige stock durante la carga, series al salir en vivo, cron de reintentos, y dos decisiones de la
      semana (caja de una venta sin red que sube tarde; alcance de R-38 en caja).

### Antes de abrir caja en TRU (~270 min, sin migración salvo donde se marca)

- [x] **Parche del `sku` NULL en los mensajes de rechazo** — hecho y pegado en producción, ver
      `docs/backlog/2026-09-29-parche-sku-nulo-mensajes-caja.md`.
- [ ] **La grilla de Vender no se congela con el catálogo real** (~215 min, solo web): ventana + memo + comparar antes
      de repintar + un solo motor de búsqueda. Hoy, con 1.500 tarjetas, cada escaneo tarda 1,2 s; medido a 2,3 ms
      con el arreglo. **Ojo:** `docs/SESIONES-ACTIVAS.md` tiene una fila del 2026-09-18 (`claude/local-work-3a718a`)
      tocando `PuntoDeVentaCatalogo.tsx` sin commitear — confirmar si sigue viva antes de tocar ese archivo.
- [ ] **Precio de los ítems de Alegra sin IGV** (jeans, `tax: []`): la inversa exacta del redondeo, dentro del
      cargador — no multiplicar siempre por 1,18 (subiría el precio 18 % sin que nadie lo vea).
- [ ] **Cargador del censo físico**: RPC ya existente (`crear_producto_con_stock_inicial`), llamado por lotes desde
      la hoja de conteo, idempotente por `token_cliente`. Con ensayo (`raise exception`) antes del «dale» de Felipe.
- [ ] Los 4 bloqueos de SUNAT (fecha en UTC, Lucode en sandbox, series de nota de crédito NC01/NC02 sin formato
      SUNAT, nota de crédito a precio de lista) — detalle e implementación en el informe de triage.

### Semana 1 — las 10 correcciones estructurales de mayor retorno (carril profundo)

- [ ] **C1 — una sola fuente legible del SQL vivo** (~300 min, ADR nuevo): generar `supabase/funciones/*.sql` desde
      `pg_get_functiondef` en el CI y comparar contra el repo; toda recreación de una función existente lleva guarda
      de md5. Es la causa raíz del 29 % de deriva medido esta noche.
- [ ] **C2 — la convivencia con Alegra es un dato, no un supuesto** (~475 min, con migración): `opera_desde` por
      sede, regularización automática de lo vendido antes de cargarlo, y las ventas de Alegra dentro del plazo de
      cambio (S/8.942 en TRU en las últimas 2 semanas) visibles para Cambios/Devoluciones.
- [ ] **C3 — la prenda y el error se nombran en un solo lugar** (~300 min, con migración): `hint` como contrato
      entre la base y la pantalla, en vez de que la web decida leyendo el texto del error.
- [ ] **C4 — el mostrador no se congela** (ver arriba, ya entra antes de abrir).
- [ ] **C5 — la venta es un hecho**: la caja se entera de un cambio de catálogo por versión, y nunca ofrece
      «Descartar» sobre una venta que la base rechazó por una causa pasajera.
- [ ] **C6 — posventa: una sola regla de valor**: un cambio con diferencia de precio se calcula contra lo pagado
      (no contra la lista) y deja su propio comprobante.
- [ ] **C7 — saber cuándo falla el mostrador**: hoy nadie guarda los rechazos que ve la colaboradora.
- [ ] **C8 — una sola cifra de stock** (lo que queda tras el ADR-0270/#580, que ya cerró la mayor parte).
- [ ] **C9 — las reglas fiscales en un solo lugar**: tope de S/700 con DNI, validación de RUC, todo antes de emitir
      en volumen.
- [ ] **C10 — vocabulario cerrado de motivos, demanda y costo**: hoy hay 5 definiciones distintas de «cuánto se
      vende» (una de ellas, en Productos, cuenta las ventas anuladas).
- [ ] **8 reglas para el equipo (R1–R8)**, cada una con su guardia automática en el CI, para que lo que no tiene
      candado deje de divergir entre las 12 sesiones abiertas (medido: toda regla con guardia convergió; toda regla
      solo escrita divergió).

### Investigación de Operaciones — fase 2 (no se construye esta noche)

- [ ] **Capturar desde mañana** (aditivo, sin tocar `registrar_venta`): motivo de quiebre por talla/color, canal de
      la venta, fecha de pedido a proveedor, % de captura de clienta, costo de traslado, motivo de devolución por
      prenda. Sin esto, el modelo de reposición nace ciego.
- [ ] Modelo formal especificado (demanda jerárquica por categoría×sede×semana, reposición por fill rate, curva de
      tallas por newsvendor, rebaja por supervivencia) con su umbral de datos real: con el volumen de CAYLA hoy, una
      variante-sede vende una vez cada 9–12 semanas — ningún estimador por SKU sirve todavía. Detalle completo, con
      la prueba de concepto medida en base descartable, en el informe que tiene Felipe.

### Seguridad — sin detalle aquí (repo público)

- [ ] 9 hallazgos, ninguno crítico para operar mañana, todos ya bajados a MEDIO por el escéptico (aislamiento por
      sede y RLS están bien). El detalle completo lo tiene Felipe directamente, fuera del repo.

### Rendimiento

- [ ] Índice `stock(ubicacion_id, updated_at)` — el único que hace falta; no agregar los 271 que sugiere el asesor.
- [ ] `fn_resumen_variantes` con `left join lateral` en vez de un cruce que descarta 6,5 M filas (357–401 ms, mismo
      resultado, medido).

### No cubierto por esta auditoría

- Navegador a 375 px (el Supabase local estaba caído): se verifica en cada tanda.
- Lucode nunca se llamó: no se sabe si rechaza una fecha futura, cómo redondea el IGV por línea, ni qué responde
  `/status`.
- PR abiertos #589 y #590: no se leyó su código.
- Contabilidad: falta preguntarle al contador si SINATRA está con o sin IGV, y confirmar la contingencia de los
  jeans vendidos sin IGV en Alegra (histórico, no es tarea de programación).
