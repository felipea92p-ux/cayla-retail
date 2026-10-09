# 2026-10-09 — Apartados: DNI por SUNAT, celular opcional, reimprimir (ADR-0367)

- Apartar busca la ficha por DNI y, si no está, el nombre en SUNAT (`/api/padron`); el celular pasa a opcional (sin él, el número de Yape/Plin se pide aparte y no hay aviso por WhatsApp).
- «Todos» se llama «Historial» y cada apartado tiene su botón para reimprimir el ticket (marcado COPIA; entregados: final o anticipo).
- Verificado en local a 1440 px y 375 px: apartado sin celular registrado, fila sin WhatsApp, ticket reimpreso; base local restaurada a su foto. Migración `20261009231332` aplicada en producción (MCP) el mismo día, verificada.
