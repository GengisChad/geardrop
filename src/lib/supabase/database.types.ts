export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
        }
        Relationships: []
      }
      bundle_items: {
        Row: {
          bundle_id: number
          product_id: number
          quantity: number
          sort_order: number
        }
        Insert: {
          bundle_id: number
          product_id: number
          quantity?: number
          sort_order?: number
        }
        Update: {
          bundle_id?: number
          product_id?: number
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          active: boolean
          compare_at_price_cents: number
          created_at: string
          description: string
          eyebrow: string
          hero_product_id: number
          id: number
          price_cents: number
          slug: string
          title_line_one: string
          title_line_two: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          compare_at_price_cents: number
          created_at?: string
          description: string
          eyebrow: string
          hero_product_id: number
          id?: never
          price_cents: number
          slug: string
          title_line_one: string
          title_line_two: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          compare_at_price_cents?: number
          created_at?: string
          description?: string
          eyebrow?: string
          hero_product_id?: number
          id?: never
          price_cents?: number
          slug?: string
          title_line_one?: string
          title_line_two?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundles_hero_product_id_fkey"
            columns: ["hero_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: number
          name: string
          slug: string
          sort_order: number
          tagline: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          id?: never
          name: string
          slug: string
          sort_order?: number
          tagline: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: never
          name?: string
          slug?: string
          sort_order?: number
          tagline?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: number
          customer_id: string | null
          discount_cents: number
          email_normalized: string
          id: number
          order_id: number
          redeemed_at: string
        }
        Insert: {
          coupon_id: number
          customer_id?: string | null
          discount_cents: number
          email_normalized: string
          id?: never
          order_id: number
          redeemed_at?: string
        }
        Update: {
          coupon_id?: number
          customer_id?: string | null
          discount_cents?: number
          email_normalized?: string
          id?: never
          order_id?: number
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          discount_kind: Database["public"]["Enums"]["discount_kind"]
          discount_value: number
          expires_at: string | null
          id: number
          maximum_discount_cents: number | null
          minimum_subtotal_cents: number
          starts_at: string | null
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          discount_kind: Database["public"]["Enums"]["discount_kind"]
          discount_value: number
          expires_at?: string | null
          id?: never
          maximum_discount_cents?: number | null
          minimum_subtotal_cents?: number
          starts_at?: string | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          discount_kind?: Database["public"]["Enums"]["discount_kind"]
          discount_value?: number
          expires_at?: string | null
          id?: never
          maximum_discount_cents?: number | null
          minimum_subtotal_cents?: number
          starts_at?: string | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          city: string
          country_code: string
          created_at: string
          customer_id: string
          id: number
          is_default: boolean
          label: string
          line_one: string
          line_two: string | null
          postal_code: string
          province: string
          recipient_name: string
          updated_at: string
        }
        Insert: {
          city: string
          country_code?: string
          created_at?: string
          customer_id: string
          id?: never
          is_default?: boolean
          label: string
          line_one: string
          line_two?: string | null
          postal_code: string
          province: string
          recipient_name: string
          updated_at?: string
        }
        Update: {
          city?: string
          country_code?: string
          created_at?: string
          customer_id?: string
          id?: never
          is_default?: boolean
          label?: string
          line_one?: string
          line_two?: string | null
          postal_code?: string
          province?: string
          recipient_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          actor_user_id: string | null
          created_at: string
          delta: number
          id: number
          note: string | null
          order_id: number | null
          product_id: number
          reason: Database["public"]["Enums"]["inventory_reason"]
          stock_after: number
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          delta: number
          id?: never
          note?: string | null
          order_id?: number | null
          product_id: number
          reason: Database["public"]["Enums"]["inventory_reason"]
          stock_after: number
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          delta?: number
          id?: never
          note?: string | null
          order_id?: number | null
          product_id?: number
          reason?: Database["public"]["Enums"]["inventory_reason"]
          stock_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_enablement_checks: {
        Row: {
          evidence: string | null
          key: string
          label: string
          status: Database["public"]["Enums"]["enablement_check_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          evidence?: string | null
          key: string
          label: string
          status?: Database["public"]["Enums"]["enablement_check_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          evidence?: string | null
          key?: string
          label?: string
          status?: Database["public"]["Enums"]["enablement_check_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: number
          image_src_snapshot: string
          line_total_cents: number
          order_id: number
          product_id: number | null
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          unit_price_cents: number
        }
        Insert: {
          id?: never
          image_src_snapshot: string
          line_total_cents: number
          order_id: number
          product_id?: number | null
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          unit_price_cents: number
        }
        Update: {
          id?: never
          image_src_snapshot?: string
          line_total_cents?: number
          order_id?: number
          product_id?: number | null
          product_name_snapshot?: string
          quantity?: number
          sku_snapshot?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address_snapshot: Json
          coupon_code: string | null
          created_at: string
          currency: string
          customer_id: string | null
          discount_cents: number
          email: string
          id: number
          idempotency_key: string
          notes: string | null
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          shipping_address_snapshot: Json
          shipping_cents: number
          shipping_method_code: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          billing_address_snapshot: Json
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_cents?: number
          email: string
          id?: never
          idempotency_key: string
          notes?: string | null
          order_number: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          shipping_address_snapshot: Json
          shipping_cents: number
          shipping_method_code: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at?: string
        }
        Update: {
          billing_address_snapshot?: Json
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_cents?: number
          email?: string
          id?: never
          idempotency_key?: string
          notes?: string | null
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          shipping_address_snapshot?: Json
          shipping_cents?: number
          shipping_method_code?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_box_contents: {
        Row: {
          content: string
          id: number
          product_id: number
          sort_order: number
        }
        Insert: {
          content: string
          id?: never
          product_id: number
          sort_order?: number
        }
        Update: {
          content?: string
          id?: never
          product_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_box_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_features: {
        Row: {
          description: string
          id: number
          product_id: number
          sort_order: number
          title: string
        }
        Insert: {
          description: string
          id?: never
          product_id: number
          sort_order?: number
          title: string
        }
        Update: {
          description?: string
          id?: never
          product_id?: number
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string
          height: number
          id: number
          product_id: number
          published: boolean
          sort_order: number
          src: string
          width: number
        }
        Insert: {
          alt: string
          height: number
          id?: never
          product_id: number
          published?: boolean
          sort_order?: number
          src: string
          width: number
        }
        Update: {
          alt?: string
          height?: number
          id?: never
          product_id?: number
          published?: boolean
          sort_order?: number
          src?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_relations: {
        Row: {
          product_id: number
          related_product_id: number
          relation_type: Database["public"]["Enums"]["product_relation_type"]
          sort_order: number
        }
        Insert: {
          product_id: number
          related_product_id: number
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
        }
        Update: {
          product_id?: number
          related_product_id?: number
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_specs: {
        Row: {
          id: number
          label: string
          product_id: number
          sort_order: number
          value: string
        }
        Insert: {
          id?: never
          label: string
          product_id: number
          sort_order?: number
          value: string
        }
        Update: {
          id?: never
          label?: string
          product_id?: number
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_specs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: number
          tag: Database["public"]["Enums"]["promo_tag"]
        }
        Insert: {
          product_id: number
          tag: Database["public"]["Enums"]["promo_tag"]
        }
        Update: {
          product_id?: number
          tag?: Database["public"]["Enums"]["promo_tag"]
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          availability_override:
            | Database["public"]["Enums"]["availability_override"]
            | null
          blade_type: Database["public"]["Enums"]["blade_type"] | null
          category_id: number
          compare_at_price_cents: number | null
          created_at: string
          currency: string
          description: string
          id: number
          is_purchasable: boolean | null
          name: string
          preorder_allocation: number
          price_cents: number
          publication_status: Database["public"]["Enums"]["publication_status"]
          rating: number
          review_count: number
          sku: string
          slug: string
          sort_order: number
          stock_quantity: number
          stock_status: Database["public"]["Enums"]["stock_status"]
          tagline: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          availability_override?:
            | Database["public"]["Enums"]["availability_override"]
            | null
          blade_type?: Database["public"]["Enums"]["blade_type"] | null
          category_id: number
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          description: string
          id?: never
          is_purchasable?: boolean | null
          name: string
          preorder_allocation?: number
          price_cents: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          rating?: number
          review_count?: number
          sku: string
          slug: string
          sort_order?: number
          stock_quantity?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          tagline: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          availability_override?:
            | Database["public"]["Enums"]["availability_override"]
            | null
          blade_type?: Database["public"]["Enums"]["blade_type"] | null
          category_id?: number
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          description?: string
          id?: never
          is_purchasable?: boolean | null
          name?: string
          preorder_allocation?: number
          price_cents?: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          rating?: number
          review_count?: number
          sku?: string
          slug?: string
          sort_order?: number
          stock_quantity?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          tagline?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          active: boolean
          code: string
          free_from_cents: number | null
          id: number
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          free_from_cents?: number | null
          id?: never
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          free_from_cents?: number | null
          id?: never
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          accept_orders: boolean
          currency: string
          max_quantity_per_line: number
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accept_orders?: boolean
          currency?: string
          max_quantity_per_line?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accept_orders?: boolean
          currency?: string
          max_quantity_per_line?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          display_name: string
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          display_name: string
          role: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_inventory: {
        Args: {
          p_delta: number
          p_note?: string
          p_reason: Database["public"]["Enums"]["inventory_reason"]
          p_sku: string
        }
        Returns: number
      }
    }
    Enums: {
      availability_override: "preorder" | "incoming"
      blade_type: "attacco" | "difesa" | "stamina" | "bilanciato"
      discount_kind: "percentage" | "fixed"
      enablement_check_status: "pending" | "passed" | "failed"
      inventory_reason:
        | "initial"
        | "manual_adjustment"
        | "order_reserved"
        | "order_cancelled"
        | "return"
        | "damage"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "completed"
        | "cancelled"
      payment_status: "pending" | "authorized" | "paid" | "failed" | "refunded"
      product_relation_type: "related" | "upsell"
      promo_tag: "novita" | "offerta" | "limited" | "esclusiva"
      publication_status: "draft" | "published" | "archived"
      staff_role: "owner" | "admin" | "editor"
      stock_status: "disponibile" | "in-arrivo" | "pre-ordine" | "esaurito"
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
  public: {
    Enums: {
      availability_override: ["preorder", "incoming"],
      blade_type: ["attacco", "difesa", "stamina", "bilanciato"],
      discount_kind: ["percentage", "fixed"],
      enablement_check_status: ["pending", "passed", "failed"],
      inventory_reason: [
        "initial",
        "manual_adjustment",
        "order_reserved",
        "order_cancelled",
        "return",
        "damage",
      ],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "completed",
        "cancelled",
      ],
      payment_status: ["pending", "authorized", "paid", "failed", "refunded"],
      product_relation_type: ["related", "upsell"],
      promo_tag: ["novita", "offerta", "limited", "esclusiva"],
      publication_status: ["draft", "published", "archived"],
      staff_role: ["owner", "admin", "editor"],
      stock_status: ["disponibile", "in-arrivo", "pre-ordine", "esaurito"],
    },
  },
} as const

