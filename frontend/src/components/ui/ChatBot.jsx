import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, Loader2, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

const WELCOME =
  "Hi! I'm your ITMS Assistant. Ask me anything about using this portal — adding devices, generating QR codes, importing data, running reports, and more.";

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: WELCOME },
  ]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);

    try {
      const payload = next.filter(
        (m) => m.role !== "assistant" || m.content !== WELCOME,
      );
      const { reply } = await api.post("/api/chat", { messages: payload });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I couldn't reach the AI service. ${e.message || ""}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clear() {
    setMessages([{ role: "assistant", content: WELCOME }]);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="position-fixed rounded-circle shadow-lg d-flex align-items-center justify-content-center border-0 text-white"
        style={{
          bottom: 24,
          right: 24,
          zIndex: 1050,
          width: 52,
          height: 52,
          background: "var(--brand)",
          transition: "transform 0.2s, background 0.2s",
          transform: open ? "rotate(90deg)" : "none",
        }}
        title="ITMS Assistant"
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--brand-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--brand)")
        }
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="position-fixed d-flex flex-column rounded-3 shadow-lg overflow-hidden"
          style={{
            bottom: 88,
            right: 24,
            zIndex: 1050,
            width: 320,
            height: 460,
            background: "var(--card-bg)",
            border: "1px solid var(--bs-border-color)",
          }}
        >
          {/* Header */}
          <div
            className="d-flex align-items-center gap-2 px-3 py-2 border-bottom flex-shrink-0"
            style={{ background: "var(--surface-subtle)" }}
          >
            <div
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 28, height: 28, background: "var(--brand)" }}
            >
              <Bot size={15} className="text-white" />
            </div>
            <div className="flex-grow-1 min-w-0">
              <p
                className="fw-semibold mb-0 lh-1"
                style={{ fontSize: "0.875rem" }}
              >
                ITMS Assistant
              </p>
              <p
                className="mb-0 mt-0"
                style={{ fontSize: "10px", color: "#4ade80" }}
              >
                ● Online · Powered by Groq
              </p>
            </div>
            <button
              onClick={clear}
              className="btn btn-link text-secondary p-0"
              title="Clear chat"
              style={{ lineHeight: 1 }}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-grow-1 overflow-auto px-3 py-3 d-flex flex-column gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "d-flex gap-2",
                  m.role === "user"
                    ? "justify-content-end"
                    : "justify-content-start",
                )}
              >
                {m.role === "assistant" && (
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 mt-1"
                    style={{
                      width: 24,
                      height: 24,
                      background: "var(--brand)",
                    }}
                  >
                    <Bot size={12} className="text-white" />
                  </div>
                )}
                <div
                  className="rounded-3 px-3 py-2 small lh-base"
                  style={{
                    maxWidth: "85%",
                    whiteSpace: "pre-wrap",
                    background:
                      m.role === "user"
                        ? "var(--brand)"
                        : "var(--surface-overlay)",
                    color: m.role === "user" ? "#fff" : "inherit",
                    borderRadius:
                      m.role === "user"
                        ? "0.75rem 0.75rem 0.25rem 0.75rem"
                        : "0.75rem 0.75rem 0.75rem 0.25rem",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="d-flex gap-2 justify-content-start">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 mt-1"
                  style={{ width: 24, height: 24, background: "var(--brand)" }}
                >
                  <Bot size={12} className="text-white" />
                </div>
                <div
                  className="rounded-3 px-3 py-2 d-flex align-items-center gap-1"
                  style={{
                    background: "var(--surface-overlay)",
                    borderRadius: "0.75rem 0.75rem 0.75rem 0.25rem",
                  }}
                >
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="rounded-circle bounce-dot"
                      style={{
                        width: 6,
                        height: 6,
                        background: "#71717a",
                        display: "inline-block",
                        animationDelay: `${delay}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3 pt-2 border-top">
            <div
              className="d-flex align-items-end gap-2 rounded-3 px-3 py-2"
              style={{ background: "var(--surface-input)" }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Ask me anything…"
                rows={1}
                className="flex-grow-1 bg-transparent border-0 small text-body"
                style={{
                  outline: "none",
                  resize: "none",
                  maxHeight: 96,
                  minHeight: 24,
                  lineHeight: 1.5,
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 d-flex align-items-center justify-content-center rounded-2 border-0"
                style={{
                  width: 28,
                  height: 28,
                  background:
                    input.trim() && !loading
                      ? "var(--brand)"
                      : "var(--surface-overlay)",
                  color: input.trim() && !loading ? "#fff" : "#71717a",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                }}
              >
                {loading ? (
                  <Loader2
                    size={13}
                    className="spin"
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <Send size={13} />
                )}
              </button>
            </div>
            <p
              className="text-center text-secondary mt-1 mb-0"
              style={{ fontSize: "9px" }}
            >
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}
