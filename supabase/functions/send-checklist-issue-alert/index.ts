import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

// Polyfill Deno.writeAll for the older smtp/std library when running on newer Deno/edge runtime
if (typeof (Deno as any).writeAll !== "function") {
  ;(Deno as any).writeAll = async (writer: any, data: Uint8Array) => {
    let offset = 0;
    while (offset < data.length) {
      const written = await writer.write(data.subarray(offset));
      if (!written) break;
      offset += written;
    }
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(to: string, subject: string, html: string) {
  const host = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const from = Deno.env.get("SMTP_FROM") || username || "";

  if (!username || !password || !from || !to) {
    console.warn("SMTP env vars missing or no recipient; logging email instead of sending.", {
      host,
      port,
      hasUsername: !!username,
      hasPassword: !!password,
      from,
      to,
    });
    console.log("Email to send (subject):", subject);
    console.log("Email to send (to):", to);
    console.log("Email to send (html):", html);
    return;
  }

  const client = new SmtpClient();

  try {
    await client.connectTLS({
      hostname: host,
      port,
      username,
      password,
    });

    await client.send({
      from,
      to,
      subject,
      content: html,
    });
  } catch (error) {
    console.error("SMTP email error (checklist issues):", error);
  } finally {
    try {
      await client.close();
    } catch (_) {
      // ignore close errors
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let requesterId: string | null = null;

    if (token) {
      const { data } = await supabaseClient.auth.getUser(token);
      requesterId = data?.user?.id || null;
    }

    const body = await req.json().catch(() => null);
    const checklistId = body?.checklist_id || body?.checklistId;
    const adminIds = Array.isArray(body?.admin_ids) ? body.admin_ids : [];

    if (!checklistId || adminIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "checklist_id and admin_ids are required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const { data: checklist, error: checklistError } = await supabaseClient
      .from("inspection_checklists")
      .select("id, inspection_id, assigned_user_id, status, due_date, linked_group_id")
      .eq("id", checklistId)
      .single();

    if (checklistError || !checklist) {
      throw checklistError || new Error("Checklist not found");
    }

    const { data: inspection, error: inspectionError } = await supabaseClient
      .from("inspections")
      .select(
        `
        id,
        due_date,
        assigned_to,
        asset_items (asset_id, name, location),
        inspection_types (name)
      `
      )
      .eq("id", checklist.inspection_id)
      .single();

    if (inspectionError || !inspection) {
      throw inspectionError || new Error("Inspection not found");
    }

    let linkedAssets: any[] = [];
    if (checklist.linked_group_id) {
      const { data: linkedInspections, error: linkedError } = await supabaseClient
        .from("inspections")
        .select("asset_items (asset_id, name, location)")
        .eq("linked_group_id", checklist.linked_group_id);

      if (linkedError) {
        throw linkedError;
      }

      linkedAssets = (linkedInspections || [])
        .map((row: any) => row.asset_items)
        .filter(Boolean);
    }

    const linkedAssetLines = linkedAssets
      .map((asset: any) => {
        const label = [asset?.asset_id, asset?.name].filter(Boolean).join(" - ");
        const location = asset?.location ? ` (${asset.location})` : "";
        return label ? `${label}${location}` : null;
      })
      .filter(Boolean);

    const { data: items, error: itemsError } = await supabaseClient
      .from("inspection_checklist_items")
      .select("label, status, comments, sort_order")
      .eq("checklist_id", checklistId)
      .order("sort_order", { ascending: true });

    if (itemsError) {
      throw itemsError;
    }

    const { data: admins, error: adminError } = await supabaseClient
      .from("user_profiles")
      .select("id, email")
      .in("id", adminIds)
      .eq("role", "admin");

    if (adminError) {
      throw adminError;
    }

    const issues = (items || []).filter(
      (item: any) => item.status === "defective" || item.status === "not_available"
    );
    const issueSummary = issues.length
      ? issues.map((item: any) => `${item.label} (${item.status})`).join("; ")
      : "Checklist completed with issues.";

    const portalUrl = Deno.env.get("PORTAL_BASE_URL") ?? "http://localhost:3000";
    const due = checklist.due_date || inspection.due_date;
    const dueDisplay = due ? new Date(due).toLocaleDateString() : "Not specified";

    const itemsHtml = (items || [])
      .map((item: any) => {
        const status = item.status || "not_checked";
        const highlight = status === "defective" || status === "not_available";
        return `
          <tr style="background:${highlight ? "#fff2f2" : "#fff"};">
            <td style="padding:6px 8px;border:1px solid #e0e0e0;">${item.label}</td>
            <td style="padding:6px 8px;border:1px solid #e0e0e0;">${status}</td>
            <td style="padding:6px 8px;border:1px solid #e0e0e0;">${item.comments || ""}</td>
          </tr>
        `;
      })
      .join("");

    const subject = linkedAssetLines.length > 1
      ? `Inspection checklist requires attention (${linkedAssetLines.length} linked assets): ${inspection.asset_items?.asset_id || "Unknown asset"}`
      : `Inspection checklist requires attention: ${inspection.asset_items?.asset_id || "Unknown asset"}`;

    const html = `
      <h2>Inspection Checklist Requires Attention</h2>
      <p>An inspection checklist has been completed with issues that need admin attention.</p>
      <ul>
        <li><strong>Asset ID:</strong> ${inspection.asset_items?.asset_id || "N/A"}</li>
        <li><strong>Asset Name:</strong> ${inspection.asset_items?.name || "N/A"}</li>
        <li><strong>Location:</strong> ${inspection.asset_items?.location || "N/A"}</li>
        <li><strong>Inspection Type:</strong> ${inspection.inspection_types?.name || "N/A"}</li>
        <li><strong>Due Date:</strong> ${dueDisplay}</li>
        <li><strong>Company Assigned To:</strong> ${inspection.assigned_to || "N/A"}</li>
      </ul>
      ${
        linkedAssetLines.length > 1
          ? `
      <h3>Linked Assets (${linkedAssetLines.length})</h3>
      <ul>
        ${linkedAssetLines.map((line) => `<li>${line}</li>`).join("")}
      </ul>
      `
          : ""
      }
      <p><strong>Issues summary:</strong> ${issueSummary}</p>
      <h3>Checklist Items</h3>
      <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 8px;border:1px solid #e0e0e0;">Item</th>
            <th style="text-align:left;padding:6px 8px;border:1px solid #e0e0e0;">Status</th>
            <th style="text-align:left;padding:6px 8px;border:1px solid #e0e0e0;">Comments</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <p>Please log in to the Sitebatch Inspections portal to review.</p>
      <p>
        <a
          href="${portalUrl}/user-request-inbox"
          target="_blank"
          rel="noopener noreferrer"
          style="color:#1155cc;text-decoration:underline;"
        >
          Open Sitebatch Inspections Portal
        </a>
        <br />
        ${portalUrl}/user-request-inbox
      </p>
    `;

    for (const admin of admins || []) {
      const { data: existing } = await supabaseClient
        .from("checklist_alerts")
        .select("id")
        .eq("checklist_id", checklistId)
        .eq("admin_id", admin.id)
        .is("is_resolved", false)
        .maybeSingle();

      if (!existing) {
        await supabaseClient.from("checklist_alerts").insert({
          checklist_id: checklistId,
          inspection_id: checklist.inspection_id,
          admin_id: admin.id,
          created_by: requesterId,
          issue_summary: issueSummary,
        });
      }

      await sendEmail(admin.email, subject, html);
    }

    return new Response(
      JSON.stringify({ success: true, sent: (admins || []).length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("send-checklist-issue-alert error:", error);

    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
