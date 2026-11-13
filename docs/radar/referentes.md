# Radar · referentes (al 2026-11-13)

Qué hacen hoy los mejores productos, en **patrones** (no por empresa), leídos para un ERP de 3 tiendas + 1 taller (Next.js + Supabase/RLS, SUNAT vía PSE).
Anillos de ThoughtWorks: **ADOPTAR** (hacerlo ya, el beneficio es claro) · **PROBAR** (un piloto acotado) · **EVALUAR** (entenderlo, sin construir aún) · **ESPERAR** (no ahora).
Horizonte: **ahora** = días o semanas con el stack actual · **visión** = meses, o depende de algo externo.

**Cómo leer las fuentes.** «Disponible» = el proveedor dice que ya se usa; «beta / preview / early access / próximamente» = anunciado, todavía no general. Si la fuente es un blog de terceros o un resumen del buscador (no pude abrir la página primaria: 403), lo digo. Las cifras de impacto que dan los proveedores (Ramp, Brex, Shopify) son suyas y nadie las auditó.

## Tabla resumen

| # | Patrón | Grupo | Anillo | Horizonte |
|---|---|---|---|---|
| 1 | El asistente redacta la orden de reposición | Retail/ERP | PROBAR | ahora |
| 2 | Mín/máx por prenda y sede, editable en lote | Retail/ERP | ADOPTAR | ahora |
| 3 | Traslados entre sedes propuestos por el sistema | Retail/ERP | PROBAR | ahora |
| 4 | Conteo cíclico planificado, contado en tienda, aprobado arriba | Retail/ERP | ADOPTAR | ahora |
| 5 | Recibir y trasladar escaneando, con informe de traslados | Retail/ERP | ADOPTAR | ahora |
| 6 | RFID a nivel prenda | Retail/ERP | ESPERAR | visión |
| 7 | «¿Hay en otra sede?» desde el mostrador | Retail/ERP | ADOPTAR | ahora |
| 8 | Comprar online y retirar en cualquier sede (y pedido mixto) | Retail/ERP | PROBAR | visión |
| 9 | Despachar pedidos web desde la tienda (ship-from-store) | Retail/ERP | EVALUAR | visión |
| 10 | Vender sin internet, con interruptor por equipo y registro | Retail/ERP | PROBAR | visión |
| 11 | Registro de actividad de alto riesgo en el POS | Retail/ERP | ADOPTAR | ahora |
| 12 | Personal de temporada: suspender, reactivar, varios roles | Retail/ERP | ADOPTAR | ahora |
| 13 | Vista de equipos (terminales) y cierre de sesión remoto | Retail/ERP | PROBAR | ahora |
| 14 | Atribución automática de la venta a la vendedora | Retail/ERP | ADOPTAR | ahora |
| 15 | Reconocer al cliente en el cobro | Retail/ERP | PROBAR | ahora |
| 16 | Ficha de clienteling en el mostrador (talla, cumpleaños, club) | Retail/ERP | ADOPTAR | ahora |
| 17 | Permiso aparte para ver datos personales del cliente | Retail/ERP | ADOPTAR | ahora |
| 18 | Apartado con depósito y cobro del saldo por enlace con vencimiento | Retail/ERP | EVALUAR | visión |
| 19 | Precio sugerido: rebaja o subida por rotación, stock y costo | Retail/ERP | PROBAR | ahora |
| 20 | Preguntarle al negocio en palabras, con clima y eventos | Retail/ERP | PROBAR | ahora |
| 21 | Alertas de prendas sin rotación o por agotarse | Retail/ERP | ADOPTAR | ahora |
| 22 | Agente de negocio que actúa con aprobación humana | Retail/ERP | EVALUAR | visión |
| 23 | Conector MCP: el ERP visible para asistentes externos | Retail/ERP | EVALUAR | visión |
| 24 | Foto y descripción de producto asistidas por IA | Retail/ERP | PROBAR | ahora |
| 25 | Comprobante peruano completo en el POS (térmica 58/80, descuentos UBL, retención) | Retail/ERP | ADOPTAR | ahora |
| 26 | Compras al SIRE de SUNAT desde el sistema | Retail/ERP | EVALUAR | visión |
| 27 | Guía de remisión electrónica nacida del traslado | Retail/ERP | EVALUAR | visión |
| 28 | QR interoperable (Yape/Plin) con monto y conciliación | Retail/ERP | EVALUAR | visión |
| 29 | Conciliación bancaria: subir el extracto y emparejar | Retail/ERP | PROBAR | ahora |
| 30 | Factura de proveedor duplicada: aviso en dos niveles | Retail/ERP | ADOPTAR | ahora |
| 31 | Leer la factura del proveedor y armar la recepción | Retail/ERP | PROBAR | ahora |
| 32 | Cierre de mes asistido: devengos y excepciones | Retail/ERP | EVALUAR | visión |
| 33 | Revisor de gastos que cita la regla que aplicó | Retail/ERP | PROBAR | ahora |
| 34 | Turnos propuestos con pronóstico de ventas | Retail/ERP | ESPERAR | visión |
| 35 | Paleta de comandos (Cmd+K) que enseña los atajos | Software top | PROBAR | ahora |
| 36 | Local-first: los datos viven en el equipo y se sincronizan | Software top | ESPERAR | visión |
| 37 | Actualización optimista con reversión automática | Software top | PROBAR | ahora |
| 38 | Idempotencia en toda escritura | Software top | ADOPTAR | ahora |
| 39 | Deshacer en vez de preguntar | Software top | ADOPTAR | ahora |
| 40 | Sugerencias explicadas que se aplican solas bajo reglas | Software top | PROBAR | ahora |
| 41 | Tareas recurrentes en lenguaje natural, con bitácora | Software top | EVALUAR | visión |
| 42 | Resumen del día personal | Software top | PROBAR | ahora |
| 43 | Anomalía detectada → investigación con causa probable | Software top | PROBAR | ahora |
| 44 | Inspector de un registro: relaciones, cambios y eventos | Software top | PROBAR | ahora |
| 45 | Publicación gradual y vuelta atrás instantánea | Software top | ADOPTAR | ahora |
| 46 | Vidrio solo en lo que flota, con mesura | Software top | ADOPTAR | ahora |
| 47 | Ayuda en el lugar, no un tour | Software top | ADOPTAR | ahora |
| 48 | Lo pendiente vuelve solo, con el borrador listo | Software top | PROBAR | ahora |
| 49 | IA con freno: alcance, aprobación, bitácora y tope de gasto | Software top | ADOPTAR | ahora |

