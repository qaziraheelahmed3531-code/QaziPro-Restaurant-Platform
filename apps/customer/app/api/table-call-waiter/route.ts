import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/api/v1";
import { createClient } from "@/lib/supabase/server";
import { getStorefrontSnapshot } from "@/lib/storefront/server";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return new Response(null, { status: 403 });
  try {
    const storefront = await getStorefrontSnapshot();
    const table = storefront.tableContext;
    if (!table || !table.waiterCallEnabled || storefront.resolutionError) {
      return NextResponse.json(
        { error: "Waiter calls aren't available for this table." },
        { status: 404, headers },
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      requestType?: string;
    };
    const requestType =
      body.requestType === "REQUEST_BILL"
        ? "REQUEST_BILL"
        : body.requestType === undefined || body.requestType === "CALL_WAITER"
          ? "CALL_WAITER"
          : null;
    if (!requestType)
      return NextResponse.json(
        { error: "That table request is not supported." },
        { status: 400, headers },
      );
    const allowed = await consumeRateLimit(
      request,
      "table-service-request",
      6,
      60,
      `${storefront.business.id}:${table.branchId}:${requestType}`,
    );
    if (!allowed)
      return NextResponse.json(
        { error: "Please wait a moment before requesting again." },
        { status: 429, headers },
      );
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("request_table_service", {
      p_business_id: storefront.business.id,
      p_token: table.token,
      p_request_type: requestType,
    });
    if (error) {
      const cooldown = error.code === "P0001";
      return NextResponse.json(
        {
          error: cooldown
            ? "Please wait before requesting again."
            : "We couldn't send the table request right now. Please try again.",
        },
        { status: cooldown ? 429 : 503, headers },
      );
    }
    if (!data?.id || !["PENDING", "ACKNOWLEDGED"].includes(data.status))
      throw new Error("Waiter request not confirmed");
    return NextResponse.json(
      {
        status: data.status,
        requestType,
        alreadyOpen: Boolean(data.alreadyOpen),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "We couldn't send the table request right now. Please try again.",
      },
      { status: 503, headers },
    );
  }
}
