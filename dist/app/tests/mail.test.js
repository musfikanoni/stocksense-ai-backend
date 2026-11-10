// Email sending with the Resend call replaced by a fake.
process.env.MONGODB_URI ??= "mongodb://unused";
process.env.JWT_SECRET ??= "placeholder-secret-for-unit-tests";
process.env.CLIENT_URL = "https://app.example.com";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mockFetch } from "./fixtures.js";
const { env } = await import("../config/env.js");
const { mailProvider, sendMail } = await import("../services/mailer.js");
const { alertEmail, resetCodeEmail } = await import("../services/emails.js");
const reset = () => Object.assign(env.mail, { resendKey: "", from: "", smtpHost: "", smtpUser: "", smtpPass: "" });
describe("email", () => {
    afterEach(reset);
    it("picks the provider from the settings", () => {
        reset();
        assert.equal(mailProvider(), null);
        Object.assign(env.mail, { smtpHost: "smtp.gmail.com", smtpUser: "me@gmail.com", smtpPass: "app-password" });
        assert.equal(mailProvider(), "smtp");
        Object.assign(env.mail, { resendKey: "re_123", from: "StockSense <no-reply@example.com>" });
        assert.equal(mailProvider(), "resend"); // Resend wins when both are set
        Object.assign(env.mail, { from: "" });
        assert.equal(mailProvider(), "smtp"); // Resend also needs a sender address
    });
    it("sends through Resend with the right request", async () => {
        Object.assign(env.mail, { resendKey: "re_123", from: "StockSense <no-reply@example.com>" });
        const m = mockFetch(() => ({ body: { id: "abc" } }));
        await sendMail({ to: "jon@example.com", subject: "Hello", text: "Body", html: "<p>Body</p>" });
        m.restore();
        const { url, init } = m.calls[0];
        assert.equal(url.href, "https://api.resend.com/emails");
        assert.equal((init?.headers).Authorization, "Bearer re_123");
        assert.deepEqual(JSON.parse(String(init?.body)), { from: "StockSense <no-reply@example.com>", to: ["jon@example.com"], subject: "Hello", text: "Body", html: "<p>Body</p>" });
    });
    it("reports why Resend refused", async () => {
        Object.assign(env.mail, { resendKey: "re_123", from: "x@example.com" });
        const m = mockFetch(() => ({ status: 403, body: { message: "You can only send testing emails to your own email address" } }));
        await assert.rejects(() => sendMail({ to: "other@example.com", subject: "s", text: "t" }), /403.*only send testing emails/);
        m.restore();
    });
    it("refuses to pretend when email is not set up", async () => {
        reset();
        await assert.rejects(() => sendMail({ to: "a@b.co", subject: "s", text: "t" }), /not set up/);
    });
    it("writes the reset code and alert emails", () => {
        const r = resetCodeEmail("123456");
        assert.ok(r.subject.includes("123456") && r.text.includes("10 minutes") && r.html?.includes("123456"));
        const a = alertEmail("AAPL reached $235", "Apple <b>Inc.</b> is now $236.10");
        assert.ok(a.html?.includes("&lt;b&gt;") && !a.html?.includes("<b>Inc.</b>")); // text from outside is escaped
        assert.ok(a.text.includes("https://app.example.com/alerts"));
    });
});
//# sourceMappingURL=mail.test.js.map