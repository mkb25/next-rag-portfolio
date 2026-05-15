"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";

const RAG_API_ENDPOINT = "/api/rag";
const THEME_STORAGE_KEY = "portfolio-theme";
const DEFAULT_ERROR_MESSAGE = "Failed to get an answer.";

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
  return createMessage("system", content);
}

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function formatOptionValues(options) {
  return options.map((item) => item.value).join(", ");
}

function findOption(options, value) {
  return options.find((item) => item.value === value);
}

function isValidTheme(value) {
  return themes.some((item) => item.value === value);
}

function formatHistoryList(historyItems) {
  return historyItems.map((item, index) => `${index + 1}. ${item}`).join("\n");
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

function toApiHistory(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "agent")
    .slice(-8)
    .map((message) => ({
      role: message.role === "agent" ? "assistant" : "user",
      content: message.content,
    }));
}

export function TerminalPortfolio() {
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [persona, setPersona] = useState("default");
  const [theme, setTheme] = useState("system");
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(null);
  const draftInputRef = useRef("");
  const terminalBodyRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function appendSystemMessage(content) {
    setMessages((currentMessages) => [
      ...currentMessages,
      createSystemMessage(content),
    ]);
  }

  function showCurrentOption(name, currentValue, options) {
    appendSystemMessage(
      `Current ${name}: ${currentValue}. Options: ${formatOptionValues(options)}.`,
    );
  }

  function switchOption({ name, value, options, onChange }) {
    const nextOption = findOption(options, value);

    appendSystemMessage(
      nextOption
        ? `${name} switched to ${nextOption.label}.`
        : `Unknown ${name.toLowerCase()} "${value}". Options: ${formatOptionValues(
            options,
          )}.`,
    );

    if (nextOption) {
      onChange(nextOption.value);
    }
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
            ? `Recent history:\n${formatHistoryList(recentHistory)}`
            : "History is empty.",
        );
        return true;
      }

      case "persona": {
        if (!value) {
          showCurrentOption("persona", persona, personas);
          return true;
        }

        switchOption({
          name: "Persona",
          value,
          options: personas,
          onChange: setPersona,
        });
        return true;
      }

      case "theme": {
        if (!value) {
          showCurrentOption("theme", theme, themes);
          return true;
        }

        switchOption({
          name: "Theme",
          value,
          options: themes,
          onChange: setTheme,
        });
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
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "default") {
      setTheme("system");
      return;
    }

    if (isValidTheme(savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme =
      theme === "system" ? "light dark" : theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const terminalBody = terminalBodyRef.current;

    if (!terminalBody) {
      return;
    }

    requestAnimationFrame(() => {
      terminalBody.scrollTo({
        top: terminalBody.scrollHeight,
        behavior: "smooth",
      });
      messagesEndRef.current?.scrollIntoView({
        block: "end",
        behavior: "smooth",
      });
    });
  }, [messages, isLoading]);

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

    const userMessage = createMessage("user", question);
    const history = toApiHistory(messages);

    setMessages((currentMessages) => [...currentMessages, userMessage]);

    try {
      const response = await fetch(RAG_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question, persona, history }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || DEFAULT_ERROR_MESSAGE);
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage(
          "agent",
          payload.answer || "No answer received from the server.",
        ),
      ]);
    } catch (error) {
      const message = error.message || DEFAULT_ERROR_MESSAGE;
      setErrorMessage(message);
      setMessages((currentMessages) => [
        ...currentMessages,
        createSystemMessage(`Error: ${message}`),
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

        <div className="terminal-body" ref={terminalBodyRef}>
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
          <div ref={messagesEndRef} className="messages-end" aria-hidden="true" />
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