---

## A. Retail y ERP (el QUÉ)

### 1. El asistente redacta la orden de reposición
- **Quién lo hace y cómo:** Shopify POS 11.8: le preguntas a Sidekick qué reponer, sugiere según ventas y crea el **borrador** de la orden de compra (disponible). Square Squaremates: «Restocking» revisa lo bajo, prepara el pedido y lo arma en el sitio del proveedor para que el vendedor lo complete (**beta**). Lightspeed: chat de IA sobre riesgo de quiebre y objetivos de stock (disponible, Edge 2026).
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — los tres convergen en «propone un borrador, la persona confirma»; ya hay motor de demanda y «precio propuesto con IA» para apoyarse.
- **Dónde encajaría:** Compras ▸ Apunte de compras / Mis compras (borrador desde lo que pide el motor del piso).
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (POS 11.8, 8-jun-2026) · https://investors.block.xyz/investor-news/news-details/2026/Square-Expands-its-Agentic-Platform-with-Squaremates-and-Powerful-New-AI-Tools/default.aspx (12-nov-2026) · https://www.lightspeedhq.com/blog/edge-virtual-2026-product-showcase-recap/ (30-sep-2026) — consultado 2026-11-13.

### 2. Mín/máx por prenda y sede, editable en lote
- **Quién lo hace y cómo:** Lightspeed (disponible): umbrales mínimo y máximo aplicados en lote a todo el catálogo. Toast Retail: niveles PAR mín/máx por artículo para ver qué reponer. Odoo 19: reglas de reposición con horizonte de 365 días, fecha límite para reordenar y vista previa según la demanda pasada; múltiplo del proveedor.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — es la base determinista sobre la que cualquier IA de reposición se vuelve explicable; barato y sin riesgo.
- **Dónde encajaría:** Inventario ▸ Existencias (por variante y sede) y el motor del piso.
- **Horizonte:** ahora.
- **Fuente:** https://www.lightspeedhq.com/blog/edge-virtual-2026-product-showcase-recap/ (30-sep-2026) · https://www.odoo.com/odoo-19-release-notes (sep-2025) · https://support.toasttab.com/en/article/Toast-Retail-Manage-Your-Inventory (sin fecha) — consultado 2026-11-13.

### 3. Traslados entre sedes propuestos por el sistema
- **Quién lo hace y cómo:** Lightspeed anunció «Agentic AI (coming soon)»: la IA recomienda y **redacta** traslados entre tiendas para evitar quiebres. **Anunciado, no disponible.**
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — con 3 sedes, empezar con una regla (sobra en A, falta en B, misma talla/color) y dejar la IA para después.
- **Dónde encajaría:** Traslados (borrador de traslado) e Inventario ▸ Frescura.
- **Horizonte:** ahora (con reglas).
- **Fuente:** https://www.lightspeedhq.com/blog/edge-virtual-2026-product-showcase-recap/ (30-sep-2026) — consultado 2026-11-13.

### 4. Conteo cíclico planificado, contado en tienda, aprobado arriba
- **Quién lo hace y cómo:** Shopify POS 11.16+ (POS Pro): el admin programa el conteo (sede y productos), aparece en el POS, la tienda escanea o escribe, y **enviar no cambia el stock**: alguien revisa diferencias y aprueba; queda quién contó y cuándo. Odoo 19 simplificó la vista de inventario físico.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — separa contar de ajustar, y cada ajuste queda en `movimientos` con su aprobación.
- **Dónde encajaría:** Inventario ▸ Contar / Ajustar stock (conteos chicos por categoría cada semana).
- **Horizonte:** ahora.
- **Fuente:** https://changelog.shopify.com/posts/run-inventory-counts-in-pos (28-sep-2026) · https://help.shopify.com/manual/products/inventory/inventory-counts (sin fecha) — consultado 2026-11-13.

### 5. Recibir y trasladar escaneando, con informe de traslados
- **Quién lo hace y cómo:** Shopify POS 10.20: traslados completos entre sedes (preparar y enviar desde Pedidos, recibir desde Productos escaneando, estado en tiempo real) y dos informes nuevos de traslados con filtros. POS 11.8: crear un traslado desde una orden de compra, importar por CSV y recibir mercadería del proveedor escaneando en el POS.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — confirma el camino que ya sigue Recibir mercadería; falta el informe de traslados en camino o con diferencias.
- **Dónde encajaría:** Traslados y Compras ▸ Recibir.
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/retail-roundup-february-2026 (16-mar-2026) · https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (jun-2026) — consultado 2026-11-13.

### 6. RFID a nivel prenda
- **Quién lo hace y cómo:** Inditex: hardware en el 100 % de sus tiendas y la etiqueta blanda en el 90 % de los productos de PV-2026 (resultados FY2025); en el primer semestre de 2026 dijo tenerla en todas sus tiendas, para cajas automáticas, puntos de retiro online y reserva de probador (dato del semestre vía prensa especializada). Para pymes hay apps sobre Shopify (TagMatiks, Keonn) que imprimen etiquetas RAIN y cuentan con lector de mano.
- **Grupo:** Retail/ERP.
- **Anillo:** ESPERAR — costo por etiqueta y lectores frente a 3 tiendas; primero sacar todo el valor al código de barras y al conteo cíclico.
- **Dónde encajaría:** Taller (etiquetar al terminar la prenda) → Recibir → Contar.
- **Horizonte:** visión.
- **Fuente:** https://www.inditex.com/itxcomweb/api/media/1da2c9d1-dbca-49fb-9563-982a8a27fae6/INDITEXFullYear2025.pdf (mar-2026) · https://www.etextilemagazine.com/inditex-delivers-strong-performance-in-the-first-half-of-2026.html (sep-2026, secundaria) · https://apps.shopify.com/tagmatiks-connect (sin fecha) — consultado 2026-11-13.

