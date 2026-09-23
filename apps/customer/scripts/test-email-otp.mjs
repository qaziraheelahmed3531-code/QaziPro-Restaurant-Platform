// Real source with lightweight hook/SDK mocks. No email, token or credentials logged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as config from "../../../packages/shared/src/auth.ts";
const require = createRequire(import.meta.url),
  ts = require("typescript");
const root = new URL("../../../", import.meta.url);
function harness() {
  const values = [],
    refs = [],
    calls = [],
    timers = [];
  let cursor = 0,
    refCursor = 0,
    result = { data: { user: { id: "qa" }, session: {} }, error: null };
  const react = {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in values))
        values[i] = typeof initial === "function" ? initial() : initial;
      return [
        values[i],
        (value) =>
          (values[i] = typeof value === "function" ? value(values[i]) : value),
      ];
    },
    useRef: (initial) => {
      const i = refCursor++;
      return (refs[i] ??= { current: initial });
    },
    useEffect: (fn) => fn(),
  };
  const auth = {
    verifyOtp: async (args) => {
      calls.push(["verify", args]);
      return result;
    },
    signInWithOtp: async (args) => {
      calls.push(["send", args]);
      return result;
    },
    signInWithOAuth: async (args) => {
      calls.push(["google", args]);
      return result;
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@italian-pizza/shared": config,
    "@italian-pizza/shared/app-loader": { AppLoader: "loader" },
    "motion/react": {
      AnimatePresence: "presence",
      motion: { div: "motion" },
      useReducedMotion: () => true,
    },
    "@/lib/supabase/client": {
      createClient: () => ({ auth }),
      isSupabaseConfigured: () => true,
    },
    "@/lib/auth/errors": {
      authErrorMessage: config.emailOtpError,
      logAuthDiagnostic: () => {},
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/book-demo-modal": { BookDemoModal: "book-demo-modal" },
    "./email-otp-input": { EmailOtpInput: "otp" },
    "@/components/email-otp-input": { EmailOtpInput: "otp" },
    "next/image": { __esModule: true, default: "img" },
    "next/link": { __esModule: true, default: "a" },
    "lucide-react": new Proxy({}, { get: (_target, name) => String(name) }),
    "next/navigation": {
      useRouter: () => ({ refresh: () => calls.push(["refresh"]) }),
    },
  };
  function load(path) {
    const exports = {};
    const source = readFileSync(new URL(path, root), "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      require: (name) => {
        assert.ok(name in modules, `Known module ${name}`);
        return modules[name];
      },
      window: {
        setTimeout: (fn) => timers.push(fn),
        clearTimeout: () => {},
        setInterval: (fn) => timers.push(fn),
        clearInterval: () => {},
        location: {
          origin: "http://localhost:3001",
          replace: (url) => calls.push(["navigate", url]),
        },
      },
    });
    return exports;
  }
  return {
    values,
    refs,
    calls,
    timers,
    load,
    render: (fn, props) => {
      cursor = 0;
      refCursor = 0;
      return fn(props);
    },
    setResult: (value) => (result = value),
  };
}
function find(node, test) {
  if (!node || typeof node !== "object") return null;
  if (test(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, test);
    if (match) return match;
  }
  return null;
}
function textContent(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return [node.props?.children].flat(Infinity).map(textContent).join("");
}
assert.equal(config.EMAIL_OTP_LENGTH, 8);
assert.equal(config.isCompleteEmailOtp("01234567"), true);
for (const invalid of ["123456", "123456789", "1234abcd", ""])
  assert.equal(config.isCompleteEmailOtp(invalid), false);
