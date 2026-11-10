import { env } from "../config/env.js";
export const notFound = (req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};
export const errorHandler = (err, _req, res, _next) => {
    if (err.type === "entity.parse.failed")
        return void res.status(400).json({ message: "Invalid JSON body." });
    if (err.message === "Origin not allowed by CORS")
        return void res.status(403).json({ message: err.message });
    if (err.status)
        return void res.status(err.status).json({ message: err.message });
    if (err.name === "ValidationError")
        return void res.status(400).json({ message: Object.values(err.errors ?? {}).map((e) => e.message).join(" ") });
    if (err.name === "CastError")
        return void res.status(400).json({ message: "Invalid id." });
    if (err.code === 11000)
        return void res.status(409).json({ message: "That value is already in use." });
    console.error(err);
    res.status(500).json({ message: env.isProd ? "Something went wrong." : err.message });
};
//# sourceMappingURL=error.js.map