### 7. «¿Hay en otra sede?» desde el mostrador
- **Quién lo hace y cómo:** Zara «Modo tienda»: la app ubica la prenda en el mapa de la tienda y muestra disponibilidad, apoyada en el RFID (función de 2020-2021, sin confirmación 2026). Shopify POS 11.8 deja vender una prenda que no está en esa tienda creando un retiro en otra sede.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — el stock por sede ya está en la base; es una vista y un botón.
- **Dónde encajaría:** Vender (buscador de prenda: talla agotada aquí → «hay 2 en AQP»), y apartar desde otra sede.
- **Horizonte:** ahora.
- **Fuente:** https://www.zara.com/br/en/help-center/StoreMode (sin fecha) · https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (jun-2026) — consultado 2026-11-13.

### 8. Comprar online y retirar en cualquier sede (y pedido mixto)
- **Quién lo hace y cómo:** Shopify: la tienda gestiona desde el POS los pedidos a retirar (POS Pro); 11.8 permite crear un retiro que prepara **otra** sede; 11.9 permite un pedido online con parte para envío y parte para retiro (test drive para Plus/Enterprise desde el 19-jun-2026).
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — la tienda web propia ya existe; el retiro en sede es el puente omnicanal más barato.
- **Dónde encajaría:** Tienda web ▸ pedidos + bandeja de «por retirar» en Vender de cada sede.
- **Horizonte:** visión.
- **Fuente:** https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/pickup-in-store-for-online-orders (sin fecha) · https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (jun-2026) — consultado 2026-11-13.

### 9. Despachar pedidos web desde la tienda (ship-from-store)
- **Quién lo hace y cómo:** Shopify POS Pro: la tienda prepara y envía pedidos online desde el POS sin entrar al admin, con su permiso.
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — tiene sentido solo cuando el volumen web justifique sacar stock del piso.
- **Dónde encajaría:** Tienda web + Traslados.
- **Horizonte:** visión.
- **Fuente:** https://www.shopify.com/blog/store-fulfillment-software (2026, sin día) — consultado 2026-11-13.

### 10. Vender sin internet, con interruptor por equipo y registro
- **Quién lo hace y cómo:** Shopify (feb-2026): el gerente activa el cobro offline **por dispositivo**, y cada uso queda registrado (este segundo dato, de un blog de terceros). Odoo: al caer la red, guarda pedidos en el navegador y los sincroniza al volver; sin red no hay alta de clientes ni terminal de tarjeta; la factura pedida offline se genera al reconectar. Toast promociona su modo offline.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — el principio 9 lo pide, pero en Perú la boleta debe emitirse después por contingencia y el stock no puede quedar imposible: piloto solo con efectivo y comprobante diferido.
- **Dónde encajaría:** Vender (cola local + «Sin conexión», `PANTALLAS_SIN_CONEXION`).
- **Horizonte:** visión.
- **Fuente:** https://www.shopify.com/blog/retail-roundup-february-2026 (16-mar-2026) · https://www.odoo.com/documentation/20.0/applications/sales/point_of_sale/use.html (sin fecha) — consultado 2026-11-13.

### 11. Registro de actividad de alto riesgo en el POS
- **Quién lo hace y cómo:** Shopify POS 11.9: bitácora de anulaciones, devoluciones, descuentos manuales, inicios de sesión y acceso a fichas de cliente, con **quién lo hizo y qué gerente lo aprobó**, filtrable por persona, sede, tipo y fecha.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — el «responsable» ya firma cada acción (ADR-0162); falta la vista para el dueño.
- **Dónde encajaría:** Actividad (cabecera) con filtro «solo lo delicado».
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (POS 11.9, 22-jun-2026) — consultado 2026-11-13.

### 12. Personal de temporada: suspender, reactivar, varios roles
- **Quién lo hace y cómo:** Shopify POS 11.8: permisos del POS y del admin en un solo lugar; suspender y reactivar personal de temporada; varios roles por persona; roles de alta confianza. Odoo 19: un tercer perfil mínimo para quien solo cobra.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — CAYLA ya tiene roles por módulo; valida la dirección y sugiere el estado «suspendido» para campaña.
- **Dónde encajaría:** Colaboradores ▸ Roles y accesos.
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (jun-2026) · https://www.odoo.com/odoo-19-release-notes (sep-2025) — consultado 2026-11-13.

### 13. Vista de equipos (terminales) y cierre de sesión remoto
- **Quién lo hace y cómo:** Shopify POS 11.9: en el admin, todos los dispositivos con su estado, versión y sede; cerrar sesión o quitar acceso a uno perdido o robado.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — las cuentas terminal existen; ver su versión ayuda con el aviso de versión nueva.
- **Dónde encajaría:** Configuración ▸ Empresa y tiendas (terminales).
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (jun-2026) — consultado 2026-11-13.

### 14. Atribución automática de la venta a la vendedora
- **Quién lo hace y cómo:** Shopify POS 11.9: la venta se acredita sola a la vendedora fijada en el carrito, y su desempeño aparece en la analítica del POS (activado por defecto donde nunca se configuró).
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — alimenta metas y comisiones sin pedir un paso más en el cobro.
- **Dónde encajaría:** Vender (responsable fijado) → Gestión ▸ Rendimiento / Metas.
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/shopify-retail-roundup-june-2026 (jun-2026) — consultado 2026-11-13.