assert.equal(
  config
    .editOtpDigits(config.emptyOtpDigits(), 4, "01 23-45 67", true)
    .digits.join(""),
  "01234567",
);
assert.equal(config.editOtpDigits(config.emptyOtpDigits(), 0, "letters"), null);
assert.equal(
  config.editOtpDigits(config.emptyOtpDigits(), 0, "123456789", true),
  null,
);
for (const app of ["customer/components/account", "admin/components"]) {
  const h = harness(),
    { EmailOtpInput } = h.load(`apps/${app}/email-otp-input.tsx`);
  let digits = config.emptyOtpDigits();
  const props = () => ({ digits, onChange: (value) => (digits = value) });
  let tree = h.render(EmailOtpInput, props());
  assert.equal(tree.props.children.length, config.EMAIL_OTP_LENGTH);
  const focused = [];
  tree.props.children.forEach((node, i) =>
    node.props.ref({ focus: () => focused.push(i), select: () => {} }),
  );
  tree.props.children[3].props.onPaste({
    preventDefault() {},
    clipboardData: { getData: () => "01 23-45 67" },
  });
  assert.equal(digits.join(""), "01234567");
  assert.equal(focused.at(-1), 7);
  tree = h.render(EmailOtpInput, props());
  tree.props.children[7].props.onKeyDown({
    key: "Backspace",
    preventDefault() {},
  });
  assert.equal(digits[7], "");
  tree = h.render(EmailOtpInput, props());
  tree.props.children[7].props.onKeyDown({
    key: "Backspace",
    preventDefault() {},
  });
  assert.equal(digits[6], "");
  assert.equal(focused.at(-1), 6);
  tree = h.render(EmailOtpInput, props());
  tree.props.children[0].props.onKeyDown({
    key: "ArrowRight",
    preventDefault() {},
  });
  assert.equal(focused.at(-1), 1);
  console.log(
    `PASS: ${app} eight inputs, spaced/hyphenated full paste, leading zero and keyboard behavior`,
  );
}
{
  const h = harness(),
    { OtpVerificationForm } = h.load(
      "apps/customer/components/account/otp-verification-form.tsx",
    );
  let error = "",
    verified = false;
  const props = {
    email: "qa@example.com",
    onError: (v) => (error = v),
    onVerified: () => (verified = true),
    onChangeEmail: () => {},
  };
  let tree = h.render(OtpVerificationForm, props);
  assert.equal(
    find(tree, (n) => n.type === "button" && n.props.type === "submit").props
      .disabled,
    true,
  );
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
  assert.match(error, /complete/);
  h.values[0] = "01234567".split("");
  tree = h.render(OtpVerificationForm, props);
  const first = tree.props.onSubmit({ preventDefault() {} });
  const second = tree.props.onSubmit({ preventDefault() {} });
  await Promise.all([first, second]);
  assert.equal(h.calls.filter((c) => c[0] === "verify").length, 1);
  assert.equal(h.calls[0][1].token, "01234567");
  assert.equal(h.calls[0][1].type, "email");
  assert.ok(verified);
  assert.ok(h.calls.some((c) => c[0] === "refresh"));
  for (const code of ["otp_expired", "otp_invalid"]) {
    h.setResult({ data: {}, error: { code } });
    await tree.props.onSubmit({ preventDefault() {} });
    assert.equal(error, "The verification code is incorrect or has expired.");
  }
  h.setResult({ error: null });
  h.values[3] = 0;
  tree = h.render(OtpVerificationForm, props);
  await find(tree, (n) => n.props.className === "otp-resend").props.onClick();
  assert.equal(h.calls.at(-1)[0], "send");
  assert.equal(h.values[3], config.EMAIL_OTP_RESEND_SECONDS);
  assert.equal(h.values[0].join(""), "");
  console.log(
    "PASS: Customer complete-token verification, disabled incomplete submission, synchronous double-submit guard, safe errors and resend reset",
  );
}
{
  const h = harness(),
    { LoginForm } = h.load("apps/admin/components/login-form.tsx");
  let tree = h.render(LoginForm, {});
  find(tree, (n) => n.type === "button" && n.props.children === "Use an email code instead").props.onClick();
  tree = h.render(LoginForm, {});
  find(tree, (n) => n.props.id === "admin-email").props.onChange({
    target: { value: " QA@example.com " },
  });
  tree = h.render(LoginForm, {});
  find(tree, (n) => n.props.className === "login-form").props.onSubmit({
    preventDefault() {},
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(h.calls[0][1].email, "qa@example.com");
  assert.equal(h.calls[0][1].options.shouldCreateUser, true);
  assert.equal(h.values[6], true);
  h.values[7] = "01234567".split("");
  tree = h.render(LoginForm, {});
  await find(
    tree,
    (n) => n.props.className === "admin-otp-form",
  ).props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.find((c) => c[0] === "verify")[1].token, "01234567");
  assert.deepEqual(h.calls.at(-1), ["navigate", "/auth/complete"]);
  // A fresh form tests change-email without signing out an existing session.
  const other = harness(),
    form = other.load("apps/admin/components/login-form.tsx").LoginForm;
  other.render(form, {});
  other.values[6] = true;
  other.values[7] = "01234567".split("");
  tree = other.render(form, {});
  find(
    tree,
    (n) => n.type === "button" && n.props.children === "Change email",
  ).props.onClick();
  assert.equal(other.values[6], false);
  assert.equal(other.values[7].join(""), "");
  assert.equal(other.values[2], "");
  console.log(
    "PASS: Admin real SDK call contract, normalized email, OTP transition, complete-token verification, server authorization handoff and change-email reset",
  );
}
assert.equal(
  config.emailOtpError({ status: 429 }, "email-send"),
  "Too many requests. Please wait and try again.",
);
assert.equal(
  config.emailOtpError(new TypeError("Failed to fetch"), "otp-verify"),
  "Unable to reach the authentication service.",
);
assert.equal(
  config.emailOtpError({ code: "unexpected_failure" }, "email-send"),
  "We couldn't send the verification email right now.",
);
console.log(
  "PASS: rate limit, network and email delivery error mapping; no raw provider payload exposed",
);
for (const app of ["customer", "admin"]) {
  const h = harness();
  const component =
    app === "customer"
      ? h.load("apps/customer/components/account/google-sign-in-button.tsx")
          .GoogleSignInButton
      : h.load("apps/admin/components/login-form.tsx").LoginForm;
  const tree = h.render(component, { onError: () => {} });
  const button =
    app === "customer"
      ? tree
      : find(
          tree,
          (n) =>
            n.type === "button" && textContent(n).includes("Continue with Google"),
        );
  await button.props.onClick();
  const call = h.calls.find((c) => c[0] === "google");
  assert.equal(call[1].provider, "google");
  assert.equal(
    call[1].options.redirectTo,
    `http://localhost:3001/auth/callback${app === "customer" ? "?next=/account" : ""}`,
  );
  console.log(
    `PASS: ${app} Google OAuth provider/callback contract unchanged (mocked; not interactive OAuth)`,
  );
}
{
  const h = harness(),
    { LoginForm } = h.load("apps/admin/components/login-form.tsx");
  h.render(LoginForm, {});
  h.values[2] = "qa@example.com";
  h.values[6] = true;
  h.values[7] = "01234567".split("");
  h.values[8] = 0;
  h.setResult({ error: { code: "otp_expired" } });
  let tree = h.render(LoginForm, {});
  await find(
    tree,
    (n) => n.props.className === "admin-otp-form",
  ).props.onSubmit({ preventDefault() {} });
  assert.equal(
    h.values[0],
    "The verification code is incorrect or has expired.",
  );
  h.setResult({ error: null });
  tree = h.render(LoginForm, {});
  find(
    tree,
    (n) => n.type === "button" && n.props.children === "Resend code",
  ).props.onClick();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.values[7].join(""), "");
  assert.equal(h.values[8], config.EMAIL_OTP_RESEND_SECONDS);
  assert.equal(h.values[9], "A new code has been sent to your email.");
  tree = h.render(LoginForm, {});
  assert.equal(
    find(
      tree,
      (n) =>
        n.type === "button" && String(n.props.children).startsWith("Resend in"),
    ).props.disabled,
    true,
  );
  console.log(
    "PASS: Admin wrong/expired-code error, resend SDK request, empty-code reset and countdown lock",
  );
}
{
  const desktopAuthPage = readFileSync(
      new URL("../app/desktop-pos-auth/page.tsx", import.meta.url),
      "utf8",
    ),
    desktopAuthComplete = readFileSync(
      new URL("../app/desktop-pos-auth/complete/page.tsx", import.meta.url),
      "utf8",
    ),
    desktopAuthExchange = readFileSync(
      new URL(
        "../app/api/desktop-pos-auth/exchange/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    authBridge = readFileSync(
      new URL(
        "../components/providers/desktop-pos-auth-bridge.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    desktopApp = readFileSync(
      new URL("../../desktop-pos/src/App.tsx", import.meta.url),
      "utf8",
    ),
    desktopMain = readFileSync(
      new URL("../../desktop-pos/electron/main.cjs", import.meta.url),
      "utf8",
    );
  assert.match(desktopAuthPage, /signInWithOAuth/);
  assert.match(desktopAuthPage, /\/auth\/callback/);
  assert.match(desktopAuthPage, /\/desktop-pos-auth\/complete/);
  assert.match(desktopAuthPage, /window\.location\.replace/);
  assert.match(desktopAuthComplete, /\/api\/desktop-pos-auth\/exchange/);
  assert.match(desktopAuthComplete, /italianpizza-pos:\/\/auth\/callback/);
  assert.match(desktopAuthExchange, /generateLink/);
  assert.match(desktopAuthExchange, /type: "magiclink"/);
  assert.match(authBridge, /italianpizza-pos:\/\/auth\/callback/);
  assert.match(desktopApp, /\/desktop-pos-auth/);
  assert.match(desktopApp, /signInWithOtp/);
  assert.match(desktopApp, /type: "email"/);
  assert.match(desktopApp, /token_hash/);
  assert.match(desktopApp, /onOAuthCallback/);
  assert.match(desktopApp, /exchangeCodeForSession/);
  assert.match(desktopMain, /setAsDefaultProtocolClient/);
  assert.match(desktopMain, /qazipro-pos/);
  assert.match(desktopMain, /second-instance/);
  console.log(
    "PASS: Desktop email OTP avoids localhost APIs and Google OAuth returns a one-time session through the registered QaziPRO protocol",
  );
}
