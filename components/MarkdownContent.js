"use client";

const INLINE_MARKDOWN_PATTERN_SOURCE =
  "(`[^`]+`|\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*\\s][^*]*\\*|_[^_\\s][^_]*_|\\[[^\\]]+\\]\\([^)]+\\)|https?:\\/\\/[^\\s<]+|mailto:[^\\s<]+|tel:[^\\s<]+|[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,})";

const BLOCK_MATCHERS = {
  codeFence: /^```(\w+)?\s*$/,
  heading: /^(#{1,3})\s+(.+)$/,
  unorderedListItem: /^\s*[-*+]\s+(.+)$/,
  orderedListItem: /^\s*\d+[.)]\s+(.+)$/,
};

function isSafeUrl(url) {
  return /^(https?:|mailto:|tel:)/i.test(url);
}

function splitTrailingPunctuation(value) {
  const match = value.match(/^(.+?)([.,!?;:]+)?$/);

  return {
    body: match?.[1] || value,
    trailing: match?.[2] || "",
  };
}

function getAutoLinkHref(value) {
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(value)) {
    return `mailto:${value}`;
  }

  return isSafeUrl(value) ? value : "";
}

function formatAutoLinkLabel(value) {
  if (value.startsWith("mailto:")) {
    return value.slice("mailto:".length);
  }

  if (value.startsWith("tel:")) {
    return value.slice("tel:".length);
  }

  try {
    const url = new URL(value);
    const label = `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
    return label.length > 44 ? `${label.slice(0, 41)}...` : label;
  } catch {
    return value;
  }
}

function renderMarkdownLink(token, key) {
  const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  const label = linkMatch?.[1] || token;
  const href = linkMatch?.[2] || "";

  if (!isSafeUrl(href)) {
    return label;
  }

  return (
    <a key={key} href={href} target="_blank" rel="noreferrer">
      {renderInlineMarkdown(label, `${key}-link`)}
    </a>
  );
}

function renderAutoLink(token, key) {
  const { body, trailing } = splitTrailingPunctuation(token);
  const href = getAutoLinkHref(body);

  if (!href) {
    return token;
  }

  return [
    <a key={key} href={href} target="_blank" rel="noreferrer" title={body}>
      {formatAutoLinkLabel(body)}
    </a>,
    trailing,
  ].filter(Boolean);
}

function renderInlineToken(token, key) {
  if (token.startsWith("`")) {
    return <code key={key}>{token.slice(1, -1)}</code>;
  }

  if (token.startsWith("**") || token.startsWith("__")) {
    return (
      <strong key={key}>
        {renderInlineMarkdown(token.slice(2, -2), `${key}-strong`)}
      </strong>
    );
  }

  if (token.startsWith("*") || token.startsWith("_")) {
    return (
      <em key={key}>
        {renderInlineMarkdown(token.slice(1, -1), `${key}-em`)}
      </em>
    );
  }

  if (token.startsWith("[")) {
    return renderMarkdownLink(token, key);
  }

  return renderAutoLink(token, key);
}

function renderInlineMarkdown(text, keyPrefix) {
  const inlinePattern = new RegExp(INLINE_MARKDOWN_PATTERN_SOURCE, "g");
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(renderInlineToken(match[0], `${keyPrefix}-${match.index}`));
    lastIndex = inlinePattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function splitMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseCodeBlock(lines, startIndex, fenceMatch) {
  const language = fenceMatch[1] || "";
  const codeLines = [];
  let index = startIndex + 1;

  while (index < lines.length && !BLOCK_MATCHERS.codeFence.test(lines[index])) {
    codeLines.push(lines[index]);
    index += 1;
  }

  return {
    block: { type: "code", language, content: codeLines.join("\n") },
    nextIndex: index + 1,
  };
}

function parseTableBlock(lines, startIndex) {
  const headers = splitMarkdownTableRow(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;

  while (index < lines.length && lines[index].trim().startsWith("|")) {
    rows.push(splitMarkdownTableRow(lines[index]));
    index += 1;
  }

  return {
    block: { type: "table", headers, rows },
    nextIndex: index,
  };
}

function parseListBlock(lines, startIndex, type, matcher) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const itemMatch = lines[index].match(matcher);
    if (!itemMatch) {
      break;
    }

    items.push(itemMatch[1]);
    index += 1;
  }

  return {
    block: { type, items },
    nextIndex: index,
  };
}

