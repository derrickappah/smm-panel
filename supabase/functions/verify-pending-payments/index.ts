import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  const authHeader = req.headers.get("Authorization") ?? "";
  const CRON_SECRET_TOKEN = Deno.env.get("CRON_SECRET_TOKEN");
  if (CRON_SECRET_TOKEN && !authHeader.includes(CRON_SECRET_TOKEN)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // 1. Expire all pending deposits older than 30 minutes in a single batch update query
    const { error: expireErr, count: expiredCount } = await supabase
      .from("transactions")
      .update({ status: "expired" }, { count: "exact" })
      .eq("status", "pending")
      .in("deposit_method", ["paystack", "korapay", "moolre", "moolre_web", "hubtel"])
      .lt("created_at", thirtyMinutesAgo);

    if (expireErr) throw expireErr;

    // 2. Fetch only recent pending paystack/korapay transactions (less than 30 minutes old) to verify
    const { data: transactions, error: fetchErr } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "pending")
      .in("deposit_method", ["paystack", "korapay"])
      .gt("created_at", thirtyMinutesAgo)
      .order("created_at", { ascending: false });

    if (fetchErr) throw fetchErr;

    const results = { 
      processed: 0, 
      approved: 0, 
      rejected: 0, 
      expired: expiredCount || 0, 
      errors: [] as any[]
    };

    for (const tx of transactions || []) {
      results.processed++;
      try {
        if (tx.deposit_method === "paystack") await verifyPaystack(tx, supabase, results);
        else if (tx.deposit_method === "korapay") await verifyKorapay(tx, supabase, results);
      } catch (e) {
        results.errors.push({ tx_id: tx.id, error: (e as Error).message });
      }
    }
    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});

async function verifyPaystack(tx: any, supabase: any, results: any) {
  const ref = tx.paystack_reference;
  if (!ref) return;
  const resp = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, { headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}` } });
  const data = resp.ok ? await resp.json() : null;
  if (data?.data?.status === "success") {
    const { data: res } = await supabase.rpc("approve_deposit_transaction_universal_v2", { p_transaction_id: tx.id, p_payment_method: "paystack", p_payment_status: "success", p_payment_reference: ref, p_actual_amount: data.data.amount / 100 });
    if (res?.[0]?.success) results.approved++;
  } else if (data?.data?.status === "failed" || data?.data?.status === "abandoned") {
    await supabase.from("transactions").update({ status: "rejected", paystack_status: data.data.status }).eq("id", tx.id);
    results.rejected++;
  }
}

async function verifyKorapay(tx: any, supabase: any, results: any) {
  const ref = tx.korapay_reference;
  if (!ref) return;
  const resp = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${ref}`, { headers: { Authorization: `Bearer ${Deno.env.get("KORAPAY_SECRET_KEY")}` } });
  const data = resp.ok ? await resp.json() : null;
  if (data?.data?.status === "success") {
    const { data: res } = await supabase.rpc("approve_deposit_transaction_universal_v2", { p_transaction_id: tx.id, p_payment_method: "korapay", p_payment_status: "success", p_payment_reference: ref, p_actual_amount: data.data.amount });
    if (res?.[0]?.success) results.approved++;
  }
}
