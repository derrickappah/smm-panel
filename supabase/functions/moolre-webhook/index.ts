import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const MOOLRE_WEBHOOK_SECRET = Deno.env.get("MOOLRE_WEBHOOK_SECRET");
  const payload = await req.json();
  const data = payload?.data ?? payload;
  if (MOOLRE_WEBHOOK_SECRET && data.secret !== MOOLRE_WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  if (Number(data.txstatus) === 1) {
    await supabase.rpc("approve_deposit_transaction_universal_v2", {
      p_transaction_id: data.externalref, // assuming externalref is the internal ID if not found by ref
      p_payment_method: "moolre",
      p_payment_status: "success",
      p_payment_reference: data.externalref,
      p_actual_amount: data.value || data.amount
    });
  }
  return new Response("OK", { status: 200 });
});
