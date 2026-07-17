"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { VoiceMessageBubble } from "@/components/VoiceMessageBubble";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import {
  isSystemMessage,
  isVoiceMessage,
} from "@/lib/system-messages";
import type { ChatMessage } from "@/lib/types";

type ChatPanelProps = {
  messages: ChatMessage[];
  onSendText: (content: string) => void | Promise<void>;
  onSendVoice: (blob: Blob, durationMs: number) => void | Promise<void>;
  currentUserName?: string;
  disabled?: boolean;
  error?: string | null;
};

export function ChatPanel({
  messages,
  onSendText,
  onSendVoice,
  disabled = false,
  error = null,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();
    if (!content || voiceBusy || disabled || sending) {
      return;
    }

    setSending(true);
    try {
      await onSendText(content);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  async function handleSendVoice(blob: Blob, durationMs: number) {
    if (disabled || sending) {
      return;
    }
    setSending(true);
    try {
      await onSendVoice(blob, durationMs);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex h-[420px] flex-col rounded-2xl border border-border bg-surface-elevated">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Room chat
        </h2>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">No messages yet. Say hello.</p>
        ) : (
          messages.map((message) =>
            isSystemMessage(message) ? (
              <article
                key={message.id}
                className="rounded-lg border border-border/50 bg-black/15 px-3 py-2 text-center"
              >
                <p className="text-xs leading-relaxed text-muted">
                  {message.content}
                </p>
                <time className="mt-1 block text-[10px] tabular-nums text-muted/70">
                  {message.timestamp}
                </time>
              </article>
            ) : (
              <article key={message.id} className="text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {message.author}
                  </span>
                  <span className="text-xs text-muted">{message.timestamp}</span>
                </div>
                {isVoiceMessage(message) ? (
                  <VoiceMessageBubble
                    messageId={message.id}
                    audioUrl={message.audioUrl}
                    durationMs={message.audioDurationMs}
                  />
                ) : (
                  <p className="text-muted">{message.content}</p>
                )}
              </article>
            ),
          )
        )}
      </div>

      {error ? (
        <p className="border-t border-border px-4 pt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex items-center gap-2 border-t border-border p-4"
      >
        {!voiceBusy ? (
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message the room..."
            disabled={disabled || sending}
            className="min-w-0 flex-1 rounded-full border border-border bg-black/20 px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
          />
        ) : null}

        <div className={voiceBusy ? "min-w-0 flex-1" : "shrink-0"}>
          <VoiceRecorder
            onSend={(blob, durationMs) => void handleSendVoice(blob, durationMs)}
            onBusyChange={setVoiceBusy}
            disabled={disabled || sending}
          />
        </div>

        {!voiceBusy ? (
          <button
            type="submit"
            disabled={disabled || sending}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:bg-accent-hover disabled:opacity-50"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        ) : null}
      </form>
    </section>
  );
}