### 15. Reconocer al cliente en el cobro
- **Quién lo hace y cómo:** Shopify Fall '26 / POS 11.17: al pagar con tarjeta, el POS reconoce al comprador (red de Shopify Payments), ofrece el comprobante digital con su contacto enmascarado y lo liga a su ficha; el que repite tarjeta se liga solo.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — sin red de pagos propia, el equivalente es reconocer por DNI o celular al pedir la boleta y sumarlo al club.
- **Dónde encajaría:** Vender (paso de comprobante) + Clientes ▸ club.
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/news/fall-26-edition-merchant (≈ fines de oct-2026) · https://changelog.shopify.com/posts/identify-more-in-store-customers-with-pos (fecha no leída) — consultado 2026-11-13.

### 16. Ficha de clienteling en el mostrador (talla, cumpleaños, club)
- **Quién lo hace y cómo:** Shopify: campos propios del cliente (cumpleaños, preferencias de talla, nivel de lealtad) visibles en la pantalla del POS, y apps que meten el clienteling dentro del cobro.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — la vendedora vende mejor si ve «talla M, le gusta el lino, cumple el 20».
- **Dónde encajaría:** Vender (al elegir cliente) y Clientes.
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/enterprise/blog/omnichannel-pos (2026, sin día) — consultado 2026-11-13.

### 17. Permiso aparte para ver datos personales del cliente
- **Quién lo hace y cómo:** Shopify POS 11.1: permiso «View Customer Details» que decide quién ve nombre, correo, dirección y teléfono, **sin impedirle cobrar**.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — protección de datos (Ley 29733) a costo bajo.
- **Dónde encajaría:** Roles y accesos (función dentro de Clientes/Vender, no módulo).
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/retail-roundup-february-2026 (16-mar-2026) — consultado 2026-11-13.

### 18. Apartado con depósito y cobro del saldo por enlace con vencimiento
- **Quién lo hace y cómo:** Lightspeed Retail: depósito a la cuenta del cliente en caja o «Solicitar pago» por correo con formulario seguro; la solicitud vence a los 14 días y se ve su estado (pendiente, pagada, cancelada). Shopify reconoce que su POS **no** tiene apartado nativo y remite a apps.
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — el apartado ya existe; el cobro por enlace necesita una pasarela, que hoy no está integrada.
- **Dónde encajaría:** Vender ▸ Apartados.
- **Horizonte:** visión.
- **Fuente:** https://retail-support.lightspeedhq.com/hc/en-us/articles/40261399126939-Taking-deposits-for-special-orders-layaways-and-work-orders (sin fecha) · https://www.shopify.com/blog/how-to-start-a-layaway-program (2026) — consultado 2026-11-13.

### 19. Precio sugerido: rebaja o subida por rotación, stock y costo
- **Quién lo hace y cómo:** Shopify Smart Pricing (app gratuita, 20-jun-2025): sugerencias de rebaja y subida por producto según ventas, inventario, costos y estacionalidad; para productos nuevos, según categoría y mercado; se aplican en un clic. Reseñas piden saber **por qué** sugiere cada precio.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — extender el «precio propuesto con IA» (hoy para lo nuevo) a la rebaja de lo que no rota, con su porqué a la vista.
- **Dónde encajaría:** Inventario ▸ Frescura del piso y Catálogo ▸ Productos (precio).
- **Horizonte:** ahora.
- **Fuente:** https://apps.shopify.com/shopify-smart-pricing (lanzada 20-jun-2025) — consultado 2026-11-13.

### 20. Preguntarle al negocio en palabras, con clima y eventos
- **Quién lo hace y cómo:** Square AI (8-oct-2025): además de los datos propios, trae clima, eventos, noticias y reseñas de la web. Lightspeed AI (9-ene-2026): preguntas en lenguaje natural dentro del POS, con contexto y recomendación. Toast IQ para retail: «¿qué no se mueve?» y marcar un SKU agotado desde el chat.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — una pregunta del dueño («¿qué vendí más en Arequipa el finde?») sobre vistas de solo lectura.
- **Dónde encajaría:** Inicio del dueño / Análisis.
- **Horizonte:** ahora.
- **Fuente:** https://squareup.com/us/en/press/square-releases-ai (8-oct-2025) · https://www.prnewswire.com/news-releases/lightspeed-commerce-launches-lightspeed-ai-a-new-ai-powered-intelligence-layer-for-retail-and-hospitality-302656955.html (9-ene-2026) · https://pos.toasttab.com/news/toast-delivers-precision-insights-action-and-efficiency-for-retailers (fecha no verificada; página no abrió) — consultado 2026-11-13.

### 21. Alertas de prendas sin rotación o por agotarse
- **Quién lo hace y cómo:** Toast IQ (retail): marca lo casi agotado, lo agotado y lo inactivo hace 30+ días. Shopify Flow: Sidekick arma la automatización de stock bajo y la deja para revisión; Shopify aconseja disparar sobre «disponible», no «en mano».
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — Frescura del piso ya lo hace; el aprendizaje es medir sobre lo vendible (sin apartados).
- **Dónde encajaría:** Inventario ▸ Frescura del piso + avisos.
- **Horizonte:** ahora.
- **Fuente:** https://www.shopify.com/blog/flow-automation-updates-2025 (2025) · Toast (ver patrón 20) — consultado 2026-11-13.

### 22. Agente de negocio que actúa con aprobación humana
- **Quién lo hace y cómo:** Square Squaremates (GA en EE. UU., 12-nov-2026): trabajo de varios pasos —recuperar clientes inactivos, editar catálogo en lote, proponer turnos— «mientras el vendedor decide». Shopify Sidekick (Winter '26 y Fall '26): tareas de varios pasos, crea automatizaciones y apps, recuerda preferencias y pide aprobación para cambios. NetSuite Next (7-oct-2025): agentes con humano en el bucle o autónomos, según se configure; previews en 12 meses.
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — el patrón es firme, pero dinero, stock y SUNAT nunca se delegan; primero lectura y borradores.
- **Dónde encajaría:** Transversal (empezar por Compras y Clientes).
- **Horizonte:** visión.
- **Fuente:** https://investors.block.xyz/investor-news/news-details/2026/Square-Expands-its-Agentic-Platform-with-Squaremates-and-Powerful-New-AI-Tools/default.aspx (12-nov-2026) · https://www.shopify.com/news/winter-26-edition-renaissance (10-dic-2025) · https://www.oracle.com/in/news/announcement/sw25-netsuite-launches-netsuite-next-2025-10-07/ (7-oct-2025; leída por resumen, la página respondió 403) — consultado 2026-11-13.

