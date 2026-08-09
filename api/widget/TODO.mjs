import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas, registerFont } from "canvas";

const __templatesDir = path.join(process.cwd(), "templates", "TODO");
const __fontsDir = path.join(process.cwd(), "fonts");

registerFont(
    path.join(__fontsDir, "verdana.ttf"),
    {
        family: "Verdana"
    }
);

function escapeXml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function darkenColor(hex, amount = 0.45) {
    const r = Math.floor(parseInt(hex.slice(1, 3), 16) * amount);
    const g = Math.floor(parseInt(hex.slice(3, 5), 16) * amount);
    const b = Math.floor(parseInt(hex.slice(5, 7), 16) * amount);

    return "#" +
        [r, g, b]
            .map(x => x.toString(16).padStart(2, "0"))
            .join("");
}

function measureText(text) {
    const canvas = createCanvas(200, 50);
    const ctx = canvas.getContext("2d");

    ctx.font = "6px Verdana";

    const metrics = ctx.measureText(text);

    return {
        width: metrics.width,
        height: metrics.actualBoundingBoxAscent +
                metrics.actualBoundingBoxDescent
    };
}

const indicatorsTemplate = Object.fromEntries(
    ["Default", "Deactivated"].map(type => [
        type.toLowerCase(),
        fs.readFileSync(
            path.join(
                __templatesDir,
                "Indicator",
                `${type}.svg`
            ),
            "utf8"
        )
    ])
);
function wrapText(text, maxWidth = 190) {
    const words = text.split(/\s+/);
    const lines = [];

    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine
            ? `${currentLine} ${word}`
            : word;

        if (measureText(testLine).width <= maxWidth) {
            currentLine = testLine;
            continue;
        }

        if (currentLine) {
            lines.push(currentLine);
            currentLine = "";
        }

        if (measureText(word).width <= maxWidth) {
            currentLine = word;
            continue;
        }

        let part = "";

        for (const char of word) {
            const withHyphen = part + char + "-";

            if (
                measureText(withHyphen).width > maxWidth &&
                part
            ) {
                lines.push(part + "-");
                part = char;
            } else {
                part += char;
            }
        }

        currentLine = part;
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines;
}

const bg_coder = "gif"
const bg_base64 =
    `data:image/${bg_coder};base64,` +
    fs.readFileSync(
        path.join(
            __templatesDir,
            `bg.${bg_coder}`
        )
    ).toString("base64");

const caseTemplate = fs.readFileSync(
    path.join(__templatesDir, "case.svg"),
    "utf8"
);

const indicatorInfoTemplate = fs.readFileSync(
    path.join(__templatesDir, "indicator-info.svg"),
    "utf8"
);

const todoStockTemplate = fs.readFileSync(
    path.join(__templatesDir, "TODO.svg"),
    "utf8"
);

const indentCoeff = 20;

const generateIndicatorsDefs = (indicators) =>
    indicators.map(({ id, type, color }) =>
        indicatorsTemplate[type.toLowerCase()]
            .replaceAll("{{color}}", escapeXml(color))
            .replaceAll("{{stroke}}", escapeXml(darkenColor(color)))
            .replaceAll("{{id}}", escapeXml(id))
    );

const generateTasks = (tasks) => {
    var totalHeight = 24;    
    tasks = tasks.map(({ name, description, indicator, indent }, i) => {
        const headerHeight = 20;
        const descriptionHeight = 8;
        const textWraped = wrapText(description, String(200-indent*indentCoeff));
        const descriptionSvg = textWraped
            .map((line, i) =>
                `<tspan x="0" y="${6 + i * 7}">${escapeXml(line)}</tspan>`
            )
            .join("\n");

        const lastHeight = totalHeight; 
        totalHeight += headerHeight + (descriptionHeight * textWraped.length)
        return caseTemplate
            .replaceAll("{{indent}}", String(indent * indentCoeff))
            .replaceAll("{{top_margin}}", String(lastHeight))
            .replaceAll("{{width}}", String(200-indent*indentCoeff))
            .replaceAll("{{description_height}}", String(descriptionHeight * textWraped.length))
            .replaceAll("{{indicator_type}}", indicator.toLowerCase())
            .replaceAll("{{title}}", name)
            .replaceAll("{{description}}", descriptionSvg)
    }
    );
    return { totalHeight, tasks }
}
const generateIndicatorsInfo = (indicators) => {
    var totalHeight = 0;    
    indicators = indicators.map(({id, description}, i) => {
        const descriptionHeight = 7.2;
        const textWraped = wrapText(" - "+ description, String(200-24));
        const descriptionSvg = textWraped
            .map((line, i) =>
                `<tspan x="0" y="${6 + i * 7}">${escapeXml(line)}</tspan>`
            )
            .join("\n");

        const lastHeight = totalHeight; 
        totalHeight += descriptionHeight * textWraped.length + 5
        return indicatorInfoTemplate
            .replaceAll("{{top_margin}}", String(lastHeight))
            .replaceAll("{{indicator_type}}", id.toLowerCase())
            .replaceAll("{{svg_info}}", descriptionSvg)
    }
    );
    return { totalHeight, indicators }
}

const createWidget = (templateGenerator) => {
    var widgetMinHeight = 200; 
    var contentHeight = templateGenerator.tasks.totalHeight + 24 + templateGenerator.indicators_info.totalHeight;
    var widgetHeight = contentHeight > widgetMinHeight ? contentHeight : widgetMinHeight; 

    const template = todoStockTemplate
        .replaceAll(
            "{{defs_indicators}}",
            `<defs>\n${templateGenerator.defs_indicators.join("\n")}\n</defs>`
        )
        .replaceAll(
            "{{cases}}",
            templateGenerator.tasks.tasks.join("\n")
        )
        .replaceAll(
            "{{indicator_info_section}}",
            templateGenerator.indicators_info.indicators.join("\n")
        )
        .replaceAll("{{height}}", String(widgetHeight))
        .replaceAll("{{fotter_y}}", String(widgetHeight - templateGenerator.indicators_info.totalHeight - 24))
        .replaceAll("{{clip_height}}", String(widgetHeight-12))
        .replaceAll("{{bg_base64}}", bg_base64)
        .replaceAll("{{updated_at}}", new Date().toISOString().slice(0, 16) + "Z")
        .replaceAll("{{title}}", templateGenerator.title)

    return template;
}

export default async function handler(req, res) {
    const templateGenerator = {
        defs_indicators: [],
        tasks: []
    };

    const data = { ...req.query };


    const sourceUrl = new URL(data.src);

    if (sourceUrl.hostname === "raw.githubusercontent.com") {
        sourceUrl.searchParams.set("cacheBust", Date.now().toString());
    }

    const response = await fetch(sourceUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch source: HTTP ${response.status}`);
    }

    const srcData = await response.json();

    const mergedData = {
        ...srcData,
        ...data
    };

    templateGenerator.defs_indicators =
        generateIndicatorsDefs(
            Object.entries(mergedData.case_indicators).map(
                ([id, { type, color }]) => ({
                    id,
                    type,
                    color
                })
            )
        );

    templateGenerator.indicators_info =
        generateIndicatorsInfo(
            Object.entries(mergedData.case_indicators).map(
            ([id, { description }]) => ({
                id,
                description
            })
        ));

    templateGenerator.tasks =
        generateTasks(mergedData.tasks);
    templateGenerator.title = mergedData.title;

    const svg = createWidget(templateGenerator);

    res.setHeader("Content-Type", "image/svg+xml");
    res.status(200).send(svg);
}