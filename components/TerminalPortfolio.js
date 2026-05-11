"use client";

import { useEffect, useState } from "react";

const personas = [
  { value: "default", label: "Friendly Assistant" },
  { value: "medieval", label: "Medieval Assistant" },
  { value: "pirate", label: "Pirate Assistant" },
];

const themes = [
  { value: "default", label: "Default" },
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
      <p>{message.content}</p>
    </div>
  );
}

export function TerminalPortfolio() {
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [persona, setPersona] = useState("default");
  const [theme, setTheme] = useState("default");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("portfolio-theme");
    if (themes.some((item) => item.value === savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme =
      theme === "light" ? "light" : "dark";
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
            onChange={(event) => setInputValue(event.target.value)}
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
