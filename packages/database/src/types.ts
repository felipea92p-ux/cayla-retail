export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  retail: {
    Tables: {
      activos_fijos: {
        Row: {
          costo: number
          created_at: string
          cuenta_codigo: string | null
          depreciacion_apertura: number
          descripcion: string | null
          estado: string
          fecha_adquisicion: string
          id: string
          nombre: string
          nota: string | null
          serie: string | null
          tasa_anual: number
          ubicacion_id: string
          updated_at: string
          valor_residual: number
          vida_util_meses: number
        }
        Insert: {
          costo: number
          created_at?: string
          cuenta_codigo?: string | null
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion: string
          id?: string
          nombre: string
          nota?: string | null
          serie?: string | null
          tasa_anual: number
          ubicacion_id: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses: number
        }
        Update: {
          costo?: number
          created_at?: string
          cuenta_codigo?: string | null
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion?: string
          id?: string
          nombre?: string
          nota?: string | null
          serie?: string | null
          tasa_anual?: number
          ubicacion_id?: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "activos_fijos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_movimientos: {
        Row: {
          caja_id: string
          created_at: string
          es_ajuste: boolean
          id: string
          monto: number
          motivo: string
          nota: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          caja_id: string
          created_at?: string
          es_ajuste?: boolean
          id?: string
          monto: number
          motivo: string
          nota?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string
          created_at?: string
          es_ajuste?: boolean
          id?: string
          monto?: number
          motivo?: string
          nota?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          abierta_en: string
          abierta_por: string | null
          cerrada_en: string | null
          cerrada_por: string | null
          diferencia: number | null
          estado: string
          id: string
          monto_apertura: number
          monto_cierre_real: number | null
          monto_cierre_sistema: number | null
          nota: string | null
          ubicacion_id: string
        }
        Insert: {
          abierta_en?: string
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          estado?: string
          id?: string
          monto_apertura: number
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          nota?: string | null
          ubicacion_id: string
        }
        Update: {
          abierta_en?: string
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          estado?: string
          id?: string
          monto_apertura?: number
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          nota?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      cambios: {
        Row: {
          caja_id: string | null
          cantidad: number
          created_at: string
          diferencia: number
          id: string
          metodo_pago_diferencia: string | null
          token_cliente: string | null
          ubicacion_id: string
          usuario_id: string | null
          variante_nueva_id: string
          venta_item_id: string
        }
        Insert: {
          caja_id?: string | null
          cantidad: number
          created_at?: string
          diferencia?: number
          id?: string
          metodo_pago_diferencia?: string | null
          token_cliente?: string | null
          ubicacion_id: string
          usuario_id?: string | null
          variante_nueva_id: string
          venta_item_id: string
        }
        Update: {
          caja_id?: string | null
          cantidad?: number
          created_at?: string
          diferencia?: number
          id?: string
          metodo_pago_diferencia?: string | null
          token_cliente?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
          variante_nueva_id?: string
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambios_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_variante_nueva_id_fkey"
            columns: ["variante_nueva_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activo: boolean
          categoria_padre_id: string | null
          familia: string | null
          id: string
          nombre: string
          notas: string | null
          prefijo: string | null
          tallas_sugeridas: string[] | null
        }
        Insert: {
          activo?: boolean
          categoria_padre_id?: string | null
          familia?: string | null
          id?: string
          nombre: string
          notas?: string | null
          prefijo?: string | null
          tallas_sugeridas?: string[] | null
        }
        Update: {
          activo?: boolean
          categoria_padre_id?: string | null
          familia?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          prefijo?: string | null
          tallas_sugeridas?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_categoria_padre_id_fkey"
            columns: ["categoria_padre_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string
          num_doc: string | null
          telefono: string | null
          tipo_doc: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          num_doc?: string | null
          telefono?: string | null
          tipo_doc?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          num_doc?: string | null
          telefono?: string | null
          tipo_doc?: string | null
        }
        Relationships: []
      }
      codigos_barras: {
        Row: {
          codigo: string
          created_at: string
          id: string
          origen: string
          variante_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          origen?: string
          variante_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          origen?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "codigos_barras_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_correlativos: {
        Row: {
          prefijo: string
          ultimo: number
          updated_at: string
        }
        Insert: {
          prefijo: string
          ultimo?: number
          updated_at?: string
        }
        Update: {
          prefijo?: string
          ultimo?: number
          updated_at?: string
        }
        Relationships: []
      }
      codigos_descuento: {
        Row: {
          activo: boolean
          codigo: string
          creado_por: string | null
          created_at: string
          porcentaje: number
          ubicacion_id: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_por?: string | null
          created_at?: string
          porcentaje: number
          ubicacion_id?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_por?: string | null
          created_at?: string
          porcentaje?: number
          ubicacion_id?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "codigos_descuento_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          agregado_por: string | null
          created_at: string
          persona_id: string
          rol: string
          ubicacion_asignada_id: string | null
        }
        Insert: {
          agregado_por?: string | null
          created_at?: string
          persona_id: string
          rol?: string
          ubicacion_asignada_id?: string | null
        }
        Update: {
          agregado_por?: string | null
          created_at?: string
          persona_id?: string
          rol?: string
          ubicacion_asignada_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_ubicacion_asignada_id_fkey"
            columns: ["ubicacion_asignada_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      colores: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          codigo: string
          estado: string
          familia_color: string | null
          hex: string | null
          imagen_muestra_url: string | null
          nombre: string
          notas: string | null
          orden: number
          propuesto_por: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          codigo: string
          estado?: string
          familia_color?: string | null
          hex?: string | null
          imagen_muestra_url?: string | null
          nombre: string
          notas?: string | null
          orden?: number
          propuesto_por?: string | null
          tipo?: string
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          codigo?: string
          estado?: string
          familia_color?: string | null
          hex?: string | null
          imagen_muestra_url?: string | null
          nombre?: string
          notas?: string | null
          orden?: number
          propuesto_por?: string | null
          tipo?: string
        }
        Relationships: []
      }
      compra_adjuntos: {
        Row: {
          archivado_en: string | null
          archivado_por: string | null
          bytes: number
          compra_id: string
          created_at: string
          id: string
          nombre: string
          ruta: string
          subido_por: string | null
          tipo: string
        }
        Insert: {
          archivado_en?: string | null
          archivado_por?: string | null
          bytes: number
          compra_id: string
          created_at?: string
          id?: string
          nombre: string
          ruta: string
          subido_por?: string | null
          tipo: string
        }
        Update: {
          archivado_en?: string | null
          archivado_por?: string | null
          bytes?: number
          compra_id?: string
          created_at?: string
          id?: string
          nombre?: string
          ruta?: string
          subido_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_adjuntos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_adjuntos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_items: {
        Row: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          descripcion: string | null
          id: string
          producto_id: string
          subtotal: number | null
          variante_id: string | null
        }
        Insert: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          descripcion?: string | null
          id?: string
          producto_id: string
          subtotal?: number | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number
          compra_id?: string
          costo_unitario?: number
          descripcion?: string | null
          id?: string
          producto_id?: string
          subtotal?: number | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_pagos: {
        Row: {
          compra_id: string
          created_at: string
          fecha: string
          id: string
          metodo: string
          monto: number
          referencia: string | null
          usuario_id: string | null
        }
        Insert: {
          compra_id: string
          created_at?: string
          fecha?: string
          id?: string
          metodo: string
          monto: number
          referencia?: string | null
          usuario_id?: string | null
        }
        Update: {
          compra_id?: string
          created_at?: string
          fecha?: string
          id?: string
          metodo?: string
          monto?: number
          referencia?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_pagos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_pagos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          condicion: string
          created_at: string
          documento: string | null
          estado: string
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number
          fecha_emision: string
          fecha_vencimiento: string | null
          id: string
          igv: number
          motivo_anulacion: string | null
          nota: string | null
          numero: string
          pagado: number
          proveedor_id: string
          recibido_cantidad: number
          saldo: number | null
          serie: string
          subtotal: number
          tipo: string
          token_cliente: string | null
          total: number
          ubicacion_destino_id: string
          usuario_id: string | null
        }
        Insert: {
          condicion: string
          created_at?: string
          documento?: string | null
          estado?: string
          estado_pago?: string | null
          estado_recepcion?: string | null
          facturado_cantidad?: number
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          igv: number
          motivo_anulacion?: string | null
          nota?: string | null
          numero: string
          pagado?: number
          proveedor_id: string
          recibido_cantidad?: number
          saldo?: number | null
          serie: string
          subtotal: number
          tipo?: string
          token_cliente?: string | null
          total: number
          ubicacion_destino_id: string
          usuario_id?: string | null
        }
        Update: {
          condicion?: string
          created_at?: string
          documento?: string | null
          estado?: string
          estado_pago?: string | null
          estado_recepcion?: string | null
          facturado_cantidad?: number
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          igv?: number
          motivo_anulacion?: string | null
          nota?: string | null
          numero?: string
          pagado?: number
          proveedor_id?: string
          recibido_cantidad?: number
          saldo?: number | null
          serie?: string
          subtotal?: number
          tipo?: string
          token_cliente?: string | null
          total?: number
          ubicacion_destino_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes: {
        Row: {
          anulacion_solicitada_at: string | null
          anulado_at: string | null
          anulado_por: string | null
          cliente_nombre: string | null
          cliente_num_doc: string | null
          cliente_tipo_doc: string
          comprobante_original_id: string | null
          created_at: string
          entorno_transmision: string | null
          enviado_at: string | null
          estado: string
          id: string
          igv: number
          items: Json | null
          moneda: string
          motivo: string | null
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          numero: number
          respuesta_anulacion: Json | null
          respuesta_sunat: Json | null
          serie: string
          subtotal: number
          tipo: string
          total: number
          ubicacion_id: string
          usuario_id: string | null
          venta_id: string | null
        }
        Insert: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          serie: string
          subtotal?: number
          tipo: string
          total: number
          ubicacion_id: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Update: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero?: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          serie?: string
          subtotal?: number
          tipo?: string
          total?: number
          ubicacion_id?: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_comprobante_original_id_fkey"
            columns: ["comprobante_original_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_empresa: {
        Row: {
          email: string | null
          id: boolean
          nombre_comercial: string | null
          razon_social: string
          resolucion_autorizacion: string | null
          ruc: string
          telefono: string | null
          updated_at: string
          web: string | null
        }
        Insert: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social: string
          resolucion_autorizacion?: string | null
          ruc: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Update: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social?: string
          resolucion_autorizacion?: string | null
          ruc?: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      conteo_items: {
        Row: {
          cantidad_contada: number
          cantidad_sistema: number
          conteo_id: string
          diferencia: number | null
          id: string
          movimiento_id: string | null
          variante_id: string
        }
        Insert: {
          cantidad_contada: number
          cantidad_sistema: number
          conteo_id: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          variante_id: string
        }
        Update: {
          cantidad_contada?: number
          cantidad_sistema?: number
          conteo_id?: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      conteos: {
        Row: {
          abierto_por: string | null
          alcance: string
          alcance_categoria_id: string | null
          cerrado_en: string | null
          cerrado_por: string | null
          created_at: string
          estado: string
          id: string
          numero: number
          sububicacion_id: string | null
          ubicacion_id: string
        }
        Insert: {
          abierto_por?: string | null
          alcance?: string
          alcance_categoria_id?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          numero?: number
          sububicacion_id?: string | null
          ubicacion_id: string
        }
        Update: {
          abierto_por?: string | null
          alcance?: string
          alcance_categoria_id?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          numero?: number
          sububicacion_id?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteos_alcance_categoria_id_fkey"
            columns: ["alcance_categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_sububicacion_pertenece_fk"
            columns: ["sububicacion_id", "ubicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "conteos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      costo_historial: {
        Row: {
          cantidad_nueva: number
          costo_anterior: number
          costo_resultante: number
          costo_unitario_nuevo: number
          created_at: string
          id: string
          movimiento_id: string
          origen: string
          stock_previo: number
          usuario_id: string | null
          variante_id: string
        }
        Insert: {
          cantidad_nueva: number
          costo_anterior: number
          costo_resultante: number
          costo_unitario_nuevo: number
          created_at?: string
          id?: string
          movimiento_id: string
          origen: string
          stock_previo: number
          usuario_id?: string | null
          variante_id: string
        }
        Update: {
          cantidad_nueva?: number
          costo_anterior?: number
          costo_resultante?: number
          costo_unitario_nuevo?: number
          created_at?: string
          id?: string
          movimiento_id?: string
          origen?: string
          stock_previo?: number
          usuario_id?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "costo_historial_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: true
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costo_historial_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucion_items: {
        Row: {
          cantidad: number
          condicion: string
          devolucion_id: string
          id: string
          movimiento_id: string | null
          venta_item_id: string
        }
        Insert: {
          cantidad: number
          condicion: string
          devolucion_id: string
          id?: string
          movimiento_id?: string | null
          venta_item_id: string
        }
        Update: {
          cantidad?: number
          condicion?: string
          devolucion_id?: string
          id?: string
          movimiento_id?: string | null
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          aprobado_en: string | null
          aprobado_por: string | null
          caja_id: string | null
          created_at: string
          estado: string
          id: string
          motivo: string
          reembolso_metodo: string | null
          reembolso_monto: number | null
          solicitado_por: string | null
          ubicacion_id: string
          venta_id: string
        }
        Insert: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          caja_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo: string
          reembolso_metodo?: string | null
          reembolso_monto?: number | null
          solicitado_por?: string | null
          ubicacion_id: string
          venta_id: string
        }
        Update: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          caja_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo?: string
          reembolso_metodo?: string | null
          reembolso_monto?: number | null
          solicitado_por?: string | null
          ubicacion_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          created_at: string
          documento_numero: string | null
          documento_serie: string | null
          documento_tipo: string
          especificacion: string | null
          id: string
          igv: number
          metodo_pago: string
          proveedor_id: string | null
          subtotal: number
          token_cliente: string | null
          total: number
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          categoria: string
          created_at?: string
          documento_numero?: string | null
          documento_serie?: string | null
          documento_tipo?: string
          especificacion?: string | null
          id?: string
          igv?: number
          metodo_pago: string
          proveedor_id?: string | null
          subtotal?: number
          token_cliente?: string | null
          total: number
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          documento_numero?: string | null
          documento_serie?: string | null
          documento_tipo?: string
          especificacion?: string | null
          id?: string
          igv?: number
          metodo_pago?: string
          proveedor_id?: string | null
          subtotal?: number
          token_cliente?: string | null
          total?: number
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_producto_cambios: {
        Row: {
          campo: string
          created_at: string
          entidad: string
          entidad_id: string
          id: string
          usuario_id: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          created_at?: string
          entidad: string
          entidad_id: string
          id?: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          created_at?: string
          entidad?: string
          entidad_id?: string
          id?: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: []
      }
      lotes: {
        Row: {
          fecha_recepcion: string
          id: string
          nota: string | null
          numero_guia: string | null
          proveedor_id: string
          recibido_por: string | null
          ubicacion_id: string
        }
        Insert: {
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          proveedor_id: string
          recibido_por?: string | null
          ubicacion_id: string
        }
        Update: {
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          proveedor_id?: string
          recibido_por?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          cambio_id: string | null
          cantidad: number
          compra_item_id: string | null
          conteo_item_id: string | null
          created_at: string
          devolucion_item_id: string | null
          id: string
          lote_id: string | null
          motivo: string | null
          nota: string | null
          produccion_id: string | null
          sububicacion_destino_id: string | null
          sububicacion_id: string | null
          tipo: string
          transferencia_item_id: string | null
          transferencia_recepcion_id: string | null
          ubicacion_destino_id: string | null
          ubicacion_id: string
          usuario_id: string | null
          variante_id: string
          venta_item_id: string | null
        }
        Insert: {
          cambio_id?: string | null
          cantidad: number
          compra_item_id?: string | null
          conteo_item_id?: string | null
          created_at?: string
          devolucion_item_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          produccion_id?: string | null
          sububicacion_destino_id?: string | null
          sububicacion_id?: string | null
          tipo: string
          transferencia_item_id?: string | null
          transferencia_recepcion_id?: string | null
          ubicacion_destino_id?: string | null
          ubicacion_id: string
          usuario_id?: string | null
          variante_id: string
          venta_item_id?: string | null
        }
        Update: {
          cambio_id?: string | null
          cantidad?: number
          compra_item_id?: string | null
          conteo_item_id?: string | null
          created_at?: string
          devolucion_item_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          produccion_id?: string | null
          sububicacion_destino_id?: string | null
          sububicacion_id?: string | null
          tipo?: string
          transferencia_item_id?: string | null
          transferencia_recepcion_id?: string | null
          ubicacion_destino_id?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
          variante_id?: string
          venta_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_cambio_id_fkey"
            columns: ["cambio_id"]
            isOneToOne: false
            referencedRelation: "cambios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_conteo_item_fkey"
            columns: ["conteo_item_id"]
            isOneToOne: false
            referencedRelation: "conteo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_devolucion_item_fkey"
            columns: ["devolucion_item_id"]
            isOneToOne: false
            referencedRelation: "devolucion_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_produccion_id_fkey"
            columns: ["produccion_id"]
            isOneToOne: false
            referencedRelation: "producciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sububicacion_destino_pertenece_fk"
            columns: ["sububicacion_destino_id", "ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "movimientos_sububicacion_pertenece_fk"
            columns: ["sububicacion_id", "ubicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "movimientos_transferencia_item_fkey"
            columns: ["transferencia_item_id"]
            isOneToOne: false
            referencedRelation: "transferencia_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_transferencia_recepcion_fkey"
            columns: ["transferencia_recepcion_id"]
            isOneToOne: false
            referencedRelation: "transferencia_recepciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_venta_item_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      produccion_lineas: {
        Row: {
          cantidad_buenas: number | null
          cantidad_plan: number
          created_at: string
          id: string
          produccion_id: string
          variante_id: string
        }
        Insert: {
          cantidad_buenas?: number | null
          cantidad_plan: number
          created_at?: string
          id?: string
          produccion_id: string
          variante_id: string
        }
        Update: {
          cantidad_buenas?: number | null
          cantidad_plan?: number
          created_at?: string
          id?: string
          produccion_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produccion_lineas_produccion_id_fkey"
            columns: ["produccion_id"]
            isOneToOne: false
            referencedRelation: "producciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produccion_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      producciones: {
        Row: {
          cantidad_buenas: number | null
          cantidad_plan: number
          costo_avios: number
          costo_maquila: number
          costo_tela: number
          costo_unitario: number | null
          creado_por: string | null
          created_at: string
          es_muestra: boolean
          estado: string
          etapas: Json
          fecha_entrega: string | null
          id: string
          inventariado_at: string | null
          nota: string | null
          producto_id: string
          token_cliente: string | null
          ubicacion_id: string
        }
        Insert: {
          cantidad_buenas?: number | null
          cantidad_plan: number
          costo_avios?: number
          costo_maquila?: number
          costo_tela?: number
          costo_unitario?: number | null
          creado_por?: string | null
          created_at?: string
          es_muestra?: boolean
          estado?: string
          etapas?: Json
          fecha_entrega?: string | null
          id?: string
          inventariado_at?: string | null
          nota?: string | null
          producto_id: string
          token_cliente?: string | null
          ubicacion_id: string
        }
        Update: {
          cantidad_buenas?: number | null
          cantidad_plan?: number
          costo_avios?: number
          costo_maquila?: number
          costo_tela?: number
          costo_unitario?: number | null
          creado_por?: string | null
          created_at?: string
          es_muestra?: boolean
          estado?: string
          etapas?: Json
          fecha_entrega?: string | null
          id?: string
          inventariado_at?: string | null
          nota?: string | null
          producto_id?: string
          token_cliente?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_fotos: {
        Row: {
          color_codigo: string | null
          created_at: string
          es_principal: boolean
          id: string
          orden: number
          producto_id: string
          url: string
        }
        Insert: {
          color_codigo?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          orden?: number
          producto_id: string
          url: string
        }
        Update: {
          color_codigo?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          orden?: number
          producto_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_fotos_color_codigo_fkey"
            columns: ["color_codigo"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "producto_fotos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          categoria_id: string | null
          codigo: string | null
          created_at: string
          descripcion: string | null
          estado: string
          id: string
          permitir_venta_sin_stock: boolean
          referencia: string
          stock_minimo: number | null
          temporada: string | null
          token_cliente: string | null
        }
        Insert: {
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          permitir_venta_sin_stock?: boolean
          referencia: string
          stock_minimo?: number | null
          temporada?: string | null
          token_cliente?: string | null
        }
        Update: {
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          permitir_venta_sin_stock?: boolean
          referencia?: string
          stock_minimo?: number | null
          temporada?: string | null
          token_cliente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      proformas: {
        Row: {
          cliente_nombre: string | null
          cliente_num_doc: string | null
          comprobante_id: string | null
          created_at: string
          estado: string
          id: string
          igv: number
          items: Json
          subtotal: number
          total: number
          ubicacion_id: string
          usuario_id: string | null
          vence_at: string | null
        }
        Insert: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items: Json
          subtotal?: number
          total: number
          ubicacion_id: string
          usuario_id?: string | null
          vence_at?: string | null
        }
        Update: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items?: Json
          subtotal?: number
          total?: number
          ubicacion_id?: string
          usuario_id?: string | null
          vence_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proformas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          contacto: string | null
          created_at: string
          id: string
          nombre: string
          ruc: string | null
        }
        Insert: {
          activo?: boolean
          contacto?: string | null
          created_at?: string
          id?: string
          nombre: string
          ruc?: string | null
        }
        Update: {
          activo?: boolean
          contacto?: string | null
          created_at?: string
          id?: string
          nombre?: string
          ruc?: string | null
        }
        Relationships: []
      }
      series_comprobantes: {
        Row: {
          id: string
          serie: string
          siguiente_numero: number
          tipo: string
          ubicacion_id: string
        }
        Insert: {
          id?: string
          serie: string
          siguiente_numero?: number
          tipo: string
          ubicacion_id: string
        }
        Update: {
          id?: string
          serie?: string
          siguiente_numero?: number
          tipo?: string
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_comprobantes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          cantidad: number
          sububicacion_id: string | null
          ubicacion_id: string
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad?: number
          sububicacion_id?: string | null
          ubicacion_id: string
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          sububicacion_id?: string | null
          ubicacion_id?: string
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sububicacion_pertenece_fk"
            columns: ["sububicacion_id", "ubicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "stock_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      sububicaciones: {
        Row: {
          created_at: string
          id: string
          nombre: string
          tipo: string | null
          ubicacion_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          tipo?: string | null
          ubicacion_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sububicaciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencia_items: {
        Row: {
          cantidad: number
          id: string
          movimiento_id: string | null
          transferencia_id: string
          variante_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          movimiento_id?: string | null
          transferencia_id: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          movimiento_id?: string | null
          transferencia_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencia_recepciones: {
        Row: {
          cantidad_recibida: number
          created_at: string
          id: string
          movimiento_id: string | null
          registrado_por: string | null
          transferencia_id: string
          variante_id: string
        }
        Insert: {
          cantidad_recibida: number
          created_at?: string
          id?: string
          movimiento_id?: string | null
          registrado_por?: string | null
          transferencia_id: string
          variante_id: string
        }
        Update: {
          cantidad_recibida?: number
          created_at?: string
          id?: string
          movimiento_id?: string | null
          registrado_por?: string | null
          transferencia_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_recepciones_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_recepciones_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_recepciones_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias: {
        Row: {
          cerrado_en: string | null
          cerrado_por: string | null
          confirmado_en: string | null
          confirmado_por: string | null
          creado_por: string | null
          created_at: string
          estado: string
          fecha_estimada_llegada: string | null
          id: string
          nota: string | null
          nota_cierre: string | null
          numero: number
          ubicacion_destino_id: string
          ubicacion_origen_id: string
        }
        Insert: {
          cerrado_en?: string | null
          cerrado_por?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          fecha_estimada_llegada?: string | null
          id?: string
          nota?: string | null
          nota_cierre?: string | null
          numero?: number
          ubicacion_destino_id: string
          ubicacion_origen_id: string
        }
        Update: {
          cerrado_en?: string | null
          cerrado_por?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          fecha_estimada_llegada?: string | null
          id?: string
          nota?: string | null
          nota_cierre?: string | null
          numero?: number
          ubicacion_destino_id?: string
          ubicacion_origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicacion_datos_fiscales: {
        Row: {
          departamento: string | null
          direccion: string | null
          distrito: string | null
          provincia: string | null
          telefono: string | null
          ubicacion_id: string
          ubigeo: string | null
          updated_at: string
        }
        Insert: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          telefono?: string | null
          ubicacion_id: string
          ubigeo?: string | null
          updated_at?: string
        }
        Update: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          telefono?: string | null
          ubicacion_id?: string
          ubigeo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ubicacion_datos_fiscales_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: true
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicaciones: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          sede_dynamic_id: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          sede_dynamic_id?: string | null
          tipo: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          sede_dynamic_id?: string | null
          tipo?: string
        }
        Relationships: []
      }
      variantes: {
        Row: {
          activo: boolean
          codigo: string | null
          color_codigo: string | null
          costo: number
          created_at: string
          id: string
          precio: number
          producto_id: string
          sku: string | null
          talla: string | null
        }
        Insert: {
          activo?: boolean
          codigo?: string | null
          color_codigo?: string | null
          costo?: number
          created_at?: string
          id?: string
          precio: number
          producto_id: string
          sku?: string | null
          talla?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string | null
          color_codigo?: string | null
          costo?: number
          created_at?: string
          id?: string
          precio?: number
          producto_id?: string
          sku?: string | null
          talla?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variantes_color_codigo_fkey"
            columns: ["color_codigo"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_anulacion_items: {
        Row: {
          condicion: string
          created_at: string
          id: string
          movimiento_id: string | null
          venta_id: string
          venta_item_id: string
        }
        Insert: {
          condicion: string
          created_at?: string
          id?: string
          movimiento_id?: string | null
          venta_id: string
          venta_item_id: string
        }
        Update: {
          condicion?: string
          created_at?: string
          id?: string
          movimiento_id?: string | null
          venta_id?: string
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_anulacion_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_anulacion_items_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_items: {
        Row: {
          argumento_descuento: string | null
          cantidad: number
          costo_unitario: number
          descuento_unitario: number
          id: string
          motivo_descuento: string | null
          motivo_descuento_detalle: string | null
          precio_unitario: number
          subtotal: number | null
          variante_id: string
          venta_id: string
        }
        Insert: {
          argumento_descuento?: string | null
          cantidad: number
          costo_unitario: number
          descuento_unitario?: number
          id?: string
          motivo_descuento?: string | null
          motivo_descuento_detalle?: string | null
          precio_unitario: number
          subtotal?: number | null
          variante_id: string
          venta_id: string
        }
        Update: {
          argumento_descuento?: string | null
          cantidad?: number
          costo_unitario?: number
          descuento_unitario?: number
          id?: string
          motivo_descuento?: string | null
          motivo_descuento_detalle?: string | null
          precio_unitario?: number
          subtotal?: number | null
          variante_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_pagos: {
        Row: {
          id: string
          metodo: string
          monto: number
          venta_id: string
        }
        Insert: {
          id?: string
          metodo: string
          monto: number
          venta_id: string
        }
        Update: {
          id?: string
          metodo?: string
          monto?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          anulado_en: string | null
          anulado_por: string | null
          caja_id: string | null
          cliente_id: string | null
          created_at: string
          estado: string
          id: string
          motivo_anulacion: string | null
          nota: string | null
          token_cliente: string | null
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          anulado_en?: string | null
          anulado_por?: string | null
          caja_id?: string | null
          cliente_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo_anulacion?: string | null
          nota?: string | null
          token_cliente?: string | null
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          anulado_en?: string | null
          anulado_por?: string | null
          caja_id?: string | null
          cliente_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo_anulacion?: string | null
          nota?: string | null
          token_cliente?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      compra_items_resumen: {
        Row: {
          cantidad: number | null
          compra_id: string | null
          costo_unitario: number | null
          descripcion: string | null
          id: string | null
          pendiente: number | null
          producto_id: string | null
          recibido: number | null
          subtotal: number | null
          variante_id: string | null
        }
        Insert: {
          cantidad?: number | null
          compra_id?: string | null
          costo_unitario?: number | null
          descripcion?: string | null
          id?: string | null
          pendiente?: never
          producto_id?: string | null
          recibido?: never
          subtotal?: number | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number | null
          compra_id?: string | null
          costo_unitario?: number | null
          descripcion?: string | null
          id?: string | null
          pendiente?: never
          producto_id?: string | null
          recibido?: never
          subtotal?: number | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_resumen: {
        Row: {
          condicion: string | null
          created_at: string | null
          documento: string | null
          estado: string | null
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string | null
          igv: number | null
          nota: string | null
          numero: string | null
          pagado: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          proveedor_ruc: string | null
          recibido_cantidad: number | null
          saldo: number | null
          serie: string | null
          subtotal: number | null
          tipo: string | null
          total: number | null
          ubicacion_destino_id: string | null
          vencida: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abrir_caja: {
        Args: { p_monto_apertura: number; p_ubicacion_id: string }
        Returns: string
      }
      abrir_conteo: {
        Args: {
          p_alcance?: string
          p_alcance_categoria_id?: string
          p_sububicacion_id?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      abrir_produccion: {
        Args: {
          p_costo_avios?: number
          p_costo_maquila?: number
          p_costo_tela?: number
          p_es_muestra?: boolean
          p_fecha_entrega?: string
          p_lineas: Json
          p_nota?: string
          p_producto_id: string
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      actualizar_categoria: {
        Args: {
          p_categoria_id: string
          p_familia: string
          p_nombre: string
          p_notas?: string
          p_prefijo: string
        }
        Returns: undefined
      }
      actualizar_mi_foto_perfil: {
        Args: { p_foto_url: string }
        Returns: undefined
      }
      actualizar_proveedor: {
        Args: {
          p_contacto?: string
          p_nombre: string
          p_proveedor_id: string
          p_ruc?: string
        }
        Returns: undefined
      }
      actualizar_transmision_comprobante: {
        Args: {
          p_comprobante_id: string
          p_entorno: string
          p_estado: string
          p_motivo_rechazo?: string
          p_respuesta_sunat?: Json
        }
        Returns: undefined
      }
      agregar_colaborador: {
        Args: { p_persona_id: string; p_ubicacion_id: string }
        Returns: undefined
      }
      anular_compra: {
        Args: { p_compra_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_comprobante: {
        Args: {
          p_comprobante_id: string
          p_confirmada: boolean
          p_motivo: string
          p_respuesta?: Json
        }
        Returns: undefined
      }
      anular_produccion: {
        Args: { p_motivo?: string; p_produccion_id: string }
        Returns: undefined
      }
      anular_venta: {
        Args: { p_items: Json; p_motivo: string; p_venta_id: string }
        Returns: undefined
      }
      aprobar_devolucion: {
        Args: {
          p_devolucion_id: string
          p_reembolso_metodo?: string
          p_reembolso_monto?: number
        }
        Returns: undefined
      }
      archivar_adjunto_compra: {
        Args: { p_adjunto_id: string }
        Returns: undefined
      }
      catalogo_actualizar_producto: {
        Args: {
          p_categoria_id?: string
          p_descripcion?: string
          p_estado: string
          p_fotos?: Json
          p_permitir_venta_sin_stock?: boolean
          p_producto_id: string
          p_referencia: string
          p_stock_minimo?: number
          p_temporada?: string
          p_variantes: Json
        }
        Returns: undefined
      }
      catalogo_crear_producto: {
        Args: {
          p_categoria_id?: string
          p_descripcion?: string
          p_fotos?: Json
          p_permitir_venta_sin_stock?: boolean
          p_referencia: string
          p_stock_minimo?: number
          p_temporada?: string
          p_variantes: Json
        }
        Returns: string
      }
      cerrar_caja: {
        Args: { p_caja_id: string; p_monto_real: number }
        Returns: {
          diferencia: number
          monto_real: number
          monto_sistema: number
        }[]
      }
      cerrar_conteo: {
        Args: { p_conteo_id: string }
        Returns: {
          lineas_ajustadas: number
          unidades_faltantes: number
          unidades_sobrantes: number
        }[]
      }
      cerrar_produccion: {
        Args: {
          p_buenas: Json
          p_costo_avios: number
          p_costo_maquila: number
          p_costo_tela: number
          p_produccion_id: string
        }
        Returns: undefined
      }
      cerrar_traslado_con_diferencia: {
        Args: { p_nota?: string; p_transferencia_id: string }
        Returns: {
          lineas_recibidas: number
          unidades_recibidas: number
        }[]
      }
      confirmar_traslado: {
        Args: { p_transferencia_id: string }
        Returns: {
          lineas_con_diferencia: number
          lineas_ok: number
          resultado: string
        }[]
      }
      conteo_contar: {
        Args: {
          p_cantidad_contada: number
          p_conteo_id: string
          p_variante_id: string
        }
        Returns: string
      }
      convertir_proforma_a_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_proforma_id: string
          p_tipo: string
          p_venta_id?: string
        }
        Returns: string
      }
      crear_devolucion: {
        Args: {
          p_items: Json
          p_motivo: string
          p_ubicacion_id: string
          p_venta_id: string
        }
        Returns: string
      }
      crear_producto_con_variantes: {
        Args: {
          p_categoria_id: string
          p_descripcion?: string
          p_referencia: string
          p_token?: string
          p_variantes: Json
        }
        Returns: string
      }
      crear_proforma: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_igv: number
          p_items: Json
          p_subtotal: number
          p_total: number
          p_ubicacion_id: string
          p_vence_at?: string
        }
        Returns: string
      }
      desactivar_categoria: {
        Args: { p_categoria_id: string }
        Returns: undefined
      }
      desactivar_proveedor: {
        Args: { p_proveedor_id: string }
        Returns: undefined
      }
      emitir_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_igv: number
          p_items?: Json
          p_subtotal: number
          p_tipo: string
          p_total: number
          p_ubicacion_id: string
          p_venta_id?: string
        }
        Returns: string
      }
      emitir_nota: {
        Args: {
          p_comprobante_original_id: string
          p_igv: number
          p_items?: Json
          p_motivo: string
          p_subtotal: number
          p_tipo: string
          p_total: number
        }
        Returns: string
      }
      fn_aplicar_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      fn_asignar_codigo_producto: {
        Args: { p_producto_id: string }
        Returns: string
      }
      fn_asignar_codigo_variante: {
        Args: { p_variante_id: string }
        Returns: string
      }
      fn_clave_texto: { Args: { p: string }; Returns: string }
      fn_colaboradores: {
        Args: never
        Returns: {
          agregado_en: string
          correo: string
          nombre: string
          persona_id: string
          rol: string
          sede: string
          ubicacion_asignada: string
        }[]
      }
      fn_conteos_resumen: {
        Args: { p_limite?: number; p_ubicacion_id: string }
        Returns: {
          abierto_por: string
          alcance: string
          alcance_categoria_nombre: string
          cerrado_en: string
          cerrado_por: string
          contado: number
          created_at: string
          diferencia: number
          estado: string
          id: string
          lineas: number
          lineas_con_diferencia: number
          numero: number
          sistema: number
          soles_diferencia: number
          sububicacion_id: string
          sububicacion_nombre: string
          sububicacion_tipo: string
        }[]
      }
      fn_costo_historial: {
        Args: { p_variante_id: string }
        Returns: {
          cantidad_nueva: number
          compra_documento: string
          costo_anterior: number
          costo_resultante: number
          costo_unitario_nuevo: number
          created_at: string
          id: string
          lote_guia: string
          origen: string
          produccion_referencia: string
          proveedor_nombre: string
          stock_previo: number
          usuario_nombre: string
        }[]
      }
      fn_dynamic_disponibles: {
        Args: never
        Returns: {
          correo: string
          nombre: string
          persona_id: string
          sede: string
        }[]
      }
      fn_es_lider: { Args: never; Returns: boolean }
      fn_historial_producto_cambios: {
        Args: { p_producto_id: string }
        Returns: {
          campo: string
          categoria_anterior_nombre: string
          categoria_nueva_nombre: string
          created_at: string
          entidad: string
          id: string
          usuario_id: string
          usuario_nombre: string
          valor_anterior: string
          valor_nuevo: string
          variante_color: string
          variante_id: string
          variante_sku: string
          variante_talla: string
        }[]
      }
      fn_mi_perfil: {
        Args: never
        Returns: {
          apellidos: string
          celular: string
          correo: string
          estado: string
          foto_url: string
          nombres: string
          persona_id: string
          rol: string
          ubicacion_nombre: string
          ultimo_acceso: string
        }[]
      }
      fn_movimientos: {
        Args: {
          p_busqueda?: string
          p_categoria?: string
          p_cursor_creado_en?: string
          p_cursor_id?: string
          p_desde?: string
          p_hasta?: string
          p_limite?: number
          p_motivo?: string
          p_producto_id?: string
          p_sububicacion_id?: string
          p_ubicacion_id: string
          p_usuario_id?: string
        }
        Returns: {
          cambio_diferencia: number
          cambio_id: string
          cantidad: number
          categoria: string
          color: string
          compra_documento: string
          compra_id: string
          comprobante_estado: string
          comprobante_numero: string
          comprobante_tipo: string
          conteo_cantidad_contada: number
          conteo_cantidad_sistema: number
          conteo_id: string
          created_at: string
          delta: number
          devolucion_estado: string
          devolucion_id: string
          devolucion_motivo: string
          es_sistema: boolean
          fecha_lima: string
          hora: string
          id: string
          lote_guia: string
          lote_id: string
          lote_nota: string
          motivo: string
          nota: string
          proveedor_nombre: string
          referencia: string
          sku: string
          sububicacion_destino_id: string
          sububicacion_destino_nombre: string
          sububicacion_destino_tipo: string
          sububicacion_id: string
          sububicacion_nombre: string
          sububicacion_tipo: string
          talla: string
          tipo: string
          transferencia_estado: string
          transferencia_id: string
          transferencia_nota: string
          ubicacion_destino_id: string
          ubicacion_destino_nombre: string
          ubicacion_id: string
          ubicacion_nombre: string
          usuario_id: string
          usuario_nombre: string
          variante_id: string
          venta_id: string
          venta_nota: string
        }[]
      }
      fn_movimientos_resumen: {
        Args: {
          p_busqueda?: string
          p_desde?: string
          p_hasta?: string
          p_motivo?: string
          p_sububicacion_id?: string
          p_ubicacion_id: string
          p_usuario_id?: string
        }
        Returns: {
          categoria: string
          delta: number
          movimientos: number
          unidades: number
        }[]
      }
      fn_movimientos_variantes: {
        Args: { p_busqueda: string }
        Returns: string[]
      }
      fn_nombres_personas: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          nombre: string
        }[]
      }
      fn_persona_actual_resumen: {
        Args: never
        Returns: {
          es_lider: boolean
          nombre: string
          ubicacion_id: string
          ubicacion_nombre: string
          ubicacion_tipo: string
        }[]
      }
      fn_prioridad_conteo: {
        Args: { p_alcance_categoria_id?: string; p_ubicacion_id: string }
        Returns: {
          color: string
          dias_sin_contar: number
          referencia: string
          sku: string
          talla: string
          valor_en_riesgo: number
          variante_id: string
        }[]
      }
      fn_productos: {
        Args: {
          p_busqueda?: string
          p_categoria_id?: string
          p_color_codigo?: string
          p_estado?: string
          p_orden?: string
          p_pagina?: number
          p_por_pagina?: number
          p_precio_max?: number
          p_precio_min?: number
          p_stock?: string
        }
        Returns: {
          activo: boolean
          categoria_id: string
          categoria_nombre: string
          codigo: string
          codigos_barras: string[]
          color_codigo: string
          color_hex: string
          color_nombre: string
          costo: number
          demanda_diaria: number
          estado: string
          foto_url: string
          lead_time_dias: number
          precio: number
          producto_id: string
          punto_reorden: number
          referencia: string
          reponer_de_proveedor: boolean
          sku: string
          stock_minimo: number
          stock_total: number
          talla: string
          total_productos: number
          variante_codigo: string
          variante_id: string
        }[]
      }
      fn_productos_buscar: { Args: { p_busqueda: string }; Returns: string[] }
      fn_productos_resumen: {
        Args: {
          p_busqueda?: string
          p_categoria_id?: string
          p_color_codigo?: string
          p_estado?: string
          p_precio_max?: number
          p_precio_min?: number
        }
        Returns: {
          reponer_de_proveedor: number
          sin_stock: number
          stock_bajo: number
          total_productos: number
          total_variantes: number
        }[]
      }
      fn_proveedores: {
        Args: never
        Returns: {
          activo: boolean
          contacto: string
          facturas: number
          id: string
          nombre: string
          ruc: string
          saldo: number
          ultima_compra: string
        }[]
      }
      fn_puede_operar_ubicacion: {
        Args: { p_ubicacion_id: string }
        Returns: boolean
      }
      fn_puede_registrar_compras: { Args: never; Returns: boolean }
      fn_recalcular_costo_variante: {
        Args: {
          p_cantidad_nueva: number
          p_costo_unitario_nuevo: number
          p_movimiento_id: string
          p_origen: string
          p_variante_id: string
        }
        Returns: number
      }
      fn_reservar_numero_serie: {
        Args: { p_tipo: string; p_ubicacion_id: string }
        Returns: {
          numero: number
          serie: string
        }[]
      }
      fn_siguiente_correlativo: { Args: { p_prefijo: string }; Returns: number }
      fn_stock_por_sede: {
        Args: never
        Returns: {
          cantidad: number
          ubicacion_id: string
          variante_id: string
        }[]
      }
      fn_sububicacion_por_defecto: {
        Args: { p_ubicacion_id: string; p_uso: string }
        Returns: string
      }
      fn_texto_o_null: { Args: { p: string }; Returns: string }
      fn_tiene_acceso_retail: { Args: never; Returns: boolean }
      fn_token_talla: { Args: { p_talla: string }; Returns: string }
      fn_traslado_lineas: {
        Args: { p_transferencia_id: string }
        Returns: {
          cantidad_enviada: number
          cantidad_recibida: number
          color: string
          diferencia: number
          referencia: string
          sku: string
          talla: string
          variante_id: string
        }[]
      }
      fn_ubicacion_actual_persona: { Args: never; Returns: string }
      fn_ventas_del_dia: {
        Args: { p_ubicacion_id?: string }
        Returns: {
          cliente_nombre: string
          comprobante_estado: string
          comprobante_texto: string
          comprobante_tipo: string
          hora: string
          items: Json
          metodos_pago: string
          nota: string
          total: number
          ubicacion_nombre: string
          vendedor: string
          venta_id: string
        }[]
      }
      iniciar_traslado: {
        Args: {
          p_fecha_estimada_llegada: string
          p_items: Json
          p_nota?: string
          p_ubicacion_destino_id: string
          p_ubicacion_origen_id: string
        }
        Returns: string
      }
      listar_compras: {
        Args: {
          p_busqueda?: string
          p_con_saldo?: boolean
          p_condicion?: string
          p_cursor_creado_en?: string
          p_cursor_fecha?: string
          p_cursor_id?: string
          p_desde?: string
          p_estado_pago?: string
          p_estado_recepcion?: string
          p_hasta?: string
          p_limite?: number
          p_orden?: string
          p_por_recibir?: boolean
          p_proveedor_id?: string
          p_solo_vencidas?: boolean
          p_solo_vigentes?: boolean
        }
        Returns: {
          condicion: string | null
          created_at: string | null
          documento: string | null
          estado: string | null
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string | null
          igv: number | null
          nota: string | null
          numero: string | null
          pagado: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          proveedor_ruc: string | null
          recibido_cantidad: number | null
          saldo: number | null
          serie: string | null
          subtotal: number | null
          tipo: string | null
          total: number | null
          ubicacion_destino_id: string | null
          vencida: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "compras_resumen"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mover_interno: {
        Args: {
          p_cantidad: number
          p_nota?: string
          p_sububicacion_destino_id: string
          p_sububicacion_origen_id: string
          p_ubicacion_id: string
          p_variante_id: string
        }
        Returns: string
      }
      previsualizar_cierre_conteo: {
        Args: { p_conteo_id: string }
        Returns: {
          codigo: string
          color: string
          contada: number
          diferencia: number
          origen: string
          referencia: string
          sistema: number
          talla: string
          variante_id: string
        }[]
      }
      quitar_colaborador: { Args: { p_persona_id: string }; Returns: undefined }
      reactivar_categoria: {
        Args: { p_categoria_id: string }
        Returns: undefined
      }
      reactivar_proveedor: {
        Args: { p_proveedor_id: string }
        Returns: undefined
      }
      recalcular_compras: { Args: never; Returns: undefined }
      recalcular_stock: { Args: never; Returns: undefined }
      rechazar_devolucion: {
        Args: { p_devolucion_id: string; p_motivo?: string }
        Returns: undefined
      }
      recibir_compras: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      recibir_lote: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_proveedor_id: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      registrar_adjunto_compra: {
        Args: {
          p_bytes: number
          p_compra_id: string
          p_nombre: string
          p_ruta: string
          p_tipo: string
        }
        Returns: string
      }
      registrar_cambio: {
        Args: {
          p_cantidad?: number
          p_metodo_pago_diferencia?: string
          p_token?: string
          p_ubicacion_id: string
          p_variante_nueva_id: string
          p_venta_item_id: string
        }
        Returns: string
      }
      registrar_compra: {
        Args: {
          p_condicion: string
          p_fecha_emision?: string
          p_fecha_vencimiento?: string
          p_igv_porcentaje?: number
          p_items: Json
          p_nota?: string
          p_numero: string
          p_pago?: Json
          p_proveedor_id: string
          p_serie: string
          p_tipo?: string
          p_token?: string
          p_total?: number
          p_ubicacion_destino_id: string
        }
        Returns: string
      }
      registrar_gasto: {
        Args: {
          p_categoria: string
          p_documento_numero?: string
          p_documento_serie?: string
          p_documento_tipo?: string
          p_especificacion?: string
          p_igv?: number
          p_metodo_pago: string
          p_proveedor_id?: string
          p_token?: string
          p_total: number
          p_ubicacion_id: string
        }
        Returns: string
      }
      registrar_movimiento:
        | {
            Args: {
              p_cantidad: number
              p_motivo?: string
              p_nota?: string
              p_tipo: string
              p_ubicacion_id: string
              p_variante_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_cantidad: number
              p_motivo?: string
              p_nota?: string
              p_sububicacion_id?: string
              p_tipo: string
              p_ubicacion_id: string
              p_variante_id: string
            }
            Returns: string
          }
      registrar_movimiento_caja: {
        Args: {
          p_caja_id: string
          p_es_ajuste?: boolean
          p_monto: number
          p_motivo: string
          p_nota?: string
          p_tipo: string
        }
        Returns: string
      }
      registrar_pago_compra: {
        Args: {
          p_compra_id: string
          p_fecha?: string
          p_metodo: string
          p_monto: number
          p_referencia?: string
        }
        Returns: string
      }
      registrar_pagos_compra: {
        Args: { p_compra_id: string; p_fecha?: string; p_pagos: Json }
        Returns: string[]
      }
      registrar_proveedor: {
        Args: { p_contacto?: string; p_nombre: string; p_ruc?: string }
        Returns: string
      }
      registrar_recepcion_traslado: {
        Args: {
          p_cantidad_recibida: number
          p_transferencia_id: string
          p_variante_id: string
        }
        Returns: string
      }
      registrar_serie_comprobante: {
        Args: {
          p_serie: string
          p_siguiente_numero?: number
          p_tipo: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      registrar_venta: {
        Args: {
          p_cliente_id?: string
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_codigo_descuento?: string
          p_items: Json
          p_nota?: string
          p_pagos: Json
          p_tipo_comprobante?: string
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      resumen_compras: {
        Args: never
        Returns: {
          con_saldo: number
          deuda: number
          por_recibir: number
          por_vencer: number
          por_vencer_monto: number
          registradas: number
          vencidas: number
          vencido: number
          vigentes: number
        }[]
      }
      revertir_produccion: {
        Args: { p_produccion_id: string }
        Returns: undefined
      }
      set_etapa_produccion: {
        Args: { p_estado: string; p_etapa: string; p_produccion_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  retail: {
    Enums: {},
  },
} as const

