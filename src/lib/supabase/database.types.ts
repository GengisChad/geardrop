/**
 * Types for the schema in supabase/migrations. Authored to match those files and shaped
 * exactly like `supabase gen types typescript` output, so regenerating over it is a
 * no-op diff once the database exists:
 *
 *   pnpm dlx supabase gen types typescript --project-id <ref> --schema public \
 *     > src/lib/supabase/database.types.ts
 *
 * Relationships are listed because PostgREST embedded selects (`products(*, product_images(*))`)
 * are type-checked against them. Foreign keys to `auth.users` are omitted: that table is
 * outside the exposed schema and never embedded.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: number;
          slug: string;
          name: string;
          tagline: string;
          description: string;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          slug: string;
          name: string;
          tagline?: string;
          description?: string;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          slug?: string;
          name?: string;
          tagline?: string;
          description?: string;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: number;
          category_id: number;
          slug: string;
          sku: string;
          name: string;
          tagline: string;
          description: string;
          price_cents: number;
          compare_at_price_cents: number | null;
          currency: string;
          publication_status: string;
          active: boolean;
          stock_status: string;
          stock_quantity: number;
          blade_type: string | null;
          rating: number;
          review_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          category_id: number;
          slug: string;
          sku: string;
          name: string;
          tagline?: string;
          description?: string;
          price_cents: number;
          compare_at_price_cents?: number | null;
          currency?: string;
          publication_status?: string;
          active?: boolean;
          stock_status: string;
          stock_quantity?: number;
          blade_type?: string | null;
          rating?: number;
          review_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          category_id?: number;
          slug?: string;
          sku?: string;
          name?: string;
          tagline?: string;
          description?: string;
          price_cents?: number;
          compare_at_price_cents?: number | null;
          currency?: string;
          publication_status?: string;
          active?: boolean;
          stock_status?: string;
          stock_quantity?: number;
          blade_type?: string | null;
          rating?: number;
          review_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          id: number;
          product_id: number;
          path: string;
          width: number;
          height: number;
          alt: string;
          sort_order: number;
          published: boolean;
        };
        Insert: {
          id?: never;
          product_id: number;
          path: string;
          width: number;
          height: number;
          alt?: string;
          sort_order?: number;
          published?: boolean;
        };
        Update: {
          id?: never;
          product_id?: number;
          path?: string;
          width?: number;
          height?: number;
          alt?: string;
          sort_order?: number;
          published?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_specs: {
        Row: { id: number; product_id: number; label: string; value: string; sort_order: number };
        Insert: { id?: never; product_id: number; label: string; value: string; sort_order?: number };
        Update: { id?: never; product_id?: number; label?: string; value?: string; sort_order?: number };
        Relationships: [
          {
            foreignKeyName: "product_specs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_features: {
        Row: { id: number; product_id: number; title: string; description: string; sort_order: number };
        Insert: { id?: never; product_id: number; title: string; description?: string; sort_order?: number };
        Update: { id?: never; product_id?: number; title?: string; description?: string; sort_order?: number };
        Relationships: [
          {
            foreignKeyName: "product_features_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_box_contents: {
        Row: { id: number; product_id: number; content: string; sort_order: number };
        Insert: { id?: never; product_id: number; content: string; sort_order?: number };
        Update: { id?: never; product_id?: number; content?: string; sort_order?: number };
        Relationships: [
          {
            foreignKeyName: "product_box_contents_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_tags: {
        Row: { product_id: number; tag: string };
        Insert: { product_id: number; tag: string };
        Update: { product_id?: number; tag?: string };
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_relations: {
        Row: { product_id: number; related_product_id: number; sort_order: number };
        Insert: { product_id: number; related_product_id: number; sort_order?: number };
        Update: { product_id?: number; related_product_id?: number; sort_order?: number };
        Relationships: [
          {
            foreignKeyName: "product_relations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey";
            columns: ["related_product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      bundles: {
        Row: {
          id: number;
          slug: string;
          eyebrow: string;
          title_line_1: string;
          title_line_2: string;
          description: string;
          price_cents: number;
          compare_at_price_cents: number | null;
          hero_product_id: number | null;
          publication_status: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          slug: string;
          eyebrow?: string;
          title_line_1: string;
          title_line_2: string;
          description?: string;
          price_cents: number;
          compare_at_price_cents?: number | null;
          hero_product_id?: number | null;
          publication_status?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          slug?: string;
          eyebrow?: string;
          title_line_1?: string;
          title_line_2?: string;
          description?: string;
          price_cents?: number;
          compare_at_price_cents?: number | null;
          hero_product_id?: number | null;
          publication_status?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bundles_hero_product_id_fkey";
            columns: ["hero_product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      bundle_items: {
        Row: { bundle_id: number; product_id: number; quantity: number; sort_order: number };
        Insert: { bundle_id: number; product_id: number; quantity?: number; sort_order?: number };
        Update: { bundle_id?: number; product_id?: number; quantity?: number; sort_order?: number };
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey";
            columns: ["bundle_id"];
            isOneToOne: false;
            referencedRelation: "bundles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      store_settings: {
        Row: {
          id: number;
          checkout_enabled: boolean;
          max_quantity_per_line: number;
          default_currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          checkout_enabled?: boolean;
          max_quantity_per_line?: number;
          default_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          checkout_enabled?: boolean;
          max_quantity_per_line?: number;
          default_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shipping_methods: {
        Row: {
          code: string;
          label: string;
          delivery_hint: string;
          price_cents: number;
          free_shipping_threshold_cents: number | null;
          active: boolean;
          sort_order: number;
        };
        Insert: {
          code: string;
          label: string;
          delivery_hint?: string;
          price_cents: number;
          free_shipping_threshold_cents?: number | null;
          active?: boolean;
          sort_order?: number;
        };
        Update: {
          code?: string;
          label?: string;
          delivery_hint?: string;
          price_cents?: number;
          free_shipping_threshold_cents?: number | null;
          active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          id: number;
          code: string;
          discount_kind: string;
          discount_value: number;
          min_subtotal_cents: number | null;
          max_redemptions: number | null;
          redemption_count: number;
          starts_at: string | null;
          ends_at: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          code: string;
          discount_kind: string;
          discount_value: number;
          min_subtotal_cents?: number | null;
          max_redemptions?: number | null;
          redemption_count?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          code?: string;
          discount_kind?: string;
          discount_value?: number;
          min_subtotal_cents?: number | null;
          max_redemptions?: number | null;
          redemption_count?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      coupon_redemptions: {
        Row: {
          id: number;
          coupon_id: number;
          order_id: number;
          customer_id: string | null;
          customer_email: string | null;
          redeemed_at: string;
        };
        Insert: {
          id?: never;
          coupon_id: number;
          order_id: number;
          customer_id?: string | null;
          customer_email?: string | null;
          redeemed_at?: string;
        };
        Update: {
          id?: never;
          coupon_id?: number;
          order_id?: number;
          customer_id?: string | null;
          customer_email?: string | null;
          redeemed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_profiles: {
        Row: {
          user_id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_addresses: {
        Row: {
          id: number;
          user_id: string;
          label: string | null;
          recipient_name: string;
          line1: string;
          line2: string | null;
          city: string;
          province: string;
          postal_code: string;
          country: string;
          phone: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          user_id: string;
          label?: string | null;
          recipient_name?: string;
          line1?: string;
          line2?: string | null;
          city?: string;
          province?: string;
          postal_code?: string;
          country?: string;
          phone?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          label?: string | null;
          recipient_name?: string;
          line1?: string;
          line2?: string | null;
          city?: string;
          province?: string;
          postal_code?: string;
          country?: string;
          phone?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_profiles: {
        Row: {
          user_id: string;
          role: string;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          role: string;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          role?: string;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: number;
          order_number: string;
          idempotency_key: string;
          customer_id: string | null;
          customer_email: string;
          customer_phone: string | null;
          status: string;
          payment_status: string;
          payment_method: string;
          shipping_method_code: string | null;
          shipping_method_label: string;
          subtotal_cents: number;
          discount_cents: number;
          shipping_cents: number;
          total_cents: number;
          currency: string;
          coupon_id: number | null;
          coupon_code: string | null;
          shipping_address: Json;
          billing_address: Json | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          order_number: string;
          idempotency_key: string;
          customer_id?: string | null;
          customer_email: string;
          customer_phone?: string | null;
          status?: string;
          payment_status?: string;
          payment_method?: string;
          shipping_method_code?: string | null;
          shipping_method_label?: string;
          subtotal_cents: number;
          discount_cents?: number;
          shipping_cents?: number;
          total_cents: number;
          currency?: string;
          coupon_id?: number | null;
          coupon_code?: string | null;
          shipping_address: Json;
          billing_address?: Json | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          order_number?: string;
          idempotency_key?: string;
          customer_id?: string | null;
          customer_email?: string;
          customer_phone?: string | null;
          status?: string;
          payment_status?: string;
          payment_method?: string;
          shipping_method_code?: string | null;
          shipping_method_label?: string;
          subtotal_cents?: number;
          discount_cents?: number;
          shipping_cents?: number;
          total_cents?: number;
          currency?: string;
          coupon_id?: number | null;
          coupon_code?: string | null;
          shipping_address?: Json;
          billing_address?: Json | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_shipping_method_code_fkey";
            columns: ["shipping_method_code"];
            isOneToOne: false;
            referencedRelation: "shipping_methods";
            referencedColumns: ["code"];
          },
        ];
      };
      order_items: {
        Row: {
          id: number;
          order_id: number;
          product_id: number | null;
          sku: string;
          product_name: string;
          image_path: string | null;
          unit_price_cents: number;
          quantity: number;
          line_subtotal_cents: number;
          line_discount_cents: number;
          line_total_cents: number;
        };
        Insert: {
          id?: never;
          order_id: number;
          product_id?: number | null;
          sku: string;
          product_name: string;
          image_path?: string | null;
          unit_price_cents: number;
          quantity: number;
          line_subtotal_cents: number;
          line_discount_cents?: number;
          line_total_cents: number;
        };
        Update: {
          id?: never;
          order_id?: number;
          product_id?: number | null;
          sku?: string;
          product_name?: string;
          image_path?: string | null;
          unit_price_cents?: number;
          quantity?: number;
          line_subtotal_cents?: number;
          line_discount_cents?: number;
          line_total_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          id: number;
          product_id: number;
          quantity_delta: number;
          reason: string;
          order_id: number | null;
          actor_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          product_id: number;
          quantity_delta: number;
          reason: string;
          order_id?: number | null;
          actor_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          product_id?: number;
          quantity_delta?: number;
          reason?: string;
          order_id?: number | null;
          actor_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_data: Json | null;
          after_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          before_data?: Json | null;
          after_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          before_data?: Json | null;
          after_data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_order: {
        Args: { payload: Json };
        Returns: Json;
      };
      admin_set_order_status: {
        Args: {
          p_order_id: number;
          p_status: string;
          p_payment_status?: string | null;
          p_note?: string | null;
        };
        Returns: Json;
      };
      admin_adjust_stock: {
        Args: { p_product_id: number; p_delta: number; p_reason?: string; p_note?: string | null };
        Returns: Json;
      };
      owner_upsert_staff: {
        Args: { p_email: string; p_role: string; p_active?: boolean };
        Returns: Json;
      };
      owner_list_staff: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
