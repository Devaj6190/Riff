"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TranscribeResponse } from "@/lib/types";

const LIMIT_MS = 60_000;
const MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

function recordingFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  return mime ? { mime, ext: mime.includes("webm") ? "webm" : mime.includes("mp4") ? "mp4" : "ogg" } : null;
}

type Props = { riffId: string; onTranscript: (text: string) => Promise<void>; onError: (message: string | null) => void };

/** Tap to record, tap again to stop. The recording is transcribed and sent as an ordinary message. */
export function VoiceButton({ riffId, onTranscript, onError }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (recorder.current) recorder.current.onstop = null; // unmounted: don't send
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    onError(null);
    const format = recordingFormat();
    if (!format || !navigator.mediaDevices?.getUserMedia) return onError("Voice messages aren't supported in this browser");
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return onError("Microphone access was blocked");
    }
    const rec = new MediaRecorder(media, { mimeType: format.mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = async () => {
      media.getTracks().forEach((t) => t.stop());
      setState("sending");
      try {
        // /api/transcribe checks the bare type, so drop the ";codecs=…" part.
        const file = new File(chunks, `voice.${format.ext}`, { type: format.mime.split(";")[0] });
        if (!file.size) throw new Error("No audio was captured");
        const { data } = await supabase().auth.getSession();
        const form = new FormData();
        form.set("riffId", riffId);
        form.set("audio", file);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
          body: form,
        });
        if (res.status === 422) throw new Error("Didn't catch any words. Try again?");
        if (!res.ok) throw new Error("Voice message didn't send");
        const { transcript } = (await res.json()) as TranscribeResponse;
        await onTranscript(transcript);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Voice message didn't send");
      } finally {
        setState("idle");
      }
    };
    recorder.current = rec;
    rec.start();
    setState("recording");
    timer.current = setTimeout(stop, LIMIT_MS);
  }

  function stop() {
    clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const label = state === "recording" ? "Stop and send voice message" : state === "sending" ? "Sending voice message" : "Record a voice message";
  return (
    <button
      type="button"
      onClick={state === "recording" ? stop : start}
      disabled={state === "sending"}
      aria-label={label}
      title={label}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full ${state === "recording" ? "animate-pulse bg-red-500 text-white" : "text-foreground/70"}`}
    >
      {state === "recording" ? <Square className="size-4 fill-current" /> : state === "sending" ? <LoaderCircle className="size-5 animate-spin" /> : <Mic className="size-5" />}
    </button>
  );
}
