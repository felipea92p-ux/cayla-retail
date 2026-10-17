## 2026-10-17 (Gasto fijo: primera semana, quincena o fin de mes, y el proveedor a la vista)
Qué hice: el modal «Nuevo gasto fijo» ahora pregunta «Cuándo llega» (día fijo, primera semana, quincena o fin de mes) y, al elegir proveedor, muestra su teléfono y cómo se le paga (misma tarjeta de Por pagar); también en «Registrar gasto». Migración `20261017155000` + pruebas SQL escritas.
Por qué así: fin de mes es el 28, 29, 30 o 31 y obligar a escribir 28 marcaba «falta» antes de tiempo; con los datos del proveedor a la vista otra persona puede pagar sin llamar a Felipe (ADR-0437).
Qué se rompería sin esto: faltas falsas el día 29 y un Flujo de caja que proyecta el pago días antes; y un gasto que solo Felipe sabe a quién y cómo pagar.