### 23. Conector MCP: el ERP visible para asistentes externos
- **Quién lo hace y cómo:** Square MCP y CLI (disponibles, nov-2026). Shopify Fall '26: la tienda se maneja desde nueve asistentes (ChatGPT, Claude, Gemini…). NetSuite: «AI Connector» por MCP. Alegra: MCP para conectar Claude o ChatGPT a la contabilidad. Odoo 19.4 con MCP (solo fuente secundaria).
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — útil para el dueño, pero es una superficie nueva de acceso a datos: solo lectura y con RLS.
- **Dónde encajaría:** Capa de API sobre vistas de solo lectura (Finanzas, Análisis).
- **Horizonte:** visión.
- **Fuente:** https://investors.block.xyz/investor-news/news-details/2026/Square-Expands-its-Agentic-Platform-with-Squaremates-and-Powerful-New-AI-Tools/default.aspx (12-nov-2026) · https://www.shopify.com/news/fall-26-edition-merchant (≈ oct-2026) — consultado 2026-11-13.

### 24. Foto y descripción de producto asistidas por IA
- **Quién lo hace y cómo:** Lightspeed AI (ene-2026): recortar, iluminar, quitar o cambiar fondo en un clic. Shopify Magic: fondo de color o transparente con detección del sujeto, escena generada por texto (con marca de agua invisible) y descripción generada desde título y palabras clave.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — la tienda web necesita fotos parejas; la descripción debe seguir la regla de sugerencias coherentes.
- **Dónde encajaría:** Catálogo ▸ Nuevo producto / Editar producto, y Tienda web.
- **Horizonte:** ahora.
- **Fuente:** https://help.shopify.com/en/manual/shopify-admin/productivity-tools/shopify-magic/media-generation (sin fecha) · Lightspeed AI (ver patrón 20) — consultado 2026-11-13.

### 25. Comprobante peruano completo en el POS
- **Quién lo hace y cómo:** Odoo 19, localización Perú: descuentos globales y por línea en UBL 2.1 según SUNAT, retención de IGV del 3 % (código 62) e impresión térmica conforme a SUNAT de factura, boleta y nota de crédito en 58 y 80 mm desde el POS.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — usarlo como lista de comprobación contra lo que ya emite Lucode (cualquier cambio con validez legal, con OK de Felipe).
- **Dónde encajaría:** Vender ▸ comprobante y Facturación.
- **Horizonte:** ahora.
- **Fuente:** https://www.odoo.com/odoo-19-release-notes (sep-2025) — consultado 2026-11-13.

### 26. Compras al SIRE de SUNAT desde el sistema
- **Quién lo hace y cómo:** Bsale Perú (jul-2026): conexión directa con el SIRE para generar y enviar las compras sin volver a digitar; también cobro con tarjeta y cotizaciones desde el celular. Bsale fue comprada por Siigo. **Fuente secundaria (nota de prensa).**
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — ahorra trabajo al contador, pero es una integración legal nueva.
- **Dónde encajaría:** Finanzas ▸ Impuestos / Por pagar.
- **Horizonte:** visión.
- **Fuente:** https://www.businessempresarial.com.pe/bsale-revoluciona-la-gestion-de-las-pymes-en-peru-automatiza-la-tributacion-y-potencia-su-app/ (jul-2026, secundaria) — consultado 2026-11-13.

### 27. Guía de remisión electrónica nacida del traslado
- **Quién lo hace y cómo:** SUNAT, RS 123-2022: «traslado entre establecimientos de una misma empresa» es un motivo de GRE remitente; se envía **antes** de iniciar el traslado y se indica el código del establecimiento de llegada. No aplica dentro de un mismo local. Que sea obligatoria para CAYLA depende de su designación como emisor: verificar.
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — si aplica, el traslado ya tiene origen, destino y prendas: la guía puede salir sola (validez legal → Felipe).
- **Dónde encajaría:** Traslados (al confirmar el envío).
- **Horizonte:** visión.
- **Fuente:** https://www.sunat.gob.pe/legislacion/superin/2022/123-2022.pdf (2022) · https://orientacion.sunat.gob.pe/05-preguntas-frecuentes-guias-de-remision-bf (sin fecha) — consultado 2026-11-13.

### 28. QR interoperable (Yape/Plin) con monto y conciliación
- **Quién lo hace y cómo:** Proveedores peruanos ofrecen un QR que cobra a Yape, Plin y otras billeteras de la interoperabilidad del BCRP; el QR dinámico lleva el monto; sin integración, la cajera verifica a mano cada pago. Estado de la interoperabilidad para comercios en 2026: las fuentes no coinciden. **Solo fuentes de proveedores.**
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — es el medio de pago más usado en mostrador; mueve dinero real, así que pasa por Felipe.
- **Dónde encajaría:** Vender ▸ cobro y Caja ▸ arqueo.
- **Horizonte:** visión.
- **Fuente:** https://taypi.pe/blog/pagos-por-qr-peru-guia-comercios/ (2026, secundaria) · https://pos.necs.pe/blog/como-integrar-yape-plin-pos-sin-errores-arqueo (2026, secundaria) — consultado 2026-11-13.

