# Graph Report - cayla-retail  (2026-09-14)

## Corpus Check
- Large corpus: 320 files · ~520,340 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2240 nodes · 3712 edges · 279 communities (131 shown, 121 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.81)
- Token cost: 1,899,699 input · 0 output

## Community Hubs (Navigation)
- Compras UI Pages
- Padron y Varianza de Conteo
- Gobierno y Seguridad de Datos
- Scripts de Datos Generados
- Login y Apertura de Caja
- RLS Traslados e Identidad
- Comprobantes API Routes
- Componentes UI Compartidos
- Esquema SQL Inicial
- Codigos de Barras y QR
- Mapa de Modulos de Datos
- Caja y Categorias UI
- RPCs Retail (migracion Benja)
- Ayuda y Consulta de Documento
- Indicadores y Formulario de Venta
- Vocabulario Cerrado de Colores
- Compras Snapshot y Paginado
- Categorias y Colores API
- Enums Compartidos
- AppShell y Navegacion
- Constantes de Vocabulario
- RPCs Retail (funciones base)
- Registro Contable
- Contabilidad y Asientos
- Roles y Permisos de Sede
- Libro Diario Apagado
- Inventario y Movimientos
- Drift Produccion vs Local
- Catalogo e Importacion
- Root package.json
- Vocabulario Cerrado de Codigos
- Anulacion de Comprobantes
- Codigos de Barras SQL
- apps/web package.json
- apps/web tsconfig.json
- Facturacion SQL Inicial
- Caja y Venta Pages
- Formulario de Compra
- Panel de Comprobantes
- Ventas y Finanzas Operativas
- Recepcion de Compras UI
- packages/database package.json
- Censo y Plataforma (Mapa)
- Cliente Supabase
- Tablas Integracion Dynamic
- Script comparar.mjs
- Facturacion Completa SQL
- Skills y CI
- Facturacion SUNAT Promesas
- ADRs Lucode y SUNAT
- moverpage.tsx
- sharedpackage.json
- 0008_caja_y_pagos.sql
- 0013_colaboradores_autorizados.sql
- 20260912231956_compras_desde_factura.sql
- 12_almacen_interno.sql
- categoriaspage.tsx
- proformas.ts
- clientes
- sedes
- dependencies
- asiento_lineas
- ADR-0013 fases de latencia
- ADR-0004  recibir_lote divergió en la un
- bom_items
- ADR-00320033  Idempotencia y reintento s
- donde-estoy.mjs
- cargar.mjs
- turbo.json
- ADR-0004 recibir_lote divergió en la uni
- ADR-0010
- fn_familia_color_de_universal
- registrar_movimiento
- databasetsconfig.json
- 07_funciones_operacion.sql
- ADR-0003 categorías nuevas antes de capt
- facturacionpage.tsx
- devDependencies
- ADR-0023 El ajuste lleva signo y el stoc
- sharedtsconfig.json
- ADR-0010 la app corre contra Supabase lo
- applayout.tsx
- AnclarVocabulario.tsx
- VenderFormV2()
- Condición de carrera en fn_aplicar_movim
- m.cantidad
- ADR-0001 RLS de traslados no visibles en
- cambiospage.tsx
- ADR-0009 (create or replace no reemplaza
- SINATRA (sistema Excel financiero de CAY
- devolver_a_almacen
- produccion_lineas
- retail.set_updated_at
- retail.venta_items
- compraslayout.tsx
- scripts
- ADR-0020 recalcular_stock() calcula el n
- abrir_conteo
- abrir_caja
- design-tokens.ts
- retail.fn_activos_fijos_set_updated_at
- 0006_colaboradores.sql
- colaboradorespage.tsx
- AbrirCajaModal.tsx
- ADR-0035 La factura de compra es el eje 
- compra_items
- deshacer_importacion
- mi_sede
- ADR-0034 la pantalla abre antes que el d
- 26_ultima_venta_en_aplicar_movimiento.sq
- 28_colores.sql
- ADR-0030 importador de catálogos con IA 
- proxy.ts
- fn_aplicar_movimiento
- ADR-0029 Retail no mira el flag activa d
- ADR-0004 sobrecarga fantasma
- ADR-0010 Postgres local aislado por proy
- Paso 0 que el repo reproduzca produccion
- ADR-0010  El schema se renombra en el se
- D-11  Solo Felipe pega SQL en producción
- SQL-PENDIENTE-PRODUCCION.sql
- Partida doble  libro mayor debajo de los
- 33_conteo_color_vacio.sql
- 34_idempotencia_registrar_venta.sql
- Skill examen (AGENTS)
- emitir_comprobante
- fn_asignar_codigo_producto
- ADR-0009  create or replace con argument
- 11_produccion_material_etapas.sql
- ColoresLista()
- FinanzasNav.tsx
- InventarioNav.tsx
- VenderNav.tsx
- vercel.json
- ADR-0034 Las migraciones nuevas nacen co
- bajar_a_piso
- fn_clave_texto
- registrar_codigo_barras
- persona_actual
- pg_proc
- inventario.sql
- 0012_control_total_temporal.sql
- 21_actualizar_transmision_comprobante.sq
- 25_recalcular_stock_neto.sql
- ADR-0029 retail no mira el flag activa d
- eslint.config.mjs
- postcss.config.mjs
- convertir_proforma_a_comprobante
- ADR-0030 taxonomía universal como capa d
- pre-commit
- RPC abrir_caja  cerrar_caja
- RPC registrar_gasto
- RPC registrar_produccion  set_etapa_prod
- restore-cayla-v1.sh
- seed-demo.sql
- 05_operacion.sql
- 06_contabilidad_produccion.sql
- ADR-0006 migraciones duales causa raíz
- ADR-0020 bug de CHECK sobre fila propues
- ADR-0021 streaming en 10 pantallas resul
- Isotipo de CAYLA (colibrí de línea)
- File Icon (Next.js boilerplate)
- Globe Icon (globe.svg)
- Next.js Logo (Wordmark)
- Vercel Logo (Triangle Icon)
- Window Icon (Next.js boilerplate SVG)
- actualizar_transmision_comprobante
- anular_comprobante
- catalogo_con_stock
- fn_normalizar_color
- fn_reservar_numero_serie
- fn_token_talla
- fn_valida_nota_referencia_aceptada
- registrar_serie_comprobante
- cerrar_produccion
- eliminar_produccion
- es_lider
- es_supervisor
- fijar_stock_minimo
- fn_asiento_cuadra
- registrar_asiento
- registrar_deposito
- revertir_produccion_inventario
- set_etapa_produccion
- set_updated_at
- D-12 cuatro niveles de permiso
- retail.sede_meta
- categorias
- taxonomia_categoria_atributos
- ADR-0005  Facturación en dos partes rese
- ADR-0007  Esquema legal completo de comp
- ADR-0009  comprobantes.items y el conect
- ADR-0026  Firma nueva borra la vieja
- D-12  Cuatro niveles de permiso
- D-37  Vigilancia de comprobantes trabado
- ADR-0022  Los errores de escritura habla
- D-07  Lo muerto se marca con el motivo
- D-12  Cuatro niveles de permiso
- ADR-0010  Local vive en public producció
- ADR-0026  Una sola firma por función
- D-42  Mercadería nueva entra al almacén
- D-47  Inventario de insumos del Taller
- OrdenesProduccion.tsx
- ADR-0022  Errores de escritura hablan id
- ADR-0026  Firma vieja se borra siempre
- ADR-0029  Retail no mira el flag activa 
- D-32  Gastos sin sede van a CCO
- D-46  Cuentas por pagar e IGV prioridad 
- ADR-0006  patrimonio_items.categoria dri
- ADR-0029  Retail no mira el flag activa 
- D-07  Lo muerto se marca
- D-30  Estado de resultados por sede
- D-45  Método de costeo abierto
- D-46  Cuentas por pagar e IGV prioridad 
- D-30  Estado de resultados por sede
- D-31  El Taller se mide por eficiencia
- libpanel.ts
- ADR-0004  recibir_lote divergió en la un
- ADR-0006  patrimonio_items.categoria dri
- ADR-0026  Cómo se sabe qué corrió en pro
- D-18  Hace falta un entorno intermedio
- D-19  Comparación local-producción debe 
- D-20  La sede corporativa se llama CCO
- RENIEC
- lotes
- retail.clientes
- retail.codigos_barras
- retail.configuracion_empresa
- retail.patrimonio_items
- retail.proveedores
- retail.stock
- retail.stock_almacen
- retail.sububicaciones
- retail.ubicacion_datos_fiscales
- retail.categorias
- retail.colores
- retail.personas
- retail.productos
- retail.ubicaciones
- retail.variantes
- retail.personas
- retail.movimientos
- retail.ubicaciones
- retail.proformas
- retail.productos
- retail.proformas
- retail.productos
- retail.comprobantes
- retail.comprobantes
- retail.comprobantes
- retail.movimientos
- tabla proveedores

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 61 edges
2. `Decisiones 2026-09-12` - 60 edges
3. `Diccionario Retail` - 56 edges
4. `traducirError()` - 53 edges
5. `createClient()` - 53 edges
6. `Promesas Incumplidas` - 46 edges
7. `requirePersonaActualV2` - 44 edges
8. `exigir()` - 43 edges
9. `react` - 36 edges
10. `Contratos` - 36 edges

## Surprising Connections (you probably didn't know these)
- `Index.html — CAYLA Inventario v3 (Apps Script)` --semantically_similar_to--> `tabla movimientos (append-only)`  [INFERRED] [semantically similar]
  Index.html → docs/ARQUITECTURA.md
- `Skill /backlog (AGENTS)` --semantically_similar_to--> `Skill /backlog (Claude)`  [INFERRED] [semantically similar]
  .agents/skills/backlog/SKILL.md → .claude/skills/backlog/SKILL.md
- `Skill /decide (AGENTS)` --semantically_similar_to--> `Skill /decide (Claude)`  [INFERRED] [semantically similar]
  .agents/skills/decide/SKILL.md → .claude/skills/decide/SKILL.md
- `Skill /examen (AGENTS)` --semantically_similar_to--> `Skill /examen (Claude)`  [INFERRED] [semantically similar]
  .agents/skills/examen/SKILL.md → .claude/skills/examen/SKILL.md
- `Skill /explica (AGENTS)` --semantically_similar_to--> `Skill /explica (Claude)`  [INFERRED] [semantically similar]
  .agents/skills/explica/SKILL.md → .claude/skills/explica/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Principio 4: movimientos como única fuente de verdad, stock derivado** — claude_md_12_principios, table_movimientos, table_stock, rpc_registrar_movimiento [EXTRACTED 1.00]
- **Reemplazo de Alegra: facturación electrónica vía Lucode/SUNAT** — docs_backlog_md_reemplazo_alegra, adr_0005, adr_0007, adr_0008, adr_0009, entity_lucode [EXTRACTED 1.00]
- **Migraciones del censo del catálogo (colores, código corto, conteos, ajuste con signo)** — docs_backlog_md_censo_catalogo, adr_0023, adr_0024, adr_0025, adr_0027, table_conteos [EXTRACTED 1.00]
- **Doctrina 'futurista = comportamiento, no decoración' a través del sistema visual** — docs_adr_0003_modal_compartido_radix_sin_kit_visual, docs_adr_0011_campos_y_capa_de_movimiento, docs_adr_0012_piso_de_contraste_y_esquinas_suaves, docs_adr_0014_riel_del_lateral_y_navegacion_como_instrumento, docs_adr_0017_taupe_deja_de_ser_color_de_texto, docs_adr_0019_el_panel_nuevo_es_un_menu_no_un_dialogo [INFERRED 0.85]
- **Familia de bugs de drift causados por el script de unificación con cayla-dynamic** — docs_adr_0004_recibir_lote_drift_unificacion, docs_adr_0006_patrimonio_items_categoria_drift, docs_adr_0007_facturacion_esquema_legal_completo, docs_adr_0004_recibir_lote_drift_unificacion_schema_retail [EXTRACTED 1.00]
- **Subsistema de facturación electrónica con Lucode (PSE)** — docs_adr_0005_facturacion_electronica_parte_en_dos, docs_adr_0007_facturacion_esquema_legal_completo, docs_adr_0008_consulta_padron_dni_ruc, docs_adr_0009_comprobantes_items_lucode, docs_adr_0015_entorno_de_transmision_en_el_comprobante, docs_adr_0016_anulacion_de_comprobantes [EXTRACTED 1.00]
- **Familia de funciones que reconstruyen un snapshot derivado desde su fuente de verdad append-only** — docs_adr_0020_recalcular_stock_neto_recalcular_stock, docs_adr_0020_recalcular_stock_neto_fn_aplicar_movimiento, docs_adr_0031_recalcular_stock_consciente_de_almacen_recalcular_stock, docs_adr_0036_compras_foto_mantenida_por_triggers_y_paginado_por_cursor_recalcular_compras_fn [INFERRED 0.85]
- **Vocabulario cerrado con candado de duplicados por clave normalizada (colores, taxonomía universal, portado V2)** — docs_adr_0024_vocabulario_cerrado_de_colores_colores_table, docs_adr_0030_taxonomia_universal_como_capa_de_traduccion_taxonomia_categorias_table, docs_adr_0035_vocabulario_cerrado_portado_no_fusionado_colores_table_v2 [INFERRED 0.85]
- **Disciplina para evitar sobrecargas fantasma y choques de migración en producción compartida** — docs_adr_0026_saber_que_corrio_y_la_firma_vieja_se_borra_firma_fantasma, docs_adr_0032_idempotencia_registrar_venta_registrar_venta_fn, docs_adr_0034_migraciones_nuevas_nacen_con_timestamp_no_con_el_proximo_numero_migration_new_cmd [INFERRED 0.75]
- **El candado de sede: puede_operar_sede + es_lider + mi_sede aplicando D-12** — docs_datos_05_seguridad_puede_operar_sede, docs_datos_05_seguridad_es_lider, docs_datos_05_seguridad_mi_sede, docs_datos_decisiones_2026_09_12_d12 [EXTRACTED 0.90]
- **Flujo de venta a stock: registrar_venta, fn_aplicar_movimiento, movimientos, stock, ventas** — docs_datos_01_invariantes_registrar_venta, docs_datos_01_invariantes_fn_aplicar_movimiento, docs_datos_generado_diccionario_retail_movimientos, docs_datos_generado_diccionario_retail_stock, docs_datos_generado_diccionario_retail_ventas [EXTRACTED 0.90]
- **Los dos rieles de migracion (unificacion/ vs migrations/) y su deuda declarada** — docs_datos_08_operacion, docs_datos_14_dynamic, docs_datos_decisiones_2026_09_12_d17 [EXTRACTED 0.85]
- **Drift de recibir_lote entre pantalla y producción** — docs_datos_generado_drift_recibir_lote, docs_datos_generado_rpcs_recibir_lote, docs_datos_modulos_05_inventario_y_movimientos_lotes [INFERRED 0.85]
- **El candado de sede se abre solo con NULL en tres módulos** — docs_datos_modulos_01_identidad_y_acceso_hueco1_null_bypass, docs_datos_modulos_05_inventario_y_movimientos_movimientos, docs_datos_modulos_07_ventas_y_caja_cajas [INFERRED 0.85]
- **ADR-0027: el censo es el primer conteo (catálogo + inventario + conteo)** — docs_datos_modulos_06_conteo_y_censo_adr_0027, docs_datos_modulos_04_importacion_de_catalogo_importaciones, docs_datos_modulos_06_conteo_y_censo_conteos [INFERRED 0.80]
- **Reserva atómica de correlativo SUNAT** — docs_datos_modulos_08_facturacion_sunat_emitir_comprobante, docs_datos_modulos_08_facturacion_sunat_series_comprobantes, docs_datos_modulos_08_facturacion_sunat_fn_reservar_numero_serie, docs_datos_modulos_08_facturacion_sunat_comprobantes [INFERRED 0.85]
- **Libro diario construido y apagado (0 filas en producción)** — docs_datos_modulos_12_contabilidad_registrar_asiento, docs_datos_modulos_12_contabilidad_asientos, docs_datos_modulos_12_contabilidad_asiento_lineas, docs_datos_modulos_12_contabilidad_cuentas_contables [INFERRED 0.85]
- **Riel dual de despliegue de esquema (local vs. producción)** — docs_datos_modulos_14_plataforma_y_esquema_riel_local, docs_datos_modulos_14_plataforma_y_esquema_riel_produccion, docs_datos_modulos_14_plataforma_y_esquema_migraciones_aplicadas, supabase_seed [INFERRED 0.85]

## Communities (279 total, 121 thin omitted)

### Community 0 - "Compras UI Pages"
Cohesion: 0.05
Nodes (69): CompraDetallePage(), ADR-0035, ComprasPage(), TONO_PAGO, TONO_RECEPCION, ADR-0035, diasHasta(), etiquetaVence() (+61 more)

### Community 1 - "Padron y Varianza de Conteo"
Cohesion: 0.06
Nodes (48): contador, excedeTope(), GET(), FilaPrevisualizacion, LineaVarianza, resumirVarianza(), Varianza, ABREV_TIPO (+40 more)

### Community 2 - "Gobierno y Seguridad de Datos"
Cohesion: 0.12
Nodes (56): Invariantes, Seguridad, Datos Personales, ADR-0008 consulta de padron a proveedor externo, Gobierno del Dato, Operacion, Contratos, 2.4 Retail -> Dynamic: el sueldo no entra al resultado (+48 more)

### Community 3 - "Scripts de Datos Generados"
Cohesion: 0.06
Nodes (40): public, AQUI, CANDIDATOS, contenedoresVivos(), DOMINIOS_RETAIL, dynamic, elegirFuente(), esc() (+32 more)

### Community 4 - "Login y Apertura de Caja"
Cohesion: 0.08
Nodes (38): LoginForm(), onSubmit(), MENSAJES_ERROR, AbrirCajaFormV2(), onSubmit(), CambioFormV2(), onSubmit(), money() (+30 more)

### Community 5 - "RLS Traslados e Identidad"
Cohesion: 0.07
Nodes (46): ADR-0001 RLS traslados sede destino, RPC fn_aplicar_movimiento (security definer), Policy movimientos_select_sede_destino, Tabla movimientos (append-only), ADR-0002 personas.auth_user_id UNIQUE, Constraint personas_auth_user_id_unique, ADR-0003 Modal compartido Radix sin kit visual, Brandbook CAYLA v3.0 (identidad visual) (+38 more)

### Community 6 - "Comprobantes API Routes"
Cohesion: 0.10
Nodes (33): POST(), POST(), FilaComprobante, itemsValidos(), POST(), ADR-0005, ADR-0007, anularBoletaLucode() (+25 more)

### Community 7 - "Componentes UI Compartidos"
Cohesion: 0.13
Nodes (24): METODOS, VarianteCatalogo, Linea, Ubicacion, VarianteConStock, MOTIVOS_EGRESO_RAPIDO, ESTADO_ESTILO, ESTADO_ETIQUETA (+16 more)

### Community 8 - "Esquema SQL Inicial"
Cohesion: 0.13
Nodes (37): clientes_doc_unico, codigos_barras_variante_idx, conteos_un_abierto_por_ubicacion, devolucion_items_devolucion_idx, lotes_ubicacion_idx, movimientos_lote_idx, movimientos_variante_ubicacion_idx, movimientos_venta_item_idx (+29 more)

### Community 9 - "Codigos de Barras y QR"
Cohesion: 0.09
Nodes (28): Codigo128(), ANCHO_UTIL_MM, Barras, barrasCode128(), Medida, medir(), MODULO_MM, PATRONES (+20 more)

### Community 10 - "Mapa de Modulos de Datos"
Cohesion: 0.10
Nodes (34): ADR-0029 retail ignora el estado inactivo de sede 003, 01 Identidad y acceso (Ganso), 03 Taxonomia universal (Tucan), 08 Facturacion SUNAT (Cuervo), 09 Compras y proveedores (Pelicano), 10 Produccion del Taller (Gallito), 2.3 Taller -> Tiendas: la prenda cruza, la plata no, Prioridad 2: Materia prima del Taller (+26 more)

### Community 11 - "Caja y Categorias UI"
Cohesion: 0.08
Nodes (27): CajaAbiertaPanel(), money(), Categoria, ETIQUETA_FAMILIA, OPCIONES_FAMILIA, ADR-0035, Color, FAMILIAS_COLOR (+19 more)

### Community 12 - "RPCs Retail (migracion Benja)"
Cohesion: 0.08
Nodes (19): retail.abrir_caja(), retail.cerrar_caja(), retail.cerrar_conteo(), retail.conteo_contar(), retail.crear_devolucion(), retail.fn_es_lider(), retail.fn_persona_actual(), retail.fn_ubicacion_actual_persona() (+11 more)

### Community 13 - "Ayuda y Consulta de Documento"
Cohesion: 0.11
Nodes (22): Ayuda(), Consulta, ConsultaDocumento(), ETIQUETA, MOTIVO_LEGIBLE, Props, ItemCarrito, money() (+14 more)

### Community 14 - "Indicadores y Formulario de Venta"
Cohesion: 0.12
Nodes (20): Comparativo, TarjetaIndicador(), ComprobanteEmitido, Linea, METODOS, Pago, Variante, money() (+12 more)

### Community 15 - "Vocabulario Cerrado de Colores"
Cohesion: 0.08
Nodes (25): ADR-0024: El color deja de ser texto libre, Código de variante (BLU-0042-AZM-M, depende de colores), colores_clave_unica (unique index sobre fn_clave_texto), colores (tabla, 29 filas, código 3 letras), variantes.color_id (FK), ADR-0025: Código corto al lado del SKU, y varios códigos de barras por prenda, codigos_barras (varios códigos por variante), EtiquetasGenerator.tsx (+17 more)

### Community 16 - "Compras Snapshot y Paginado"
Cohesion: 0.11
Nodes (24): retail.fn_compra_item_insertado, retail.fn_compra_pago_insertado, retail.fn_movimiento_compra_insertado, compra_items_foto, compra_pagos_foto, compras_condicion_idx, compras_documento_trgm_idx, compras_estado_pago_idx (+16 more)

### Community 17 - "Categorias y Colores API"
Cohesion: 0.19
Nodes (16): POST(), ADR-0035, FAMILIAS_COLOR, POST(), ADR-0035, RecibirLotePage(), ETIQUETA_TIPO, MovimientosPage() (+8 more)

### Community 18 - "Enums Compartidos"
Cohesion: 0.08
Nodes (25): CanalVenta, EstadoOrdenProduccion, EstadoProducto, ESTADOS_ORDEN_PRODUCCION, ESTADOS_PRODUCTO, ETIQUETA_GASTO_CATEGORIA, ETIQUETA_METODO_PAGO_GASTO, GastoCategoria (+17 more)

### Community 19 - "AppShell y Navegacion"
Cohesion: 0.11
Nodes (19): cambiarUbicacionActiva(), AppShell(), IC, Item, MenuNuevo(), alTeclado(), irA(), Persona (+11 more)

### Community 20 - "Constantes de Vocabulario"
Cohesion: 0.08
Nodes (24): CANALES_VENTA, GASTO_CATEGORIAS, MOTIVOS_DEVOLUCION, MOTIVOS_SALIDA, ORIGENES_LOTE, SEDES, TIPOS_MOVIMIENTO, AbrirCajaInput (+16 more)

### Community 21 - "RPCs Retail (funciones base)"
Cohesion: 0.09
Nodes (16): retail.cerrar_conteo(), retail.crear_devolucion(), retail.fn_aplicar_movimiento(), retail.fn_es_lider(), retail.fn_persona_actual(), retail.fn_ubicacion_actual_persona(), retail.recalcular_stock(), retail.transferir() (+8 more)

### Community 22 - "Registro Contable"
Cohesion: 0.12
Nodes (22): Comprobante, COMPROBANTES, construirLineas(), CuentaMin, EventoConfig, EventoId, eventoPorId(), EVENTOS (+14 more)

### Community 23 - "Contabilidad y Asientos"
Cohesion: 0.13
Nodes (23): 12 Contabilidad (Urraca), fn_puede_operar_sede() (local), 2.2 Sub-libros -> Contabilidad: ninguna funcion postea asiento, retail.registrar_asiento(), Promesas Incumplidas, P-02 El registro contable a mano tampoco funciona, sin alarma, P-03 Falta candado debe-o-haber por linea en produccion, P-07 El hueco del NULL en fn_puede_operar_sede, abierto en local (+15 more)

### Community 24 - "Roles y Permisos de Sede"
Cohesion: 0.13
Nodes (22): retail.es_lider(), retail.mi_sede(), retail.puede_operar_sede(), fn_bloquear_rol_directo() (Dynamic), public.fn_rol_actual() (Dynamic), public.fn_sede_actual_persona() (Dynamic), fn_set_rol() (Dynamic), Diccionario Dynamic (+14 more)

### Community 25 - "Libro Diario Apagado"
Cohesion: 0.09
Nodes (23): activos_fijos, ADR-0033 — Idempotencia de registrar_venta por token, asiento_lineas, asientos, cuentas_contables, D-31 — El Taller se mide por costo absorbido, D-35 — El libro contable se llena solo, por etapas, Libro diario de partida doble (+15 more)

### Community 26 - "Inventario y Movimientos"
Cohesion: 0.15
Nodes (22): 05 Inventario y movimientos (Halcon), ADR-0022 el historial se vuelve inmutable de verdad, ADR-0023 el ajuste lleva signo, retail.fn_aplicar_movimiento(), retail.recalcular_stock(), ADR-0001 movimientos_select ve el destino de traslado, 1.1 Inventario promete stock nunca negativo, 1.2 Movimientos promete reconstruir el pasado (+14 more)

### Community 27 - "Drift Produccion vs Local"
Cohesion: 0.09
Nodes (22): pnpm datos:comparar (pantalla vs. producción), recibir_lote drift (parámetro de más), registrar_gasto drift (parámetro de más), conteo_contar, conteo_contar_por_codigo, conteo_crear_variante, crear_producto_con_variantes, fn_asignar_codigo_variante (+14 more)

### Community 28 - "Catalogo e Importacion"
Cohesion: 0.15
Nodes (20): 02 Catalogo y vocabulario (Loro), 04 Importacion de catalogo (Golondrina), 2.5 Importacion -> Catalogo: producto_atributos sin escritores, 2.7 Catalogo -> Pistola: puertas sin codigo de barras, retail.importar_catalogo(), Margen por prenda, Sell-through por talla, ADR-0024 colores: clave normalizada unica (+12 more)

### Community 29 - "Root package.json"
Cohesion: 0.10
Nodes (20): devDependencies, turbo, typescript, typescript, name, packageManager, private, scripts (+12 more)

### Community 30 - "Vocabulario Cerrado de Codigos"
Cohesion: 0.10
Nodes (16): retail.fn_variantes_asignar_codigo, categorias_prefijo_unico, colores_clave_unica, productos_codigo_unico, retail.codigos_correlativos, retail.fn_asignar_codigo_producto(), retail.fn_asignar_codigo_variante(), categorias (+8 more)

### Community 31 - "Anulacion de Comprobantes"
Cohesion: 0.11
Nodes (20): actualizar_transmision_comprobante, ADR-0015 — Ambiente de transmisión pegado al resultado, ADR-0016 — Anular con dos caminos según tipo de documento, ADR-0032/0033 — Idempotencia por token de registrar_venta, Anulación en dos tiempos, anular_comprobante, comprobantes, convertir_proforma_a_comprobante (+12 more)

### Community 32 - "Codigos de Barras SQL"
Cohesion: 0.14
Nodes (17): categorias_prefijo_unico, codigos_barras_variante_idx, productos_codigo_unico, retail.codigos_barras, retail.codigos_correlativos, retail.fn_asignar_codigo_producto(), retail.fn_asignar_codigo_variante(), retail.registrar_codigo_barras() (+9 more)

### Community 33 - "apps/web package.json"
Cohesion: 0.11
Nodes (18): @supabase/supabase-js, @types/node, typescript, name, private, version, @anthropic-ai/sdk, @cayla-retail/database (+10 more)

### Community 34 - "apps/web tsconfig.json"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 35 - "Facturacion SQL Inicial"
Cohesion: 0.16
Nodes (13): proformas, comprobantes_estado_idx, comprobantes_ubicacion_id_idx, comprobantes_venta_id_idx, retail.actualizar_transmision_comprobante(), retail.anular_comprobante(), retail.comprobantes, retail.fn_valida_nota_referencia_aceptada() (+5 more)

### Community 36 - "Caja y Venta Pages"
Cohesion: 0.22
Nodes (12): CajaConDatos(), CajaPage(), Caja(), VentasDeHoy(), getCajaAbierta(), getMovimientosCaja(), getResumenCaja(), VarianteCatalogo (+4 more)

### Community 37 - "Formulario de Compra"
Cohesion: 0.14
Nodes (16): CompraFormV2(), actualizarLinea(), elegirProducto(), elegirVariante(), onSubmit(), hoyISO(), Linea, METODOS (+8 more)

### Community 38 - "Panel de Comprobantes"
Cohesion: 0.19
Nodes (14): anulacionEnTramite(), ComprobantesPanel(), cerrarModal(), onEmitir(), onRegistrarSerie(), esPrueba(), estiloEstado(), etiquetaEstado() (+6 more)

### Community 39 - "Ventas y Finanzas Operativas"
Cohesion: 0.16
Nodes (18): 07 Ventas y caja (Colibri), 11 Finanzas operativas (Garza), retail.cerrar_caja(), retail.registrar_venta(), 1.3 Caja promete una sola abierta por sede, 1.4 Ventas promete que un reintento no cobra dos veces, Prioridad 1: Cuentas por pagar e IGV, ADR-0032 token_cliente para idempotencia de venta (+10 more)

### Community 40 - "Recepcion de Compras UI"
Cohesion: 0.18
Nodes (10): Resultados(), NuevaCompraPage(), ADR-0035, RecibirComprasPage(), ADR-0035, EsqueletoTabla(), getCatalogo(), getLineasCompra() (+2 more)

### Community 41 - "packages/database package.json"
Cohesion: 0.12
Nodes (16): dependencies, @supabase/supabase-js, devDependencies, @types/node, typescript, @supabase/supabase-js, @types/node, typescript (+8 more)

### Community 42 - "Censo y Plataforma (Mapa)"
Cohesion: 0.15
Nodes (16): El Mapa (docs/datos), 06 Conteo y censo fisico (Lechuza), 13 Inteligencia y reportes (Aguila), 14 Plataforma y esquema (Gorrion), ADR-0027 conteo cerrado exige fecha de cierre, Numero 1: Vendido por sede, Onboarding, D-01 Trabajo principal: onboarding en un dia (+8 more)

### Community 43 - "Cliente Supabase"
Cohesion: 0.15
Nodes (13): createAppSupabaseClient(), requireEnv(), CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums (+5 more)

### Community 44 - "Tablas Integracion Dynamic"
Cohesion: 0.15
Nodes (14): retail.caja_movimientos, retail.cambios, retail.conteos, retail.devoluciones, retail.lotes, retail.transferencias, retail.fn_nombres_personas(), retail.fn_persona_actual_resumen() (+6 more)

### Community 45 - "Script comparar.mjs"
Cohesion: 0.15
Nodes (14): AQUI, archivosDeCodigo(), avisos, clavesDePrimerNivel(), { encontradas, noAnalizadas }, FIRMAS, GEN, llamadas() (+6 more)

### Community 46 - "Facturacion Completa SQL"
Cohesion: 0.17
Nodes (9): comprobantes_estado_idx, comprobantes_sede_id_idx, comprobantes_venta_id_idx, retail.comprobantes, retail.fn_reservar_numero_serie(), retail.series_comprobantes, public.personas, public.sedes (+1 more)

### Community 47 - "Skills y CI"
Cohesion: 0.19
Nodes (14): Skill /backlog (AGENTS), Skill /decide (AGENTS), Skill /explica (AGENTS), Skill /backlog (Claude), Skill /decide (Claude), Skill /explica (Claude), CI workflow (ci.yml), ADR-0026: un verificador vale por lo que declara que no revisó (+6 more)

### Community 48 - "Facturacion SUNAT Promesas"
Cohesion: 0.19
Nodes (14): retail.fn_reservar_numero_serie(), 1.5 Facturacion promete correlativo nunca repetido, 2.1 Ventas -> Facturacion: la boleta no sabe de que venta es, 2.6 Comprobantes -> SUNAT: emitir no transmite, nadie vigila, retail.emitir_nota(), Prioridad 3: Clientas y fidelizacion, ADR-0007 facturacion: esquema legal completo, ADR-0016 anulacion de comprobante exige motivo (+6 more)

### Community 49 - "ADRs Lucode y SUNAT"
Cohesion: 0.21
Nodes (14): ADR-0005: Lucode como PSE (no Nubefact), ADR-0007: Facturación Fase 0 (esquema legal completo), ADR-0008: verificación RENIEC/SUNAT antes de emitir, ADR-0009: conector Lucode, DROP FUNCTION de firma vieja, ADR-0015: entorno_transmision en comprobantes, ADR-0016: anulación de comprobante dentro del sistema, Reemplazo total de Alegra (8 fases), Lucode (PSE, app.apisunat.pe) (+6 more)

### Community 50 - "moverpage.tsx"
Cohesion: 0.27
Nodes (8): MoverMercaderiaPage(), InventarioPage(), AppLayout(), SelectorUbicacion(), FilaStock, getStockPorUbicacion(), getUbicaciones, Ubicacion

### Community 51 - "sharedpackage.json"
Cohesion: 0.14
Nodes (13): dependencies, zod, devDependencies, typescript, typescript, main, name, private (+5 more)

### Community 52 - "0008_caja_y_pagos.sql"
Cohesion: 0.22
Nodes (11): caja_movimientos_caja_idx, cajas_ubicacion_abierta_unica, retail.abrir_caja(), retail.caja_movimientos, retail.cajas, retail.cerrar_caja(), retail.venta_pagos, retail.personas (+3 more)

### Community 53 - "0013_colaboradores_autorizados.sql"
Cohesion: 0.27
Nodes (10): retail.colaboradores, retail.fn_colaboradores(), retail.fn_dynamic_disponibles(), retail.fn_persona_actual_resumen(), retail.fn_tiene_acceso_retail(), retail.fn_ubicacion_actual_persona(), auth.users, public.personas (+2 more)

### Community 54 - "20260912231956_compras_desde_factura.sql"
Cohesion: 0.16
Nodes (7): retail.compra_items_resumen, retail.compras_resumen, compra_items, compra_pagos, compras, movimientos, proveedores

### Community 55 - "12_almacen_interno.sql"
Cohesion: 0.19
Nodes (11): contenedores_un_almacen_por_sede, retail.bajar_a_piso(), retail.fn_aplicar_movimiento(), retail.stock_almacen, contenedores, movimientos, public.sedes, retail.contenedores (+3 more)

### Community 56 - "categoriaspage.tsx"
Cohesion: 0.18
Nodes (8): CategoriasPage(), ADR-0035, ProductosPage(), CategoriasLista(), ProductosNav(), SECCIONES, ADR-0035, FAMILIAS

### Community 57 - "proformas.ts"
Cohesion: 0.28
Nodes (10): EstadoProforma, marcarPorVencer(), Proforma, ProformaFila, AHORA, enHoras(), fila(), marcada() (+2 more)

### Community 58 - "clientes"
Cohesion: 0.15
Nodes (11): clientes, retail.fn_ventas_del_dia(), colores, comprobantes, productos, public.personas, ubicaciones, variantes (+3 more)

### Community 59 - "sedes"
Cohesion: 0.17
Nodes (7): sedes, retail_sede_meta, retail.persona_actual(), retail.personas, retail.sedes, public.personas, public.sedes

### Community 60 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @anthropic-ai/sdk, @cayla-retail/database, @cayla-retail/shared, next, qrcode.react, @radix-ui/react-dialog, react (+4 more)

### Community 61 - "asiento_lineas"
Cohesion: 0.17
Nodes (8): asiento_lineas, retail.fn_asiento_cuadra, asiento_lineas_cuadra, retail.fn_asiento_cuadra(), retail.recalcular_stock(), retail.recibir_lote(), movimientos, public.personas

### Community 62 - "ADR-0013 fases de latencia"
Cohesion: 0.17
Nodes (11): ADR-0013: fases de latencia, ADR-0018: motor de sincronización (local-first), ADR-0021: Datos viejos, nunca datos distintos, /inventario y /vender (Suspense boundaries), Principio: datos viejos, nunca datos distintos, Caché del router del cliente (staleTimes: 30), ADR-0013: fases de latencia (Fase 1b), ADR-0014: riel del lateral (navegación) (+3 more)

### Community 63 - "ADR-0004  recibir_lote divergió en la un"
Cohesion: 0.17
Nodes (12): ADR-0004 — recibir_lote divergió en la unificación, ComprasManager.tsx, D-27 — Costos y cuentas bancarias visibles por transparencia, D-46 — Prioridad 1: cuentas por pagar e IGV, D-47 — Inventario de insumos del Taller, ordenes_compra, ordenes_compra_items, proveedores (+4 more)

### Community 64 - "bom_items"
Cohesion: 0.18
Nodes (12): bom_items, cerrar_produccion, D-31 — El Taller se mide por costo absorbido, no por precio de transferencia, D-45 — Un solo costo por variante, el nuevo pisa al viejo, eliminar_produccion, Precio de transferencia interno (precio_taller), produccion_lineas, producciones (+4 more)

### Community 65 - "ADR-00320033  Idempotencia y reintento s"
Cohesion: 0.18
Nodes (12): ADR-0032/0033 — Idempotencia y reintento seguro de registrar_venta, ajustes_efectivo, D-30 — Estado de resultados por sede, D-33 — Sueldos leídos del sistema de personal, D-52 — Los tres números que Felipe mira primero, depositos_bancarios, EfectivoPanel.tsx, Fórmula del efectivo teórico (+4 more)

### Community 66 - "donde-estoy.mjs"
Cohesion: 0.20
Nodes (8): declarado, LINEA, proyectos, RAIZ, retratoDeLaBase(), sh(), stacksLevantados(), { url, origen }

### Community 67 - "cargar.mjs"
Cohesion: 0.24
Nodes (11): aplicar, arg(), bajarJson(), idCorto(), insertar(), lit(), main(), RAIZ (+3 more)

### Community 68 - "turbo.json"
Cohesion: 0.17
Nodes (11): dependsOn, outputs, cache, persistent, $schema, tasks, build, dev (+3 more)

### Community 69 - "ADR-0004 recibir_lote divergió en la uni"
Cohesion: 0.24
Nodes (10): ADR-0004: recibir_lote divergió en la unificación, ADR-0013: RPC transaccional vs N round-trips, ADR-0025: código corto + codigos_barras, Plan de captura del catálogo real (por semana, sin parar venta), Index.html — CAYLA Inventario v3 (Apps Script), RPC crear_producto_con_variantes, RPC recibir_lote, tabla lotes (+2 more)

### Community 70 - "ADR-0010"
Cohesion: 0.27
Nodes (10): ADR-0010, ADR-0022, CARPETAS, inventarioDeArchivo(), inventarioLocal(), main(), pelar(), promesasDe() (+2 more)

### Community 71 - "fn_familia_color_de_universal"
Cohesion: 0.18
Nodes (11): fn_familia_color_de_universal, fn_familia_de_universal, ADR-0035: la IA compila el mapeo, no procesa las filas, POST/PUT /api/taxonomia/anclar (proponer/guardar anclaje), D-50: cada marca, su propia base, taxonomia_atributos, taxonomia_categorias, taxonomia_valores (+3 more)

### Community 72 - "registrar_movimiento"
Cohesion: 0.18
Nodes (11): registrar_movimiento, registrar_venta, ADR-0023: el ajuste lleva signo, el stock no puede ser negativo, D-21: movimientos es la historia y no se toca, D-22: candado físico contra editar/borrar movimientos, D-40: vender desde el almacén se puede (incumplida), movimientos, ADR-0032: backend de la idempotencia de venta (+3 more)

### Community 73 - "databasetsconfig.json"
Cohesion: 0.18
Nodes (10): compilerOptions, declaration, esModuleInterop, lib, module, moduleResolution, skipLibCheck, strict (+2 more)

### Community 74 - "07_funciones_operacion.sql"
Cohesion: 0.22
Nodes (8): retail.cerrar_caja(), retail.fn_aplicar_movimiento(), retail.registrar_movimiento(), retail.registrar_venta(), cajas, movimientos, stock, ventas

### Community 75 - "ADR-0003 categorías nuevas antes de capt"
Cohesion: 0.22
Nodes (10): ADR-0003: categorías nuevas antes de capturar catálogo, ADR-0023: el ajuste lleva signo, ADR-0024: vocabulario cerrado de colores, ADR-0027: sesiones de conteo, Censo del catálogo real (cambio de estrategia 2026-09-09), Fusión V1→V2: se porta lo rescatable, no se fusiona el árbol, tabla activos_fijos, tabla categorias (+2 more)

### Community 76 - "facturacionpage.tsx"
Cohesion: 0.38
Nodes (8): FacturacionPage(), MESES, getComprobantesMes(), getSeriesComprobantes(), getVentasDeHoy(), mesActualLima(), mesLimaUTC(), getProformasMes()

### Community 77 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+2 more)

### Community 78 - "ADR-0023 El ajuste lleva signo y el stoc"
Cohesion: 0.22
Nodes (10): ADR-0023: El ajuste lleva signo, y el stock no puede ser negativo, fn_aplicar_movimiento (rama ajuste, asegurar-bloquear-verificar-sumar), MovimientoModal.tsx (min=1), CHECK movimientos_cantidad_coherente, CHECK cantidad >= 0 (stock y stock_almacen), ADR-0027: El censo es el primer conteo, y el cierre es la aprobación, Congelar cantidad_sistema al contar, no al cerrar, cerrar_conteo() / anular_conteo() (solo Líder) (+2 more)

### Community 79 - "sharedtsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, esModuleInterop, module, moduleResolution, skipLibCheck, strict, target (+1 more)

### Community 80 - "ADR-0010 la app corre contra Supabase lo"
Cohesion: 0.31
Nodes (7): ADR-0010: la app corre contra Supabase local, ADR-0033: stub local de Dynamic para desarrollar sin red, ADR-0034: migraciones nuevas nacen con timestamp, Migraciones duales: sin prefijo local / retail. en producción, Schema retail dentro del proyecto Supabase de cayla-dynamic, gen-types apunta al proyecto viejo / drift de tipos, cayla-dynamic (repo/proyecto Supabase hermano)

### Community 81 - "applayout.tsx"
Cohesion: 0.22
Nodes (6): metadata, sans, serif, nextConfig, ADR-0013, next

### Community 82 - "AnclarVocabulario.tsx"
Cohesion: 0.22
Nodes (5): AnclarVocabulario(), COLOR_CONFIANZA, Propuesta, Termino, Universal

### Community 83 - "VenderFormV2()"
Cohesion: 0.25
Nodes (4): VenderFormV2(), actualizarPago(), alFocoUnicoPago(), onSubmit()

### Community 84 - "Condición de carrera en fn_aplicar_movim"
Cohesion: 0.28
Nodes (9): Condición de carrera en fn_aplicar_movimiento (última unidad), Estancado: días sin venta vs días sin salida, RPC bajar_a_piso / devolver_a_almacen, RPC registrar_movimiento, RPC registrar_venta, tabla movimientos (append-only), tabla stock, tabla stock_almacen (+1 more)

### Community 85 - "m.cantidad"
Cohesion: 0.22
Nodes (8): m.cantidad, m.sede_id, retail.fn_aplicar_movimiento(), contenedores, movimientos, stock, stock_almacen, v_actual

### Community 86 - "ADR-0001 RLS de traslados no visibles en"
Cohesion: 0.25
Nodes (7): ADR-0001: RLS de traslados no visibles en sede destino, ADR-0002: personas.auth_user_id único, docs/datos/ — diccionario de datos generado desde la base, Estados imposibles por diseño (constraints, no código), Patrón lectura (lib) / escritura (RPC), Triple amarre de los 3 estados financieros, tabla personas

### Community 87 - "cambiospage.tsx"
Cohesion: 0.43
Nodes (5): CambiosPage(), CambiosLista(), VarianteCatalogo, getLineasVentaRecientes(), LineaVentaReciente

### Community 88 - "ADR-0009 (create or replace no reemplaza"
Cohesion: 0.25
Nodes (8): ADR-0009 (create or replace no reemplaza), ADR-0026: Cómo sabemos qué corrió en producción, y por qué la firma vieja se borra, crear_producto_con_variantes (7 y 8 args), Sobrecarga fantasma (create or replace con firma nueva no reemplaza), scripts/migraciones/ (inventario.sql + verificar.mjs), recibir_lote (6, 7 y 8 args), registrar_movimiento (10 y 12 args), registrar_produccion (11, 13 y 15 args)

### Community 89 - "SINATRA (sistema Excel financiero de CAY"
Cohesion: 0.36
Nodes (5): SINATRA (sistema Excel financiero de CAYLA), PCGE (Plan Contable General Empresarial), Umbral 300 UIT SUNAT (obligación de libros), Plan de cuentas CAYLA (25 cuentas, PCGE recortado), Felipe Alvarez (fundador CAYLA)

### Community 90 - "devolver_a_almacen"
Cohesion: 0.25
Nodes (8): devolver_a_almacen, fn_aplicar_movimiento, recalcular_stock, ADR-0020: recalcular_stock calcula el neto antes de escribir, ADR-0031: recalcular_stock vuelve a saber que el almacén existe, D-38: piso y almacén son dos bolsillos de la misma sede, stock (piso), stock_almacen

### Community 91 - "produccion_lineas"
Cohesion: 0.39
Nodes (6): produccion_lineas, retail.cerrar_produccion(), retail.eliminar_produccion(), retail.revertir_produccion_inventario(), retail.set_etapa_produccion(), producciones

### Community 92 - "retail.set_updated_at"
Cohesion: 0.36
Nodes (6): retail.set_updated_at, productos_updated, retail.categorias, retail.productos, retail.variantes, variantes_updated

### Community 93 - "retail.venta_items"
Cohesion: 0.29
Nodes (6): retail.venta_items, cambios_token_cliente_key, retail.cambios, retail.personas, retail.ubicaciones, retail.variantes

### Community 94 - "compraslayout.tsx"
Cohesion: 0.33
Nodes (4): ADR-0035, ComprasNav(), SECCIONES, ADR-0035

### Community 95 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, start, test, typecheck

### Community 96 - "ADR-0020 recalcular_stock() calcula el n"
Cohesion: 0.29
Nodes (6): ADR-0020: recalcular_stock() calcula el neto antes de escribir, ADR-0031: recalcular_stock() vuelve a saber que el almacén existe, contenedores (tipo 'almacen'), fn_aplicar_movimiento (traslado fuerza v_es_almacen=false), retail.recalcular_stock() (versión consciente de almacén), stock_almacen

### Community 97 - "abrir_conteo"
Cohesion: 0.33
Nodes (7): abrir_conteo, anular_conteo, cerrar_conteo, ADR-0027: el censo es el primer conteo, ADR-0027: el censo es el primer conteo, ADR-0027: el censo es el primer conteo, conteos

### Community 98 - "abrir_caja"
Cohesion: 0.29
Nodes (7): abrir_caja, cerrar_caja, puede_operar_sede (retail), Hueco 1: fn_puede_operar_sede devuelve NULL y no frena, cajas, D-13: cerrar caja es atribución de Líder de equipo, D-52: los tres números que Felipe mira primero

### Community 99 - "design-tokens.ts"
Cohesion: 0.29
Nodes (6): COLOR_TOKENS, MAX_ROJO_POR_PANTALLA, RADIUS_TOKENS, ROJO_NUNCA_TEXTO_SOBRE_TINTA, SHADOW_TOKENS, TYPE_TOKENS

### Community 100 - "retail.fn_activos_fijos_set_updated_at"
Cohesion: 0.33
Nodes (5): retail.fn_activos_fijos_set_updated_at, activos_fijos_set_updated_at, activos_fijos_ubicacion_idx, retail.activos_fijos, retail.ubicaciones

### Community 101 - "0006_colaboradores.sql"
Cohesion: 0.38
Nodes (4): retail.fn_es_lider(), retail.fn_persona_actual(), retail.fn_ubicacion_actual_persona(), personas

### Community 102 - "colaboradorespage.tsx"
Cohesion: 0.73
Nodes (4): ColaboradoresPage(), getColaboradores(), getDynamicDisponibles(), exigir()

### Community 103 - "AbrirCajaModal.tsx"
Cohesion: 0.33
Nodes (6): AbrirCajaModal.tsx, ADR-0022: Los errores de escritura hablan idioma CAYLA, CerrarCajaModal.tsx, apps/web/lib/error-escritura.ts (traducirError), RecibirLoteForm.tsx (precedente de traducción), RegistrarVentaModal.tsx

### Community 104 - "ADR-0035 La factura de compra es el eje "
Cohesion: 0.33
Nodes (6): ADR-0035: La factura de compra es el eje: de ella cuelgan recepción y pago, ADR-0036: Compras — la foto la mantiene la base (triggers) y se pagina por cursor, compras.pagado / facturado_cantidad / recibido_cantidad (foto por triggers), Paginado por cursor (keyset, no OFFSET), retail.listar_compras(), retail.recalcular_compras()

### Community 105 - "compra_items"
Cohesion: 0.33
Nodes (4): compra_items, compra_pagos, compras_resumen (vista derivada), compras (tabla, entidad central, reemplaza ordenes_compra)

### Community 106 - "deshacer_importacion"
Cohesion: 0.40
Nodes (6): deshacer_importacion, fn_codigo_tres_letras, importar_catalogo, ADR-0013: latencia, geografía y apuesta local-first, importaciones, productos.importacion_id

### Community 107 - "mi_sede"
Cohesion: 0.33
Nodes (5): mi_sede, ADR-0029: retail no mira el flag activa de Dynamic, cambiarSedeActiva (Server Action), D-20: sede corporativa se llama CCO, sedes (tabla/vista)

### Community 108 - "ADR-0034 la pantalla abre antes que el d"
Cohesion: 0.33
Nodes (6): ADR-0034: la pantalla abre antes que el dato, Service worker del censo (sw.js), ADR-0013 §C: umbral de venta sin internet (2+ unidades), ADR-0036: cola de ventas offline, Cola de ventas offline (localStorage), D-49: la caja sin internet no se congela nunca

### Community 109 - "26_ultima_venta_en_aplicar_movimiento.sq"
Cohesion: 0.33
Nodes (5): retail.fn_aplicar_movimiento(), contenedores, movimientos, stock, stock_almacen

### Community 110 - "28_colores.sql"
Cohesion: 0.40
Nodes (4): colores_clave_unica, retail.colores, retail.variantes, variantes_color_id_idx

### Community 111 - "ADR-0030 importador de catálogos con IA "
Cohesion: 0.60
Nodes (5): ADR-0030: importador de catálogos con IA sobre taxonomía Shopify, Importador de catálogos de clientes con IA, Estándar universal va debajo del vocabulario propio, no en lugar de, Taxonomía alineada a lo que vende CAYLA, Shopify Standard Product Taxonomy v2026-08

### Community 112 - "proxy.ts"
Cohesion: 0.40
Nodes (3): config, ADR-0013, @supabase/ssr

### Community 113 - "fn_aplicar_movimiento"
Cohesion: 0.50
Nodes (5): fn_aplicar_movimiento, movimientos (tabla, fuente de verdad), retail.recalcular_stock(), CHECK stock_cantidad_no_negativa, stock (tabla, snapshot derivado)

### Community 114 - "ADR-0029 Retail no mira el flag activa d"
Cohesion: 0.40
Nodes (5): ADR-0029: Retail no mira el flag activa de Dynamic, app/(app)/finanzas/egresos/page.tsx, app/(app)/finanzas/registrar/page.tsx, retail.sede_meta, retail.sedes (vista sobre sedes + sede_meta)

### Community 115 - "ADR-0004 sobrecarga fantasma"
Cohesion: 0.40
Nodes (4): ADR-0004: sobrecarga fantasma, ADR-0032: registrar_venta deja de duplicar una venta si la red se corta, registrar_venta(p_token uuid), ventas.token_cliente (unique index)

### Community 116 - "ADR-0010 Postgres local aislado por proy"
Cohesion: 0.40
Nodes (3): ADR-0010: Postgres local aislado por proyecto, ADR-0033: Un stub local de Dynamic para que db reset no dependa de la laptop de nadie, supabase/0000_local_stub_dynamic.sql.example

### Community 117 - "Paso 0 que el repo reproduzca produccion"
Cohesion: 0.50
Nodes (5): Paso 0: que el repo reproduzca produccion, ADR-0026 una sola firma viva por funcion, P-01 Registrar gasto y recibir del Taller no funcionan en las tiendas, retail.recibir_lote(), retail.registrar_gasto()

### Community 118 - "ADR-0010  El schema se renombra en el se"
Cohesion: 0.40
Nodes (4): ADR-0010 — El schema se renombra en el seed, después de migrar, 0004_grants.sql, Riel 1 — supabase/migrations/*.sql, supabase_migrations.schema_migrations

### Community 119 - "D-11  Solo Felipe pega SQL en producción"
Cohesion: 0.40
Nodes (5): D-11 — Solo Felipe pega SQL en producción, D-17 — supabase/unificacion es deuda a extinguir, migraciones_aplicadas, public.migraciones_aplicadas (de Dynamic), Riel 2 — supabase/unificacion/*.sql

### Community 121 - "Partida doble  libro mayor debajo de los"
Cohesion: 0.50
Nodes (5): Partida doble / libro mayor debajo de los sub-libros, Reglas de posteo automático (14 reglas), RPC registrar_asiento, tabla asientos / asiento_lineas, tabla cuentas_contables

### Community 122 - "33_conteo_color_vacio.sql"
Cohesion: 0.40
Nodes (4): retail.conteo_crear_variante(), colores, conteos, variantes

### Community 123 - "34_idempotencia_registrar_venta.sql"
Cohesion: 0.50
Nodes (4): retail.registrar_venta(), retail.cajas, retail.ventas, ventas_token_cliente_key

### Community 125 - "emitir_comprobante"
Cohesion: 0.50
Nodes (4): emitir_comprobante, emitir_nota, comprobantes.venta_id (siempre NULL), D-34: boleta y venta se unen

### Community 126 - "fn_asignar_codigo_producto"
Cohesion: 0.50
Nodes (4): fn_asignar_codigo_producto, fn_siguiente_correlativo, codigos_correlativos, productos

### Community 127 - "ADR-0009  create or replace con argument"
Cohesion: 0.50
Nodes (4): ADR-0009 — create or replace con argumento nuevo bifurca, ADR-0009 — create or replace bifurca en vez de reemplazar, ADR-0026 — Firma vieja se borra, Sobrecargas — la trampa de ADR-0009

### Community 134 - "ADR-0034 Las migraciones nuevas nacen co"
Cohesion: 0.67
Nodes (3): ADR-0034: Las migraciones nuevas nacen con timestamp, no con el próximo número a ojo, npx supabase migration new <nombre>, Numeración secuencial a mano (0054 chocado dos veces)

### Community 135 - "bajar_a_piso"
Cohesion: 0.67
Nodes (3): bajar_a_piso, contenedores, Sedes-almacén legadas (TRU-ALM/AQP-ALM/LIM-ALM)

### Community 136 - "fn_clave_texto"
Cohesion: 0.67
Nodes (3): fn_clave_texto, ADR-0024: el color deja de ser texto libre, colores

### Community 137 - "registrar_codigo_barras"
Cohesion: 0.67
Nodes (3): registrar_codigo_barras, ADR-0025: código corto y varios códigos de barras, codigos_barras

### Community 138 - "persona_actual"
Cohesion: 0.67
Nodes (3): persona_actual, ADR-0002: personas.auth_user_id único, personas (tabla/vista)

## Knowledge Gaps
- **571 isolated node(s):** `ADR-0035`, `ADR-0035`, `ADR-0035`, `TONO_PAGO`, `TONO_RECEPCION` (+566 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1035 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **121 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Componentes UI Compartidos` to `Compras UI Pages`, `apps/web package.json`, `Caja y Venta Pages`, `Login y Apertura de Caja`, `Formulario de Compra`, `Panel de Comprobantes`, `Recepcion de Compras UI`, `Codigos de Barras y QR`, `Caja y Categorias UI`, `Ayuda y Consulta de Documento`, `Indicadores y Formulario de Venta`, `Categorias y Colores API`, `AnclarVocabulario.tsx`, `AppShell y Navegacion`, `moverpage.tsx`, `cambiospage.tsx`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `apps/web/lib/error-escritura.ts (traducirError)` connect `AbrirCajaModal.tsx` to `ADR-0009 (create or replace no reemplaza`, `Caja y Venta Pages`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `Riel 2 — supabase/unificacion/*.sql` connect `D-11  Solo Felipe pega SQL en producción` to `Cliente Supabase`, `Script comparar.mjs`, `ADR-0010`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `ADR-0035`, `ADR-0035`, `ADR-0035` to the rest of the system?**
  _571 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Compras UI Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.05322128851540616 - nodes in this community are weakly interconnected._
- **Should `Padron y Varianza de Conteo` be split into smaller, more focused modules?**
  _Cohesion score 0.055299539170506916 - nodes in this community are weakly interconnected._
- **Should `Gobierno y Seguridad de Datos` be split into smaller, more focused modules?**
  _Cohesion score 0.11818181818181818 - nodes in this community are weakly interconnected._