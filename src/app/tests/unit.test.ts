// Offline tests: no database, no internet.
process.env.MONGODB_URI ??= "mongodb://unused";
process.env.JWT_SECRET ??= "placeholder-secret-for-unit-tests";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { analyze } = await import("../utils/signal.js");
const { series } = await import("../utils/history.js");
const { sign, thumb } = await import("../utils/cloudinary.js");
const v = await import("../utils/validate.js");
const { signAccess, signReset, verify } = await import("../utils/token.js");

const { makeCloses } = await import("./fixtures.js");

describe("signal", () => {
  it("calls a steady climb Bullish, a steady fall Bearish and a flat line Neutral", () => {
    assert.equal(analyze(makeCloses(60, "up").closes).signal, "Bullish");
    assert.equal(analyze(makeCloses(60, "down", 200).closes).signal, "Bearish");
    assert.equal(analyze(makeCloses(60, "flat").closes).signal, "Neutral");
  });
  it("keeps confidence between 48 and 95 and the levels around the price", () => {
    const { closes } = makeCloses(60, "up");
    const a = analyze(closes);
    assert.ok(a.confidence >= 48 && a.confidence <= 95);
    assert.ok(a.support <= closes[59] && a.resistance >= closes[59]);
    assert.ok(a.breakout > a.resistance);
  });
});

describe("chart points from daily closes", () => {
  const { closes, closeDates } = makeCloses(300, "up");
  it("gives the right number of points per range, ending at the last close", () => {
    for (const [range, n] of [["1W", 5], ["1M", 22], ["1Y", 12]] as const) {
      const pts = series(closes, closeDates, range);
      assert.equal(pts.length, n);
      assert.equal(pts[pts.length - 1].price, closes[299]);
    }
  });
  it("labels the days", () => {
    assert.match(series(closes, closeDates, "1W")[4].label, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    assert.match(series(closes, closeDates, "1M")[0].label, /^[A-Z][a-z]{2} \d{1,2}$/);
    assert.match(series(closes, closeDates, "1Y")[0].label, /^[A-Z][a-z]{2}$/);
  });
  it("copes with little history", () => {
    assert.equal(series(closes.slice(0, 3), closeDates.slice(0, 3), "1M").length, 3);
    assert.ok(series(closes.slice(0, 30), closeDates.slice(0, 30), "1Y").length >= 2);
  });
});

describe("Cloudinary helpers", () => {
  it("signature matches the example in Cloudinary's documentation", () => {
    assert.equal(sign({ eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: "1315060510" }, "abcd"), "bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
  it("signature does not depend on parameter order", () => assert.equal(sign({ b: 2, a: 1 }, "s"), sign({ a: 1, b: 2 }, "s")));
  it("adds the crop step to the picture address once", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v1/x.jpg";
    assert.ok(thumb(url).includes("/image/upload/c_fill,g_auto,w_256,h_256,f_auto,q_auto/v1/x.jpg"));
    assert.equal(thumb(thumb(url)), thumb(url));
  });
});

describe("input checks", () => {
  it("accepts and cleans a good email, rejects bad ones", () => {
    assert.equal(v.email("  Jon@Example.COM "), "jon@example.com");
    for (const bad of ["nope", "a@b", "", 5, null, { $ne: "" }]) assert.throws(() => v.email(bad));
  });
  it("limits password length to what bcrypt can use", () => {
    assert.throws(() => v.password("short"));
    assert.throws(() => v.password("x".repeat(73)));
    assert.equal(v.password("long-enough-1"), "long-enough-1");
  });
  it("only allows known values", () => {
    assert.equal(v.oneOf("1M", ["1D", "1M"] as const, "range"), "1M");
    assert.throws(() => v.oneOf("5Y", ["1D", "1M"] as const, "range"));
  });
  it("turns symbols to upper case and refuses odd ones", () => {
    assert.equal(v.symbol("aapl"), "AAPL");
    assert.throws(() => v.symbol("A$A"));
    assert.throws(() => v.symbol({ $gt: "" }));
  });
  it("escapes search text so it cannot be used as a pattern", () => assert.equal(v.escapeRegex("a.b*c"), "a\\.b\\*c"));
});

describe("tokens", () => {
  it("a login token carries the user id and role", () => {
    const p = verify(signAccess({ id: "abc123", role: "admin" }));
    assert.equal(p.sub, "abc123");
    assert.equal(p.role, "admin");
    assert.equal(p.purpose, undefined);
  });
  it("a reset token is marked so it cannot be used to log in", () => assert.equal(verify(signReset({ id: "abc123" })).purpose, "reset"));
  it("a changed token is rejected", () => assert.throws(() => verify(signAccess({ id: "abc", role: "user" }) + "x")));
});
