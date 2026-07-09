import { NextResponse, type NextRequest } from "next/server";
import {
  getPasswordToken,
  getSafeRedirectPath,
  getSitePassword,
  SITE_PASSWORD_COOKIE,
  SITE_PASSWORD_MAX_AGE,
} from "@/lib/site-password";

export async function POST(request: NextRequest) {
  const password = getSitePassword();

  if (!password) {
    return new NextResponse("Site password is not configured.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const formData = await request.formData();
  const submittedPassword = formData.get("password");
  const redirectUrl = new URL(getSafeRedirectPath(formData.get("next")), request.url);
  redirectUrl.searchParams.delete("sitePasswordError");

  if (typeof submittedPassword !== "string" || submittedPassword !== password) {
    redirectUrl.searchParams.set("sitePasswordError", "1");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set(SITE_PASSWORD_COOKIE, await getPasswordToken(password), {
    httpOnly: true,
    maxAge: SITE_PASSWORD_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url), 303);
}
