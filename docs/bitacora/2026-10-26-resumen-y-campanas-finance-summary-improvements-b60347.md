# 2026-10-26 · Finanzas ▸ Resumen y campañas: spike y contrato con el Plan de campaña

- **Qué:** spike de seis vistas (`docs/maquetas/finanzas-v3-2026-10/resumen-campana/`): qué debe abrir el Resumen para quien sabe poco de números, y cómo la compra de una campaña
  (cuánto, cuándo y cómo se paga) entra al Resumen —por la caja y por un bloque propio, **no como gasto**— con interruptor para ocultarla. Más un contrato con el Plan de campaña.
- **Por qué:** el Plan ya guarda inversión, tope, lo pedido y el plazo (ADR-0372, ADR-0499) y dejó «Finanzas dice…» fuera a propósito. Una compra de mercadería es inventario hasta que se vende (NIC 2,
  Balance del ERP): llamarla gasto la contaría dos veces. Lo que sí es gasto de campaña es la publicidad y el descuento.
- **Lo que falta:** el chat «FER – Auditoría módulo plan de campaña» aún no entregó (su rama no tiene commits); hay que comparar sus spikes con estos. Felipe decide quién puede ocultar la campaña
  (por campaña y general, recomendado) y si «cómo piensas pagarlo» se guarda en el plan. La extensión de `<Linea>` a dos referencias es de una ronda de `/unificar`. Sin código de la app ni migración.

## Construcción (misma fecha, tras aprobar la demo)

- **Qué:** el Resumen abre con tres respuestas, usa todo el ancho (solo él), va sin huecos (la caja y «Hoy te toca» parejas, el resto en columnas pegadas) y trae «Inversión en mercadería» **tras bandera** con su ícono «Qué se ve».
- **Por qué:** una persona sin formación de finanzas contesta de un vistazo lo que tiene, lo que debe y lo que gana; y la compra de una campaña es plata comprometida que sale de la caja al pagar, no un gasto: dentro de «Te deja» haría ver una pérdida el día de comprar.
- **Lo que falta:** la base no entrega la inversión (la construye la sesión del Plan de campaña; visibilidad decidida: tres estados, el Resumen lee solo «se hará») → hoy no se ve nada en producción; con `?inversion=ejemplo` solo en desarrollo. Las elecciones de «Qué se ve» viven en el navegador hasta entonces.
  Pestañas «historia» y «cuánto cuesta»: construidas, existen solo si el Plan entrega `historia` y `costos` (opcionales). `tema:auditar` y `/formidable` sin correr sobre las piezas nuevas. Las otras cinco pantallas de Finanzas siguen con tope de ancho.