### 29. Conciliación bancaria: subir el extracto y emparejar
- **Quién lo hace y cómo:** Alegra: se sube el extracto (archivo o imagen) y la IA importa y registra los movimientos; agente contable en México (22-oct-2026) que no timbra nada sin confirmación. Odoo 19: conciliación más simple, modelos automáticos mejores, atajos de teclado y conciliar asientos en borrador.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — empezar emparejando depósitos de caja contra el extracto, con propuesta y confirmación.
- **Dónde encajaría:** Finanzas ▸ Cuentas y dinero.
- **Horizonte:** ahora.
- **Fuente:** https://prensa.alegra.com/llega-un-nuevo-agente-de-ia-para-transformar-la-gestion-contable-de-las-empresas-en-mexico (22-oct-2026) · https://www.odoo.com/odoo-19-release-notes (sep-2025) — consultado 2026-11-13.

### 30. Factura de proveedor duplicada: aviso en dos niveles
- **Quién lo hace y cómo:** Odoo 19 detecta facturas de cliente y de proveedor duplicadas con dos niveles de alerta. Brex marca duplicados antes de que lleguen al libro.
- **Grupo:** Retail/ERP.
- **Anillo:** ADOPTAR — una regla (RUC + serie + número, y monto/fecha parecidos) evita pagar dos veces.
- **Dónde encajaría:** Finanzas ▸ Por pagar y Compras.
- **Horizonte:** ahora.
- **Fuente:** https://www.odoo.com/odoo-19-release-notes (sep-2025) · https://www.brex.com/platform/intelligent-finance (sin fecha) — consultado 2026-11-13.

### 31. Leer la factura del proveedor y armar la recepción
- **Quién lo hace y cómo:** Odoo 19: OCR que se corrige seleccionando texto del documento y busca la orden de compra en todo el XML/OCR. Square Managerbot: crea la orden de compra desde una factura, guía o correo de confirmación y actualiza el stock.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — con el XML de la factura electrónica peruana, el emparejamiento es casi determinista.
- **Dónde encajaría:** Compras ▸ Recibir contra factura.
- **Horizonte:** ahora.
- **Fuente:** https://www.odoo.com/odoo-19-release-notes (sep-2025) · https://squareup.com/help/us/en/article/8617-use-managerbot-to-manage-business-tasks-and-insights (sin fecha) — consultado 2026-11-13.

### 32. Cierre de mes asistido: devengos y excepciones
- **Quién lo hace y cómo:** Ramp Accounting Agent (12-feb-2026): codifica cada línea, sincroniza lo de bajo riesgo con bitácora, devenga lo que no está listo y lo revierte al mes siguiente, y marca lo que pide criterio. NetSuite Next: «cierre autónomo» que busca excepciones durante el mes (anunciado). Brex: devengos automáticos.
- **Grupo:** Retail/ERP.
- **Anillo:** EVALUAR — el cierre de mes existe; lo útil hoy es la lista de excepciones, no la automatización.
- **Dónde encajaría:** Finanzas ▸ Cierre de mes.
- **Horizonte:** visión.
- **Fuente:** https://ramp.com/blog/accounting-agent-launch (12-feb-2026) · NetSuite (ver patrón 22) — consultado 2026-11-13.

### 33. Revisor de gastos que cita la regla que aplicó
- **Quién lo hace y cómo:** Ramp Policy Agent (GA para Plus, 13-ene-2026): revisa cada gasto contra la política escrita en lenguaje natural, recomienda aprobar, rechazar o revisar, **cita la regla**, escala lo que la política no cubre y aprueba solo lo claro bajo un umbral.
- **Grupo:** Retail/ERP.
- **Anillo:** PROBAR — los gastos rápidos de caja de cada sede son el caso; la recomendación nunca aprueba dinero sola.
- **Dónde encajaría:** Caja ▸ gasto rápido → Finanzas ▸ Gastos.
- **Horizonte:** ahora.
- **Fuente:** https://ramp.com/blog/ramp-policy-agent-ga-launch (13-ene-2026) — consultado 2026-11-13.

### 34. Turnos propuestos con pronóstico de ventas
- **Quién lo hace y cómo:** Toast Fall 2026: «Toast IQ Team» con un agente de horarios que pronostica ventas desde el historial del POS (resumen del buscador; la página no abrió). Squaremates propone horarios con costo laboral optimizado.
- **Grupo:** Retail/ERP.
- **Anillo:** ESPERAR — con pocas vendedoras por sede, el horario se arma bien a mano; la planilla vive en Dynamic.
- **Dónde encajaría:** Colaboradores (asistencia).
- **Horizonte:** visión.
- **Fuente:** https://pos.toasttab.com/news/toast-fall-release-2026 (otoño 2026; no verificada) · Squaremates (ver patrón 22) — consultado 2026-11-13.

---

## B. Software de primer nivel (el CÓMO)

### 35. Paleta de comandos (Cmd+K) que enseña los atajos
- **Quién lo hace y cómo:** Linear: Cmd/Ctrl+K abre comandos según el contexto y actúa sobre lo seleccionado; tiene modo «solo teclado». Superhuman: al escribir la acción, muestra su atajo al lado («sn» → Posponer), y una hoja de atajos de una sola tecla.
- **Grupo:** Software top.
- **Anillo:** PROBAR — en un Mac mini con teclado, «ir a Existencias», «nueva venta», «buscar prenda» sin mouse.
- **Dónde encajaría:** Marco del ERP (`AppShell`), empezando por navegación y búsqueda universal.
- **Horizonte:** ahora.
- **Fuente:** https://linear.app/docs/select-issues (sin fecha) · https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ (sin fecha) — consultado 2026-11-13.

### 36. Local-first: los datos viven en el equipo y se sincronizan
- **Quién lo hace y cómo:** Linear: aplicación local-first con su motor de sincronización; el servidor ordena cada transacción (charla de su CTO; los detalles internos vienen de ingeniería inversa de terceros).
- **Grupo:** Software top.
- **Anillo:** ESPERAR — reescribir el núcleo sobre Supabase/RLS no vale para 3 sedes; el offline del POS (patrón 10) es el recorte útil.
- **Dónde encajaría:** Solo lecturas de catálogo en Vender (caché).
- **Horizonte:** visión.
- **Fuente:** https://linear.app/blog/scaling-the-linear-sync-engine (29-jun-2023) — consultado 2026-11-13.

