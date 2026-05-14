"use client";

import { useEffect, useRef, useState } from "react";

const personas = [
  { value: "default", label: "Friendly Assistant" },
  { value: "medieval", label: "Medieval Assistant" },
  { value: "pirate", label: "Pirate Assistant" },
];

const themes = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const initialMessages = [
  {
    id: "system-welcome",
    role: "system",
    kind: "welcome",
  },
];

const slashCommandHelp = [
  "/help - Show available slash commands.",
  "/clear - Clear the terminal output.",
  "/download - Download the resume PDF.",
  "/history - Show your recent commands and questions.",
  "/persona [default|medieval|pirate] - Switch assistant persona.",
  "/theme [system|dark|light] - Switch interface theme.",
];

function createSystemMessage(content) {
  return {
    id: `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "system",
    content,
  };
}

function formatOptionValues(options) {
  return options.map((item) => item.value).join(", ");
}

function findOption(options, value) {
  return options.find((item) => item.value === value);
}

function triggerResumeDownload() {
  const downloadLink = document.createElement("a");
  downloadLink.href = "/api/resume";
  downloadLink.download = "Resume.pdf";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}

const asciiArt = String.raw`
    █████████                                 █████     ███              ███████████                      █████       ██████           ████   ███
  ███░░░░░███                               ░░███     ░░░              ░░███░░░░░███                    ░░███       ███░░███         ░░███  ░░░
 ░███    ░███   ███████  ██████  ████████   ███████   ████   ██████     ░███    ░███  ██████  ████████  ███████    ░███ ░░░   ██████  ░███  ████   ██████
 ░███████████  ███░░███ ███░░███░░███░░███ ░░░███░   ░░███  ███░░███    ░██████████  ███░░███░░███░░███░░░███░    ███████    ███░░███ ░███ ░░███  ███░░███
 ░███░░░░░███ ░███ ░███░███████  ░███ ░███   ░███     ░███ ░███ ░░░     ░███░░░░░░  ░███ ░███ ░███ ░░░   ░███    ░░░███░    ░███ ░███ ░███  ░███ ░███ ░███
 ░███    ░███ ░███ ░███░███░░░   ░███ ░███   ░███ ███ ░███ ░███  ███    ░███        ░███ ░███ ░███       ░███ ███  ░███     ░███ ░███ ░███  ░███ ░███ ░███
 █████   █████░░███████░░██████  ████ █████  ░░█████  █████░░██████     █████       ░░██████  █████      ░░█████   █████    ░░██████  █████ █████░░██████
░░░░░   ░░░░░  ░░░░░███ ░░░░░░  ░░░░ ░░░░░    ░░░░░  ░░░░░  ░░░░░░     ░░░░░         ░░░░░░  ░░░░░        ░░░░░   ░░░░░      ░░░░░░  ░░░░░ ░░░░░  ░░░░░░
               ███ ░███
              ░░██████
               ░░░░░░
`;

function isSafeUrl(url) {
  return /^(https?:|mailto:|tel:)/i.test(url);
}

function renderInlineMarkdown(text, keyPrefix) {
  const parts = [];
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <strong key={key}>
          {renderInlineMarkdown(token.slice(2, -2), `${key}-strong`)}
        </strong>,
      );
    } else if (token.startsWith("*") || token.startsWith("_")) {
      parts.push(
        <em key={key}>
          {renderInlineMarkdown(token.slice(1, -1), `${key}-em`)}
        </em>,
      );
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = linkMatch?.[1] || token;
      const href = linkMatch?.[2] || "";

      parts.push(
        isSafeUrl(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {renderInlineMarkdown(label, `${key}-link`)}
          </a>
        ) : (
          label
        ),
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
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

    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] || "";
      const codeLines = [];
      index += 1;

      while (index < lines.length && !lines[index].match(/^```\s*$/)) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({
        type: "code",
        language,
        content: codeLines.join("\n"),
      });
      index += 1;
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      const items = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        index += 1;
      }

      blocks.push({ type: "ul", items });
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      const items = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        index += 1;
      }

      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].match(/^```(\w+)?\s*$/) &&
      !lines[index].match(/^\s*[-*+]\s+(.+)$/) &&
      !lines[index].match(/^\s*\d+[.)]\s+(.+)$/)
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push({ type: "paragraph", content: paragraphLines.join(" ") });
  }

  return blocks;
}

function MarkdownContent({ content }) {
  const blocks = parseMarkdownBlocks(content || "");

  return (
    <div className="markdown-content">
      {blocks.map((block, blockIndex) => {
        if (block.type === "code") {
          return (
            <pre key={`block-${blockIndex}`}>
              {block.language ? <span>{block.language}</span> : null}
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.type === "ul" || block.type === "ol") {
          const listItems = block.items.map((item, itemIndex) => (
            <li key={`item-${blockIndex}-${itemIndex}`}>
              {renderInlineMarkdown(item, `item-${blockIndex}-${itemIndex}`)}
            </li>
          ));

          return block.type === "ul" ? (
            <ul key={`block-${blockIndex}`}>{listItems}</ul>
          ) : (
            <ol key={`block-${blockIndex}`}>{listItems}</ol>
          );
        }

        return (
          <p key={`block-${blockIndex}`}>
            {renderInlineMarkdown(block.content, `block-${blockIndex}`)}
          </p>
        );
      })}
    </div>
  );
}

function WelcomeMessage() {
  return (
    <>
      <pre className="ascii-art">{asciiArt}</pre>
      <p>System initialized. RAG Vector Database online.</p>
      <p>
        Hello! I am your <strong>Agentic Portfolio Assistant</strong>. You can
        ask me anything about my creator&apos;s experience, resume, or projects.
      </p>
      <p>Type <code>/help</code> to see available terminal commands.</p>
    </>
  );
}

function MessageBubble({ message }) {
  if (message.kind === "welcome") {
    return (
      <div className="message system">
        <WelcomeMessage />
      </div>
    );
  }

  return (
    <div className={`message ${message.role}`}>
      {message.role === "agent" ? (
        <MarkdownContent content={message.content} />
      ) : (
        <p>{message.content}</p>
      )}
    </div>
  );
}

export function TerminalPortfolio() {
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [persona, setPersona] = useState("default");
  const [theme, setTheme] = useState("system");
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(null);
  const draftInputRef = useRef("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function appendSystemMessage(content) {
    setMessages((currentMessages) => [
      ...currentMessages,
      createSystemMessage(content),
    ]);
  }

  function handleSlashCommand(rawCommand, historySnapshot) {
    const [commandName = "", ...commandArgs] = rawCommand.slice(1).split(/\s+/);
    const command = commandName.toLowerCase();
    const value = commandArgs.join(" ").trim().toLowerCase();

    switch (command) {
      case "clear":
      case "cls":
        setMessages(initialMessages);
        return true;

      case "help":
      case "?":
        appendSystemMessage(`Available commands:\n${slashCommandHelp.join("\n")}`);
        return true;

      case "download":
        triggerResumeDownload();
        appendSystemMessage("Downloading resume PDF...");
        return true;

      case "history": {
        const recentHistory = historySnapshot.slice(-10);
        appendSystemMessage(
          recentHistory.length
            ? `Recent history:\n${recentHistory
                .map((item, index) => `${index + 1}. ${item}`)
                .join("\n")}`
            : "History is empty.",
        );
        return true;
      }

      case "persona": {
        if (!value) {
          appendSystemMessage(
            `Current persona: ${persona}. Options: ${formatOptionValues(
              personas,
            )}.`,
          );
          return true;
        }

        const nextPersona = findOption(personas, value);
        appendSystemMessage(
          nextPersona
            ? `Persona switched to ${nextPersona.label}.`
            : `Unknown persona "${value}". Options: ${formatOptionValues(
                personas,
              )}.`,
        );

        if (nextPersona) {
          setPersona(nextPersona.value);
        }

        return true;
      }

      case "theme": {
        if (!value) {
          appendSystemMessage(
            `Current theme: ${theme}. Options: ${formatOptionValues(themes)}.`,
          );
          return true;
        }

        const nextTheme = findOption(themes, value);
        appendSystemMessage(
          nextTheme
            ? `Theme switched to ${nextTheme.label}.`
            : `Unknown theme "${value}". Options: ${formatOptionValues(themes)}.`,
        );

        if (nextTheme) {
          setTheme(nextTheme.value);
        }

        return true;
      }

      default:
        appendSystemMessage(
          `Unknown command "/${commandName}". Type /help to see available commands.`,
        );
        return true;
    }
  }

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("portfolio-theme");
    if (savedTheme === "default") {
      setTheme("system");
      return;
    }

    if (themes.some((item) => item.value === savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme =
      theme === "system" ? "light dark" : theme;
    window.localStorage.setItem("portfolio-theme", theme);
  }, [theme]);

  async function handleSubmit(event) {
    event.preventDefault();

    const question = inputValue.trim();
    if (!question || isLoading) {
      return;
    }

    setErrorMessage("");
    setInputValue("");
    const nextCommandHistory = [...commandHistory, question];
    setCommandHistory(nextCommandHistory);
    setHistoryIndex(null);
    draftInputRef.current = "";

    if (question.startsWith("/")) {
      handleSlashCommand(question, nextCommandHistory);
      return;
    }

    setIsLoading(true);

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);

    try {
      const response = await fetch("/api/rag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question, persona }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to get an answer.");
      }

      const agentMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: payload.answer || "No answer received from the server.",
      };

      setMessages((currentMessages) => [...currentMessages, agentMessage]);
    } catch (error) {
      setErrorMessage(error.message || "Failed to get an answer.");
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `system-${Date.now()}`,
          role: "system",
          content: `Error: ${error.message || "Failed to get an answer."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleInputKeyDown(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    if (!commandHistory.length) {
      return;
    }

    event.preventDefault();

    if (event.key === "ArrowUp") {
      setHistoryIndex((currentIndex) => {
        if (currentIndex === null) {
          draftInputRef.current = inputValue;
          const nextIndex = commandHistory.length - 1;
          setInputValue(commandHistory[nextIndex]);
          return nextIndex;
        }

        const nextIndex = Math.max(0, currentIndex - 1);
        setInputValue(commandHistory[nextIndex]);
        return nextIndex;
      });
      return;
    }

    setHistoryIndex((currentIndex) => {
      if (currentIndex === null) {
        return null;
      }

      const nextIndex = currentIndex + 1;
      if (nextIndex >= commandHistory.length) {
        setInputValue(draftInputRef.current);
        return null;
      }

      setInputValue(commandHistory[nextIndex]);
      return nextIndex;
    });
  }

  function handleInputChange(event) {
    const nextValue = event.target.value;
    setInputValue(nextValue);

    if (historyIndex !== null) {
      setHistoryIndex(null);
      draftInputRef.current = nextValue;
    }
  }

  return (
    <main className="page-shell">
      <section className="terminal-container">
        <header className="terminal-header">
          <div className="controls" aria-hidden="true">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <div className="title">agentic-terminal - next.js edition</div>
          <div className="header-pickers">
            <label className="theme-picker">
              <span className="sr-only">Select interface theme</span>
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
              >
                {themes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="persona-picker">
              <span className="sr-only">Select assistant persona</span>
              <select
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
              >
                {personas.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="terminal-body">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isLoading ? (
            <div className="message agent thinking-container">
              <div className="thinking-status">
                Processing portfolio query...
              </div>
              <div className="thinking" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
        </div>

        <form className="input-wrapper" onSubmit={handleSubmit}>
          <span className="command-prefix">❯</span>
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask me something about the portfolio..."
            autoComplete="off"
          />
          <button type="submit" disabled={isLoading || !inputValue.trim()}>
            Send
          </button>
        </form>

        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
