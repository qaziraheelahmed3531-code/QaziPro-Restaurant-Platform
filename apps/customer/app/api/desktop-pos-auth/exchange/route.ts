import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!accessToken)
    return NextResponse.json(
      { error: "Google session is missing." },
      { status: 401 },
    );

  try {
    const admin = createAdminClient();
    const userResult = await admin.auth.getUser(accessToken);
    const email = userResult.data.user?.email?.trim().toLowerCase();
    if (userResult.error || !email)
      return NextResponse.json(
        { error: "Google session is invalid or expired." },
        { status: 401 },
      );

    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = generated.data?.properties?.hashed_token;
    if (generated.error || !tokenHash)
      throw (
        generated.error ??
        new Error("One-time Desktop POS session could not be created.")
      );

    return NextResponse.json(
      { tokenHash },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error(
      "[desktop-pos-auth-exchange] failed",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Secure Desktop POS sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }
}