### 37. Actualización optimista con reversión automática
- **Quién lo hace y cómo:** React 19 `useOptimistic`: el estado optimista se ve solo mientras la acción está en curso y vuelve al valor real al terminar o fallar. Linear lo usa como base de su sensación de instantáneo.
- **Grupo:** Software top.
- **Anillo:** PROBAR — solo donde no hay dinero ni stock (marcar visto, ordenar, editar un texto); ya existe la excepción de la pila de Gastos.
- **Dónde encajaría:** Listas, filtros, notas, preferencias.
- **Horizonte:** ahora.
- **Fuente:** https://react.dev/reference/react/useOptimistic (sin fecha; React 19, 5-dic-2024) — consultado 2026-11-13.

### 38. Idempotencia en toda escritura
- **Quién lo hace y cómo:** Stripe: cada POST lleva `Idempotency-Key`; el reintento devuelve la respuesta guardada (24 h en v1, 30 días en v2); misma clave con otros datos = error; un 409 = la primera aún corre. Shopify agregó claves de idempotencia y compare-and-swap a su API de inventario (Winter '26).
- **Grupo:** Software top.
- **Anillo:** ADOPTAR — el doble clic en «Cobrar» y el reintento tras un corte no deben crear dos ventas ni dos movimientos.
- **Dónde encajaría:** RPC que guardan (`registrar_venta`, traslados, recepciones, gastos).
- **Horizonte:** ahora.
- **Fuente:** https://docs.stripe.com/api/idempotent_requests (sin fecha) · https://www.shopify.com/news/winter-26-edition-renaissance (10-dic-2025) — consultado 2026-11-13.

### 39. Deshacer en vez de preguntar
- **Quién lo hace y cómo:** Superhuman: «Undo send» retiene el envío unos segundos; la limpieza masiva de bandeja se deshace hasta 7 días; el envío instantáneo no se deshace. Notion Custom Agents: los cambios de un agente son reversibles.
- **Grupo:** Software top.
- **Anillo:** ADOPTAR — es la ley 7 de Formidable; ampliar `<BotonDeshacer>` a toda acción que se pueda revertir con un movimiento inverso.
- **Dónde encajaría:** Avisos de éxito en todo el ERP.
- **Horizonte:** ahora.
- **Fuente:** https://download.superhuman.com/Superhuman%20Keyboard%20Shortcuts.pdf (v8) · https://www.notion.com/blog/introducing-custom-agents (24-feb-2026) — consultado 2026-11-13.

### 40. Sugerencias explicadas que se aplican solas bajo reglas
- **Quién lo hace y cómo:** Linear Triage Intelligence: sugiere equipo, responsable, etiquetas y duplicados según el historial; al pasar el mouse dice **por qué**; se acepta o descarta, y el admin puede hacer que se aplique sola y darle guía por equipo.
- **Grupo:** Software top.
- **Anillo:** PROBAR — categoría de un gasto, proveedor de una compra, prenda de una «venta sin registrar».
- **Dónde encajaría:** Finanzas ▸ Gastos, Ventas sin registrar.
- **Horizonte:** ahora.
- **Fuente:** https://linear.app/docs/triage-intelligence (sin fecha) — consultado 2026-11-13.

### 41. Tareas recurrentes en lenguaje natural, con bitácora
- **Quién lo hace y cómo:** Linear Loops (20-jul-2026): se describe la tarea en palabras, corre por calendario o por evento, y cualquiera ve sus instrucciones y qué pasó en cada corrida. Notion Custom Agents (24-feb-2026): disparadores, permisos por agente, registro de cada ejecución, tope de créditos con pausa.
- **Grupo:** Software top.
- **Anillo:** EVALUAR — ejemplo: «cada lunes, lista lo que no rotó en Trujillo y propón un traslado».
- **Dónde encajaría:** Configuración (automatizaciones) sobre el patrón 22.
- **Horizonte:** visión.
- **Fuente:** https://linear.app/changelog/2026-07-20-introducing-loops (20-jul-2026) · https://www.notion.com/blog/introducing-custom-agents (24-feb-2026) — consultado 2026-11-13.

### 42. Resumen del día personal
- **Quién lo hace y cómo:** Linear Pulse: resumen diario o semanal en la bandeja hacia las 6:00 hora local, también en audio. Shopify Sidekick Pulse: sugiere los próximos pasos en el inicio. Square anunció un resumen diario que junta correo y negocio (**próximamente**).
- **Grupo:** Software top.
- **Anillo:** PROBAR — a la encargada al abrir: ventas de ayer, apartados que vencen, traslados por recibir y caja sin cerrar.
- **Dónde encajaría:** Inicio de cada sede.
- **Horizonte:** ahora.
- **Fuente:** https://linear.app/changelog/2025-04-16-pulse (16-abr-2025) · https://www.shopify.com/news/spring-26-edition-merchant (2026) — consultado 2026-11-13.

### 43. Anomalía detectada → investigación con causa probable
- **Quién lo hace y cómo:** Vercel: alertas de anomalía (GA, abr-2026) y el agente que investiga cada una cruzando métricas, despliegues y cambios, y entrega causa raíz, impacto y pasos (**beta pública**, 31-oct-2025). Stripe Sessions 2026: el asistente del Dashboard investiga caídas de pagos y sugiere pasos (disponible).
- **Grupo:** Software top.
- **Anillo:** PROBAR — negocio: «la caja de AQP cerró S/ 300 abajo: estos 3 cobros con Yape no tienen respaldo».
- **Dónde encajaría:** Caja ▸ cierre y Observatorio del Admin.
- **Horizonte:** ahora.
- **Fuente:** https://vercel.com/blog/vercel-agent-can-now-run-ai-investigations (31-oct-2025) · https://stripe.com/blog/everything-we-announced-at-sessions-2026 (abr-2026) — consultado 2026-11-13.

### 44. Inspector de un registro: relaciones, cambios y eventos
- **Quién lo hace y cómo:** Stripe Workbench: el Inspector abre cualquier objeto con su JSON, sus registros de peticiones y sus eventos, y cómo se relaciona con otros.
- **Grupo:** Software top.
- **Anillo:** PROBAR — una venta con sus pagos, su comprobante, sus movimientos y quién la tocó, en una sola hoja (como el Historial de producto).
- **Dónde encajaría:** Ventas ▸ detalle y Movimientos.
- **Horizonte:** ahora.
- **Fuente:** https://docs.stripe.com/workbench/overview (sin fecha) — consultado 2026-11-13.

### 45. Publicación gradual y vuelta atrás instantánea
- **Quién lo hace y cómo:** Vercel: «Rolling Releases» manda una parte del tráfico a la versión nueva y «Instant Rollback» vuelve a una anterior sin recompilar. Shopify «Rollouts» programa cambios por porcentaje de tráfico (**early access**).
- **Grupo:** Software top.
- **Anillo:** ADOPTAR — con ~6 publicaciones por hora, volver atrás en segundos protege el mostrador; probar primero con una sede.
- **Dónde encajaría:** Publicación en Vercel (vigía de ADR-0425).
- **Horizonte:** ahora.
- **Fuente:** https://vercel.com/docs/rolling-releases (sin fecha) · https://vercel.com/docs/instant-rollback (sin fecha) — consultado 2026-11-13.

### 46. Vidrio solo en lo que flota, con mesura
- **Quién lo hace y cómo:** Apple Liquid Glass (9-jun-2025): material translúcido para controles y navegación que flota sobre el contenido; WWDC25 pide limitarlo a lo más importante, separar con «scroll edge effect» y expresar jerarquía con agrupación, no con decoración. Guía actualizada el 9-sep-2025, el 16-dic-2025 y el 8-jun-2026.
- **Grupo:** Software top.
- **Anillo:** ADOPTAR — ya es la estética del ERP («Serena», ADR-0596/0623); la fuente respalda la regla de no desenfocar lo que se desplaza.
- **Dónde encajaría:** Todo el ERP (recetas de vidrio).
- **Horizonte:** ahora.
- **Fuente:** https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/ (9-jun-2025) · https://developer.apple.com/design/whats-new/ (act. 8-jun-2026) — consultado 2026-11-13.

### 47. Ayuda en el lugar, no un tour
- **Quién lo hace y cómo:** Apple TipKit y HIG «Offering help»: consejos de una sola idea junto al control, que se van cuando la persona hace la acción y con tope de veces; enseñar en contexto y no al inicio.
- **Grupo:** Software top.
- **Anillo:** ADOPTAR — complementa las guías interactivas: un consejo de una línea cuando aparece un botón nuevo, en vez de repetir la demo.
- **Dónde encajaría:** Toda pantalla nueva (junto a la guía de foco).
- **Horizonte:** ahora.
- **Fuente:** https://developer.apple.com/design/human-interface-guidelines/offering-help (sin fecha) · https://developer.apple.com/videos/play/wwdc2023/10229/ (jun-2023) — consultado 2026-11-13.

### 48. Lo pendiente vuelve solo, con el borrador listo
- **Quién lo hace y cómo:** Superhuman: si un correo no recibe respuesta, el hilo vuelve arriba con un borrador de seguimiento (Auto Reminders); la bandeja se parte según etiquetas automáticas.
- **Grupo:** Software top.
- **Anillo:** PROBAR — un apartado por vencer vuelve a la encargada con el WhatsApp al cliente ya redactado (sin enviarlo solo).
- **Dónde encajaría:** Vender ▸ Apartados y Finanzas ▸ Por pagar.
- **Horizonte:** ahora.
- **Fuente:** https://blog.superhuman.com/the-next-superhuman-ai/ (sin fecha) · https://help.superhuman.com/hc/en-us/articles/43822934607251-Remind-Me (sin fecha) — consultado 2026-11-13.

### 49. IA con freno: alcance, aprobación, bitácora y tope de gasto
- **Quién lo hace y cómo:** Stripe (Sessions 2026): «guardrails» de agentes con identidad, reglas de alcance y aprobación para lo sensible (**preview**); Stripe Console pide confirmación antes de acciones importantes. Ramp: cada agente con identidad, dueño y presupuesto, y cada acción registrada. Notion (may-2026): el admin limita quién crea agentes, pone topes de créditos y apaga el que gasta demasiado rápido.
- **Grupo:** Software top.
- **Anillo:** ADOPTAR — como regla de diseño antes de cualquier agente; ya hay tope de US$ 20/mes para precios con IA.
- **Dónde encajaría:** Transversal: toda función con IA (precios, reposición, resúmenes).
- **Horizonte:** ahora.
- **Fuente:** https://stripe.com/blog/everything-we-announced-at-sessions-2026 (abr-2026) · https://agents.ramp.com/ (sin fecha) · https://www.notion.com/releases/2026-05-05 (5-may-2026) — consultado 2026-11-13.

---

### Lo que se buscó y no se confirmó
- Shopify «Summer '26 Edition»: solo blogs de terceros, que se contradicen; no encontré la página oficial. Lo usado de Shopify sale de las Editions Winter '26, Spring '26 y Fall '26, de sus resúmenes mensuales de retail y del changelog.
- Un «vendedor de IA» de Shopify en el POS: lo mencionan blogs, sin fuente oficial.
- Siigo: sin anuncio verificable de asistente contable con IA en 2026 (solo «Siigo Fiscal» en México, por prensa).
- Que la interoperabilidad QR del BCRP esté completa para comercios en 2026: las fuentes no coinciden.
- Toast (páginas de noticias) y Oracle/NetSuite respondieron 403: sus datos vienen del resumen del buscador.
