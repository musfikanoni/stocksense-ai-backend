// Integration tests talk to a real MongoDB. Set TEST_MONGODB_URI to a database you do not mind filling with test data
// (for example a free Atlas cluster, or a local MongoDB) and run `npm test`. Without it, only the offline tests run.
export const skipDb = !process.env.TEST_MONGODB_URI;
export async function boot(extraEnv = {}) {
    Object.assign(process.env, {
        NODE_ENV: "test", MONGODB_URI: process.env.TEST_MONGODB_URI, JWT_SECRET: "test-secret-test-secret-test-secret",
        BCRYPT_ROUNDS: "4", CLIENT_URL: "http://localhost:3000", ...extraEnv,
    });
    const { connectDb } = await import("../config/db.js");
    await connectDb();
    const { default: app } = await import("../../app.js");
    const server = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (method, path, o = {}) => {
        const res = await fetch(base + path, {
            method,
            headers: { ...(o.rawBody === undefined && { "Content-Type": "application/json" }), ...(o.token && { Authorization: `Bearer ${o.token}` }), ...o.headers },
            body: o.rawBody ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
        });
        return { status: res.status, data: await res.json().catch(() => null) };
    };
    const signup = async (label) => {
        const r = await call("POST", "/auth/signup", { body: { name: `Test ${label}`, email: `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`, password: "Test@12345" } });
        return { token: r.data.token, id: r.data.user.id, email: r.data.user.email };
    };
    const close = async () => {
        server.close();
        const mongoose = (await import("mongoose")).default;
        await mongoose.connection.close();
    };
    return { call, signup, close };
}
//# sourceMappingURL=helpers.js.map