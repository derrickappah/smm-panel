import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  const rawBodyBuffer = await req.arrayBuffer();
  const rawBody = new TextDecoder().decode(rawBodyBuffer);
  const signature = req.headers.get("x-paystack-signature") ?? "";

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(PAYSTACK_SECRET_KEY), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, rawBodyBuffer);
  const hash = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

  if (hash !== signature) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(rawBody);
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  if (event.event === "charge.success") {
    const { reference, amount, metadata } = event.data;
    await supabase.rpc("approve_deposit_transaction_universal_v2", {
      p_transaction_id: metadata?.transaction_id,
      p_payment_method: "paystack",
      p_payment_status: "success",
      p_payment_reference: reference,
      p_actual_amount: amount / 100,
      p_provider_event_id: String(event.id)
    });
  }
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