function isParagraphBoundary(line) {
  return (
    !line.trim() ||
    BLOCK_MATCHERS.codeFence.test(line) ||
    BLOCK_MATCHERS.heading.test(line) ||
    BLOCK_MATCHERS.unorderedListItem.test(line) ||
    BLOCK_MATCHERS.orderedListItem.test(line)
  );
}

function parseParagraphBlock(lines, startIndex) {
  const paragraphLines = [];
  let index = startIndex;

  while (index < lines.length && !isParagraphBoundary(lines[index])) {
    paragraphLines.push(lines[index].trim());
    index += 1;
  }

  return {
    block: { type: "paragraph", content: paragraphLines.join(" ") },
    nextIndex: index,
  };
}

function parseMarkdownBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(BLOCK_MATCHERS.codeFence);
    if (fenceMatch) {
      const { block, nextIndex } = parseCodeBlock(lines, index, fenceMatch);
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    if (
      line.trim().startsWith("|") &&
      lines[index + 1] &&
      isMarkdownTableSeparator(lines[index + 1])
    ) {
      const { block, nextIndex } = parseTableBlock(lines, index);
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    const headingMatch = line.match(BLOCK_MATCHERS.heading);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (BLOCK_MATCHERS.unorderedListItem.test(line)) {
      const { block, nextIndex } = parseListBlock(
        lines,
        index,
        "ul",
        BLOCK_MATCHERS.unorderedListItem,
      );
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    if (BLOCK_MATCHERS.orderedListItem.test(line)) {
      const { block, nextIndex } = parseListBlock(
        lines,
        index,
        "ol",
        BLOCK_MATCHERS.orderedListItem,
      );
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    const { block, nextIndex } = parseParagraphBlock(lines, index);
    blocks.push(block);
    index = nextIndex;
  }

  return blocks;
}

function CodeBlock({ block }) {
  return (
    <pre>
      {block.language ? <span>{block.language}</span> : null}
      <code>{block.content}</code>
    </pre>
  );
}

function HeadingBlock({ block, blockIndex }) {
  const HeadingTag = `h${Math.min(block.level + 2, 5)}`;

  return (
    <HeadingTag>
      {renderInlineMarkdown(block.content, `heading-${blockIndex}`)}
    </HeadingTag>
  );
}

function TableBlock({ block, blockIndex }) {
  return (
    <div className="markdown-table-wrap">
      <table>
        <thead>
          <tr>
            {block.headers.map((header, headerIndex) => (
              <th key={`head-${blockIndex}-${headerIndex}`}>
                {renderInlineMarkdown(header, `head-${blockIndex}-${headerIndex}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={`row-${blockIndex}-${rowIndex}`}>
              {block.headers.map((_, cellIndex) => (
                <td key={`cell-${blockIndex}-${rowIndex}-${cellIndex}`}>
                  {renderInlineMarkdown(
                    row[cellIndex] || "",
                    `cell-${blockIndex}-${rowIndex}-${cellIndex}`,
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListBlock({ block, blockIndex }) {
  const ListTag = block.type;

  return (
    <ListTag>
      {block.items.map((item, itemIndex) => (
        <li key={`item-${blockIndex}-${itemIndex}`}>
          {renderInlineMarkdown(item, `item-${blockIndex}-${itemIndex}`)}
        </li>
      ))}
    </ListTag>
  );
}

function ParagraphBlock({ block, blockIndex }) {
  return (
    <p>{renderInlineMarkdown(block.content, `block-${blockIndex}`)}</p>
  );
}

function MarkdownBlock({ block, blockIndex }) {
  switch (block.type) {
    case "code":
      return <CodeBlock block={block} />;
    case "heading":
      return <HeadingBlock block={block} blockIndex={blockIndex} />;
    case "table":
      return <TableBlock block={block} blockIndex={blockIndex} />;
    case "ul":
    case "ol":
      return <ListBlock block={block} blockIndex={blockIndex} />;
    default:
      return <ParagraphBlock block={block} blockIndex={blockIndex} />;
  }
}

export function MarkdownContent({ content }) {
  const blocks = parseMarkdownBlocks(content || "");

  return (
    <div className="markdown-content">
      {blocks.map((block, blockIndex) => (
        <MarkdownBlock
          key={`block-${blockIndex}`}
          block={block}
          blockIndex={blockIndex}
        />
      ))}
    </div>
  );
}
