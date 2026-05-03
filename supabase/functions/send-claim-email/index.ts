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

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date: string | null | undefined) {
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

function formatTime(time: string | null | undefined) {
  if (!time) return "";
  return time.slice(0, 5);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const body = (await req.json()) as RequestBody;

    const slotId = String(body.slotId || "").trim();
    const clientName = String(body.clientName || "").trim();
    const clientPhone = String(body.clientPhone || "").trim();

    if (!slotId || !clientName || !clientPhone) {
      return new Response(
        JSON.stringify({
          error: "Missing slotId, clientName, or clientPhone",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
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

      return new Response(
        JSON.stringify({
          error: "Missing server environment variables",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: slot, error: slotError } = await supabaseAdmin
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
      `
      )
      .eq("id", slotId)
      .single();

    if (slotError || !slot) {
      console.error("Slot not found", slotError);

      return new Response(JSON.stringify({ error: "Slot not found" }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const business = Array.isArray(slot.businesses)
      ? slot.businesses[0]
      : slot.businesses;

    const businessEmail = business?.email;

    if (!businessEmail) {
      console.log("Business has no email", {
        slotId,
        businessId: slot.business_id,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "Business has no email",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const dashboardUrl = siteUrl;
    const slotUrl = `${siteUrl}/?slot=${encodeURIComponent(slot.id)}`;

    const subject = `בקשה חדשה לתור שהתפנה - ${slot.service_name}`;

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
            <p style="margin:0 0 6px;"><strong>שם:</strong> ${escapeHtml(clientName)}</p>
            <p style="margin:0;"><strong>טלפון:</strong> ${escapeHtml(clientPhone)}</p>
          </div>

          <div style="background:#f8f5fb; border:1px solid #eadce7; border-radius:14px; padding:16px; margin-bottom:22px;">
            <h2 style="font-size:18px; margin:0 0 10px;">פרטי התור</h2>
            <p style="margin:0 0 6px;"><strong>עסק:</strong> ${escapeHtml(slot.business_name || business?.business_name)}</p>
            <p style="margin:0 0 6px;"><strong>טיפול:</strong> ${escapeHtml(slot.service_name)}</p>
            <p style="margin:0 0 6px;"><strong>תאריך:</strong> ${escapeHtml(formatDate(slot.slot_date))}</p>
            <p style="margin:0 0 6px;"><strong>שעה:</strong> ${escapeHtml(formatTime(slot.slot_time))}</p>
            ${
              slot.price
                ? `<p style="margin:0 0 6px;"><strong>מחיר:</strong> ${escapeHtml(slot.price)} ₪</p>`
                : ""
            }
            ${
              slot.note
                ? `<p style="margin:0;"><strong>הערה:</strong> ${escapeHtml(slot.note)}</p>`
                : ""
            }
          </div>

          <a href="${dashboardUrl}" style="display:inline-block; background:#ec4899; color:#ffffff; text-decoration:none; font-weight:700; padding:12px 18px; border-radius:12px;">
            פתחי את תורפול
          </a>

          <a href="${slotUrl}" style="display:inline-block; color:#be185d; text-decoration:none; font-weight:700; padding:12px 18px;">
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

      return new Response(
        JSON.stringify({
          error: "Resend failed",
          details: resendData,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("Email sent successfully", {
      to: businessEmail,
      slotId,
      resendData,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        emailSent: true,
        to: businessEmail,
        resendData,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Unexpected server error", error);

    return new Response(
      JSON.stringify({
        error: "Unexpected server error",
        details: String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});