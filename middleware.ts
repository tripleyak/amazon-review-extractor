import { NextResponse, type NextRequest } from "next/server";
import {
  getPasswordToken,
  getSitePassword,
  getSafeRedirectPath,
  protectionIsRequired,
  SITE_PASSWORD_COOKIE,
  SITE_PASSWORD_ROUTE,
} from "@/lib/site-password";

const excludedPaths = new Set(["/favicon.ico", "/icon.svg", "/right-side-up-white.png"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === SITE_PASSWORD_ROUTE || pathname.startsWith("/_next/") || excludedPaths.has(pathname)) {
    return NextResponse.next();
  }

  const password = getSitePassword();

  if (!password) {
    if (protectionIsRequired()) {
      return new NextResponse("Site password is not configured.", {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }

    return NextResponse.next();
  }

  const expectedToken = await getPasswordToken(password);
  const requestToken = request.cookies.get(SITE_PASSWORD_COOKIE)?.value;

  if (requestToken === expectedToken) {
    return NextResponse.next();
  }

  return new NextResponse(renderPasswordPage(request), {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function renderPasswordPage(request: NextRequest) {
  const nextPath = getCleanNextPath(request);
  const error = request.nextUrl.searchParams.get("sitePasswordError") === "1";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Right Side Up Tool Access</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, Helvetica, sans-serif;
        background: #f6f5f1;
        color: #0e1539;
      }

      * {
        box-sizing: border-box;
      }

      body {
        align-items: center;
        display: flex;
        justify-content: center;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }

      main {
        background: #ffffff;
        border: 1px solid #dfddd6;
        border-radius: 8px;
        box-shadow: 0 24px 80px rgba(14, 21, 57, 0.12);
        max-width: 420px;
        padding: 32px;
        width: 100%;
      }

      h1 {
        font-size: 24px;
        line-height: 1.2;
        margin: 0 0 8px;
      }

      p {
        color: #454a63;
        font-size: 14px;
        line-height: 1.5;
        margin: 0 0 24px;
      }

      label {
        display: block;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      input {
        border: 1px solid #c7c4ba;
        border-radius: 6px;
        color: #0e1539;
        font: inherit;
        padding: 12px;
        width: 100%;
      }

      input:focus {
        border-color: #3049c5;
        outline: 3px solid rgba(48, 73, 197, 0.18);
      }

      button {
        background: #0e1539;
        border: 0;
        border-radius: 999px;
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        margin-top: 16px;
        padding: 12px 18px;
        width: 100%;
      }

      .error {
        color: #b42318;
        margin: 12px 0 0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Right Side Up tool access</h1>
      <p>Enter the shared password to continue.</p>
      <form method="post" action="${SITE_PASSWORD_ROUTE}">
        <input type="hidden" name="next" value="${escapeHtml(nextPath)}" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
        <button type="submit">Continue</button>
        ${error ? '<p class="error">Incorrect password.</p>' : ""}
      </form>
    </main>
  </body>
</html>`;
}

function getCleanNextPath(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete("sitePasswordError");
  return getSafeRedirectPath(`${url.pathname}${url.search}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
