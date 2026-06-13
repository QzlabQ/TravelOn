import React from "react";
import {Divider} from "@mui/material";

interface MarkdownImage {
    alt: string,
    url: string,
}

function parseMarkdownImage(line: string): MarkdownImage | null {
    const match = line.match(/^!\[([^\]]*)\]\((.*?)\)\s*$/);
    if (!match) {
        return null;
    }
    const url = match[2].trim();
    if (!url) {
        return null;
    }
    return {
        alt: match[1].trim(),
        url,
    };
}

function isSafeHref(href: string) {
    return /^(https?:\/\/|\/(?!\/)|#)/i.test(href);
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
    return text.split(/(`[^`]+`|\*\*[^*]+?\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
        const key = `${keyPrefix}-${index}`;
        if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={key} className="rounded bg-gray-100 px-1 py-0.5 text-[0.92em] text-[#374151]">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={key}>{part.slice(2, -2)}</strong>;
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
            const href = link[2].trim();
            if (!isSafeHref(href)) {
                return <React.Fragment key={key}>{link[1]}</React.Fragment>;
            }
            const external = /^https?:\/\//i.test(href);
            return (
                <a
                    key={key}
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer" : undefined}
                    className="font-medium text-[#4659c8] underline-offset-2 hover:underline"
                >
                    {link[1]}
                </a>
            );
        }
        return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

function isMarkdownBlockStart(line: string) {
    return /^(#{1,6})\s+/.test(line)
        || /^!\[[^\]]*\]\(.+\)\s*$/.test(line)
        || /^[-*]\s+/.test(line)
        || /^\d+\.\s+/.test(line)
        || /^>\s+/.test(line)
        || /^```/.test(line)
        || /^-{3,}$/.test(line);
}

export function renderMarkdownPreview(markdown: string): React.ReactNode[] {
    const lines = markdown.split(/\r?\n/);
    const nodes: React.ReactNode[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();
        const key = `md-${index}`;

        if (!trimmed) {
            index += 1;
            continue;
        }

        if (trimmed.startsWith("```")) {
            const codeLines: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith("```")) {
                codeLines.push(lines[index]);
                index += 1;
            }
            index += 1;
            nodes.push(
                <pre key={key} className="my-3 overflow-x-auto rounded-md bg-[#111827] px-4 py-3 text-sm leading-6 text-gray-100">
                    <code>{codeLines.join("\n")}</code>
                </pre>
            );
            continue;
        }

        const image = parseMarkdownImage(trimmed);
        if (image) {
            const images: MarkdownImage[] = [];
            while (index < lines.length) {
                const parsed = parseMarkdownImage(lines[index].trim());
                if (!parsed) {
                    break;
                }
                images.push(parsed);
                index += 1;
            }
            nodes.push(
                <div key={key} className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {images.map((item, imageIndex) => (
                        <a
                            key={`${key}-image-${imageIndex}`}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group overflow-hidden rounded-md border border-gray-200 bg-gray-50 no-underline shadow-sm transition hover:border-[#556cd6]"
                        >
                            <img
                                src={item.url}
                                alt={item.alt}
                                loading="lazy"
                                className="h-32 w-full object-cover transition duration-200 group-hover:scale-[1.02] sm:h-36"
                            />
                            {item.alt &&
                                <div className="truncate px-2 py-1.5 text-xs text-gray-600">{item.alt}</div>
                            }
                        </a>
                    ))}
                </div>
            );
            continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            const className = level <= 2
                ? "mb-3 mt-5 text-xl font-semibold text-gray-950"
                : "mb-2 mt-4 text-base font-semibold text-gray-900";
            nodes.push(
                <div key={key} className={className}>
                    {renderInlineMarkdown(heading[2], key)}
                </div>
            );
            index += 1;
            continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
            const items: React.ReactNode[] = [];
            while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
                const itemText = lines[index].trim().replace(/^[-*]\s+/, "");
                items.push(<li key={`li-${index}`}>{renderInlineMarkdown(itemText, `li-${index}`)}</li>);
                index += 1;
            }
            nodes.push(<ul key={key} className="my-3 list-disc space-y-1 pl-6">{items}</ul>);
            continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            const items: React.ReactNode[] = [];
            while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
                const itemText = lines[index].trim().replace(/^\d+\.\s+/, "");
                items.push(<li key={`oli-${index}`}>{renderInlineMarkdown(itemText, `oli-${index}`)}</li>);
                index += 1;
            }
            nodes.push(<ol key={key} className="my-3 list-decimal space-y-1 pl-6">{items}</ol>);
            continue;
        }

        if (/^>\s+/.test(trimmed)) {
            const quoteLines: string[] = [];
            while (index < lines.length && /^>\s+/.test(lines[index].trim())) {
                quoteLines.push(lines[index].trim().replace(/^>\s+/, ""));
                index += 1;
            }
            nodes.push(
                <blockquote key={key} className="my-3 border-l-4 border-[#556cd6] bg-[#f6f7fb] px-4 py-3 text-gray-700">
                    {quoteLines.map((quoteLine, quoteIndex) => (
                        <p key={`quote-${quoteIndex}`} className="mb-1 last:mb-0">
                            {renderInlineMarkdown(quoteLine, `${key}-quote-${quoteIndex}`)}
                        </p>
                    ))}
                </blockquote>
            );
            continue;
        }

        if (/^-{3,}$/.test(trimmed)) {
            nodes.push(<Divider key={key} className="my-4"/>);
            index += 1;
            continue;
        }

        const paragraphLines = [trimmed];
        index += 1;
        while (index < lines.length) {
            const nextLine = lines[index].trim();
            if (!nextLine || isMarkdownBlockStart(nextLine)) {
                break;
            }
            paragraphLines.push(nextLine);
            index += 1;
        }
        const paragraph = paragraphLines.join(" ");
        nodes.push(
            <p key={key} className="mb-3 leading-7 text-gray-800">
                {renderInlineMarkdown(paragraph, key)}
            </p>
        );
    }

    return nodes;
}

export function stripMarkdown(markdown: string) {
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/(^|\s)[#>*`_-]+/g, " ")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

type MarkdownPreviewProps = {
    markdown: string,
    emptyText?: string,
};

const MarkdownPreview = ({markdown, emptyText}: MarkdownPreviewProps) => (
    <>
        {markdown
            ? renderMarkdownPreview(markdown)
            : emptyText
                ? <p className="text-sm text-slate-500">{emptyText}</p>
                : null
        }
    </>
);

export default MarkdownPreview;
