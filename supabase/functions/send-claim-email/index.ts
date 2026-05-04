/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  slotId?: string;
  clientName?: string;
  clientPhone?: string;
};

type SlotWithBusiness = {
  id: string;
  business_id: string | null;
  business_name: string | null;
  service_name: string | null;
  slot_date: string | null;
  slot_time: string | null;
  price: string | null;
  note: string | null;
  businesses:
    | {
        business_name?: string | null;
        phone?: string | null;
        email?: string | null;
      }
    | {
        business_name?: string | null;
        phone?: string | null;
        email?: string | null;
      }[]
    | null;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "";

  try {
    return new Date(date).toLocaleDateString("he-IL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return date || "";
  }
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function getBusinessFromSlot(slot: SlotWithBusiness) {
  if (Array.isArray(slot.businesses)) {
    return slot.businesses[0] ?? null;
  }

  return slot.businesses ?? null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;

    const slotId = String(body.slotId || "").trim();
    const clientName = String(body.clientName || "").trim();
    const clientPhone = String(body.clientPhone || "").trim();

    if (!slotId || !clientName || !clientPhone) {
      return jsonResponse(
        {
          error: "Missing slotId, clientName, or clientPhone",
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("RESEND_FROM_EMAIL") || "TorPool <onboarding@resend.dev>";
    const siteUrl = Deno.env.get("SITE_URL") || "https://torpool.vercel.app";

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
      console.error("Missing env vars", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
        hasResendApiKey: Boolean(resendApiKey),
      });

      return jsonResponse(
        {
          error: "Missing server environment variables",
        },
        500,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: slotData, error: slotError } = await supabaseAdmin
      .from("slots")
      .select(
        `
          id,
          business_id,
          business_name,
          service_name,
          slot_date,
          slot_time,
          price,
          note,
          businesses (
            business_name,
            phone,
            email
          )
        `,
      )
      .eq("id", slotId)
      .single();

    if (slotError || !slotData) {
      console.error("Slot not found", slotError);
      return jsonResponse({ error: "Slot not found" }, 404);
    }

    const slot = slotData as SlotWithBusiness;
    const business = getBusinessFromSlot(slot);
    const businessEmail = business?.email || null;

    if (!businessEmail) {
      console.log("Business has no email", {
        slotId,
        businessId: slot.business_id,
      });

      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "Business has no email",
      });
    }

    const dashboardUrl = siteUrl;
    const slotUrl = `${siteUrl}/?slot=${encodeURIComponent(slot.id)}`;

    const subject = `בקשה חדשה לתור שהתפנה - ${slot.service_name || "תור"}`;

    const businessName =
      slot.business_name || business?.business_name || "העסק שלך";

    const priceHtml = slot.price
      ? `<p style="margin:0 0 6px;"><strong>מחיר:</strong> ${escapeHtml(
          slot.price,
        )} ₪</p>`
      : "";

    const noteHtml = slot.note
      ? `<p style="margin:0;"><strong>הערה:</strong> ${escapeHtml(
          slot.note,
        )}</p>`
      : "";

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; background:#faf7fb; padding:24px; color:#211827;">
        <div style="max-width:620px; margin:0 auto; background:#ffffff; border-radius:18px; padding:24px; border:1px solid #eadce7;">
          <h1 style="margin:0 0 12px; font-size:26px; color:#be185d;">
            יש לך בקשה חדשה לתור שהתפנה
          </h1>

          <p style="font-size:16px; line-height:1.7; margin:0 0 20px;">
            לקוחה השאירה פרטים דרך תורפול ומחכה לאישור שלך.
          </p>

          <div style="background:#fff4fa; border:1px solid #f5c9df; border-radius:14px; padding:16px; margin-bottom:18px;">
            <h2 style="font-size:18px; margin:0 0 10px;">פרטי הלקוחה</h2>
            <p style="margin:0 0 6px;"><strong>שם:</strong> ${escapeHtml(
              clientName,
            )}</p>
            <p style="margin:0;"><strong>טלפון:</strong> ${escapeHtml(
              clientPhone,
            )}</p>
          </div>

          <div style="background:#f8f5fb; border:1px solid #eadce7; border-radius:14px; padding:16px; margin-bottom:22px;">
            <h2 style="font-size:18px; margin:0 0 10px;">פרטי התור</h2>
            <p style="margin:0 0 6px;"><strong>עסק:</strong> ${escapeHtml(
              businessName,
            )}</p>
            <p style="margin:0 0 6px;"><strong>טיפול:</strong> ${escapeHtml(
              slot.service_name,
            )}</p>
            <p style="margin:0 0 6px;"><strong>תאריך:</strong> ${escapeHtml(
              formatDate(slot.slot_date),
            )}</p>
            <p style="margin:0 0 6px;"><strong>שעה:</strong> ${escapeHtml(
              formatTime(slot.slot_time),
            )}</p>
            ${priceHtml}
            ${noteHtml}
          </div>

          <a href="${escapeHtml(
            dashboardUrl,
          )}" style="display:inline-block; background:#ec4899; color:#ffffff; text-decoration:none; font-weight:700; padding:12px 18px; border-radius:12px;">
            פתחי את תורפול
          </a>

          <a href="${escapeHtml(
            slotUrl,
          )}" style="display:inline-block; color:#be185d; text-decoration:none; font-weight:700; padding:12px 18px;">
            פתיחת התור
          </a>

          <p style="font-size:13px; color:#7c6f7a; margin-top:24px;">
            ההודעה נשלחה אוטומטית מתורפול.
          </p>
        </div>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [businessEmail],
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend failed", resendData);

      return jsonResponse(
        {
          error: "Resend failed",
          details: resendData,
        },
        500,
      );
    }

    console.log("Email sent successfully", {
      to: businessEmail,
      slotId,
      resendData,
    });

    return jsonResponse({
      ok: true,
      emailSent: true,
      to: businessEmail,
      resendData,
    });
  } catch (error) {
    console.error("Unexpected server error", error);

    return jsonResponse(
      {
        error: "Unexpected server error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});