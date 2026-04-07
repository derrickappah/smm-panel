import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const CRON_SECRET_TOKEN = Deno.env.get("CRON_SECRET_TOKEN");
  if (CRON_SECRET_TOKEN && !authHeader.includes(CRON_SECRET_TOKEN)) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: pending } = await supabase.from("transactions").select("id, amount, created_at").eq("status", "pending").eq("deposit_method", "paystack").is("paystack_reference", null);

  for (const tx of pending || []) {
    const from = new Date(new Date(tx.created_at).getTime() - 60000).toISOString();
    const to = new Date(new Date(tx.created_at).getTime() + 120000).toISOString();
    const resp = await fetch(`https://api.paystack.co/transaction?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}` } });
    const data = await resp.json();
    const match = data?.data?.find(p => Math.abs((p.amount / 100) - tx.amount) < 0.01 && p.status === "success");
    if (match) {
      await supabase.from("transactions").update({ paystack_reference: match.reference }).eq("id", tx.id);
      await supabase.rpc("approve_deposit_transaction_universal_v2", { p_transaction_id: tx.id, p_payment_method: "paystack", p_payment_status: "success", p_payment_reference: match.reference, p_actual_amount: match.amount / 100 });
    }
  }
  return new Response("OK", { status: 200 });
});
