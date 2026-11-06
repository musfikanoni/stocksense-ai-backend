// Google sign-in, profile pictures and the main login flow. Needs TEST_MONGODB_URI (see helpers.ts).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { boot, skipDb } from "./helpers.js";

describe("accounts", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
  let t: Awaited<ReturnType<typeof boot>>;
  before(async () => {
    t = await boot({ GOOGLE_CLIENT_ID: "1234567890-fake.apps.googleusercontent.com", CLOUDINARY_CLOUD_NAME: "democloud", CLOUDINARY_API_KEY: "111111111111111", CLOUDINARY_API_SECRET: "secretsecretsecret", SHOW_DEV_OTP: "true" });
  });
  after(async () => { await t?.close(); });

  describe("sign up and log in", () => {
    it("signs up, never returns password fields, and refuses a duplicate", async () => {
      const email = `dup${Date.now()}@example.com`;
      const a = await t.call("POST", "/auth/signup", { body: { name: "Dup Tester", email, password: "Test@12345" } });
      assert.equal(a.status, 201);
      assert.ok(a.data.token);
      assert.equal(a.data.user.passwordHash, undefined);
      assert.equal((await t.call("POST", "/auth/signup", { body: { name: "Dup Tester", email, password: "Test@12345" } })).status, 409);
    });
    it("rejects bad input (short password, bad email, operator injection)", async () => {
      assert.equal((await t.call("POST", "/auth/signup", { body: { name: "X Y", email: "a@b.co", password: "short" } })).status, 400);
      assert.equal((await t.call("POST", "/auth/signup", { body: { name: "X Y", email: "nope", password: "Test@12345" } })).status, 400);
      assert.equal((await t.call("POST", "/auth/login", { body: { email: { $ne: "" }, password: "x" } })).status, 400);
    });
    it("gives the same answer for a wrong password and an unknown email", async () => {
      const u = await t.signup("login");
      const wrong = await t.call("POST", "/auth/login", { body: { email: u.email, password: "Wrong@12345" } });
      const none = await t.call("POST", "/auth/login", { body: { email: `none${Date.now()}@example.com`, password: "Wrong@12345" } });
      assert.equal(wrong.status, 401);
      assert.equal(none.status, 401);
      assert.equal(wrong.data.message, none.data.message);
    });
    it("a password change makes the old token stop working", async () => {
      const u = await t.signup("pwchange");
      const r = await t.call("PATCH", "/auth/me/password", { token: u.token, body: { currentPassword: "Test@12345", newPassword: "Changed@5678" } });
      assert.equal(r.status, 200);
      assert.equal((await t.call("GET", "/auth/me", { token: u.token })).status, 401);
      assert.equal((await t.call("GET", "/auth/me", { token: r.data.token })).status, 200);
    });
  });

  describe("password reset", () => {
    it("code, then reset token, then new password", async () => {
      const u = await t.signup("reset");
      const a = await t.call("POST", "/auth/forgot-password", { body: { email: u.email } });
      assert.match(a.data.devOtp, /^\d{6}$/);
      assert.equal((await t.call("POST", "/auth/verify-otp", { body: { email: u.email, otp: a.data.devOtp === "111111" ? "222222" : "111111" } })).status, 400);
      const v = await t.call("POST", "/auth/verify-otp", { body: { email: u.email, otp: a.data.devOtp } });
      assert.equal(v.status, 200);
      assert.equal((await t.call("GET", "/auth/me", { token: v.data.resetToken })).status, 401);          // a reset token is not a login token
      assert.equal((await t.call("POST", "/auth/reset-password", { body: { resetToken: v.data.resetToken, password: "Reset@99999" } })).status, 200);
      assert.equal((await t.call("POST", "/auth/login", { body: { email: u.email, password: "Reset@99999" } })).status, 200);
    });
    it("an unknown email gets the same answer and no code", async () => {
      const r = await t.call("POST", "/auth/forgot-password", { body: { email: `ghost${Date.now()}@example.com` } });
      assert.equal(r.status, 200);
      assert.equal(r.data.devOtp, undefined);
    });
    it("locks the code after 5 wrong tries", async () => {
      const u = await t.signup("lockout");
      const a = await t.call("POST", "/auth/forgot-password", { body: { email: u.email } });
      const wrong = a.data.devOtp === "111111" ? "222222" : "111111";
      for (let i = 0; i < 5; i++) await t.call("POST", "/auth/verify-otp", { body: { email: u.email, otp: wrong } });
      assert.equal((await t.call("POST", "/auth/verify-otp", { body: { email: u.email, otp: a.data.devOtp } })).status, 400);
    });
  });

  describe("Google sign-in", () => {
    it("rejects a fake token", async () => {
      assert.equal((await t.call("POST", "/auth/google", { body: { credential: "not.a.real-google-token-0123456789" } })).status, 401);
      assert.equal((await t.call("POST", "/auth/google", { body: { credential: "x" } })).status, 400);
    });
    it("creates a user, logs the same person in again, and never merges into a password account", async () => {
      const { signInWithGoogle } = await import("../utils/googleAuth.js");
      const { User } = await import("../models/User.js");
      const mail = `g${Date.now()}@gmail.com`;
      const sub = `sub-${Date.now()}`;
      const a = await signInWithGoogle({ sub, email: mail, emailVerified: true, name: "Gina Google Tester" });
      assert.equal(a.firstName, "Gina");
      assert.equal(a.lastName, "Google Tester");
      const again = await signInWithGoogle({ sub, email: mail, emailVerified: true, name: "Gina" });
      assert.equal(String(again.id), String(a.id));
      const pw = await t.signup("gmerge");
      await assert.rejects(() => signInWithGoogle({ sub: `other-${Date.now()}`, email: pw.email, emailVerified: true, name: "Someone" }), { status: 409 });
      await assert.rejects(() => signInWithGoogle({ sub: `x-${Date.now()}`, email: `u${Date.now()}@x.com`, emailVerified: false, name: "U" }), { status: 401 });
      await User.updateOne({ _id: a._id }, { blocked: true });
      await assert.rejects(() => signInWithGoogle({ sub, email: mail, emailVerified: true, name: "Gina" }), { status: 403 });
      await User.deleteOne({ _id: a._id });
    });
  });

  describe("profile picture", () => {
    it("hands out a signed upload ticket for this user only", async () => {
      const u = await t.signup("avatar");
      const r = await t.call("POST", "/auth/me/avatar/signature", { token: u.token });
      assert.equal(r.status, 200);
      assert.equal(r.data.fields.public_id, `stocksense/avatars/${u.id}`);
      assert.match(r.data.signature, /^[0-9a-f]{40}$/);
      assert.ok(r.data.uploadUrl.endsWith("/democloud/image/upload"));
    });
    it("saves only a picture address that belongs to this user in our Cloudinary account", async () => {
      const u = await t.signup("avatar2");
      const good = `https://res.cloudinary.com/democloud/image/upload/v1700000000/stocksense/avatars/${u.id}.jpg`;
      const ok = await t.call("PATCH", "/auth/me/avatar", { token: u.token, body: { url: good } });
      assert.equal(ok.status, 200);
      assert.ok(ok.data.user.avatarUrl.includes("c_fill,g_auto,w_256"));
      for (const bad of ["https://evil.example.com/x.png", `https://res.cloudinary.com/othercloud/image/upload/v1/stocksense/avatars/${u.id}.jpg`, "https://res.cloudinary.com/democloud/image/upload/v1/stocksense/avatars/someone-else.jpg", "javascript:alert(1)"])
        assert.equal((await t.call("PATCH", "/auth/me/avatar", { token: u.token, body: { url: bad } })).status, 400);
      const gone = await t.call("DELETE", "/auth/me/avatar", { token: u.token });
      assert.equal(gone.status, 200);
      assert.equal(gone.data.user.avatarUrl, undefined);
    });
  });

  describe("protected routes", () => {
    it("need a token, and a normal user cannot use admin routes", async () => {
      assert.equal((await t.call("GET", "/watchlist")).status, 401);
      assert.equal((await t.call("GET", "/alerts")).status, 401);
      const u = await t.signup("plain");
      assert.equal((await t.call("GET", "/admin/stats", { token: u.token })).status, 403);
    });
  });
});
