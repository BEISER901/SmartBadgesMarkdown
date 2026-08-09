import http from "http";
import { pathToFileURL } from "url";

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // /api/buttons/is_active_project
    const filePath = "." + url.pathname + ".mjs";

    try {
        const module = await import(
            pathToFileURL(filePath).href
        );

        const handler = module.default;

        const vercelReq = {
            query: Object.fromEntries(url.searchParams)
        };

        const vercelRes = {
            setHeader(name, value) {
                res.setHeader(name, value);
            },

            status(code) {
                res.statusCode = code;
                return this;
            },

            send(data) {
                res.end(data);
            }
        };

        await handler(vercelReq, vercelRes);

    } catch (error) {
        console.error(error);

        res.statusCode = 404;
        res.end("Function not found");
    }
});

server.listen(3001, () => {
    console.log("Local Vercel emulator:");
    console.log("http://localhost:3000");
});