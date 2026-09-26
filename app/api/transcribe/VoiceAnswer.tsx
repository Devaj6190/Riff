"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase/client";
import type { AnswerPayloads, Round, TranscribeResponse } from "../../../lib/types";

type Props = {
  round: Round;
  playerId: string;
  submitted: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: AnswerPayloads["voice"]) => Promise<void>;
};

const RECORDING_LIMIT_MS = 45_000;
const MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

function recordingFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIMES) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.includes("webm") ? "webm" : mime.includes("mp4") ? "mp4" : "ogg" };
  }
  return null;
}

/** Media-lane answer UI, ready to register under the `voice` mechanic. */
export function VoiceAnswer({ round, playerId, submitted, busy, error, onSubmit }: Props) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);

  useEffect(() => () => {
    attempt.current++;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function stop() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function typeInstead() {
    attempt.current++;
    stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
    setProcessing(false);
    setRecordError(null);
    setTyping(true);
  }

  async function start() {
    setRecordError(null);
    const format = recordingFormat();
    const remaining = new Date(round.ends_at).getTime() - Date.now() - 5_000;
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      setRecordError("Recording isn't available here. Type your answer instead.");
      return;
    }
    if (remaining < 1_000) {
      setRecordError("Not enough time to record. Type your answer instead.");
      return;
    }
    const thisAttempt = ++attempt.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (thisAttempt !== attempt.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      const timeLeft = new Date(round.ends_at).getTime() - Date.now() - 5_000;
      if (timeLeft < 1_000) {
        media.getTracks().forEach((track) => track.stop());
        setRecordError("Not enough time to record. Type your answer instead.");
        return;
      }
      stream.current = media;
      const next = new MediaRecorder(media, { mimeType: format.mime });
      const chunks: Blob[] = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        if (thisAttempt !== attempt.current) return;
        setRecording(false);
        setProcessing(true);
        try {
          const file = new File(chunks, `answer.${format.ext}`, { type: format.mime.split(";")[0] });
          if (!file.size) throw new Error("No audio was captured. Type your answer instead.");
          const db = supabase();
          const { data: { session } } = await db.auth.getSession();
          if (!session) throw new Error("Your session expired. Type your answer instead.");
          const path = `${round.riff_id}/${round.id}/${playerId}.${format.ext}`;
          // The transcript is what gets judged; a failed upload (e.g. a re-record hitting the existing object,
          // which RLS won't let us overwrite) just means no audioPath.
          const { error: uploadError } = await db.storage.from("voice").upload(path, file, { contentType: file.type });
          const audioPath = uploadError ? undefined : path;
          if (thisAttempt !== attempt.current) return;
          const form = new FormData();
          form.set("riffId", round.riff_id);
          form.set("audio", file);
          const response = await fetch("/api/transcribe", {
            method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form,
          });
          if (!response.ok) throw new Error("Transcription failed. Type your answer instead.");
          const { transcript } = await response.json() as TranscribeResponse;
          if (thisAttempt === attempt.current) await onSubmit({ transcript, audioPath });
        } catch (cause) {
          if (thisAttempt === attempt.current) setRecordError(cause instanceof Error ? cause.message : "Recording failed. Type your answer instead.");
        } finally {
          if (thisAttempt === attempt.current) setProcessing(false);
        }
      };
      next.onerror = () => {
        if (thisAttempt === attempt.current) {
          attempt.current++;
          setRecordError("Recording failed. Type your answer instead.");
          setRecording(false);
        }
        stop();
      };
      recorder.current = next;
      next.start();
      setRecording(true);
      stopTimer.current = setTimeout(stop, Math.min(RECORDING_LIMIT_MS, timeLeft));
    } catch {
      if (thisAttempt === attempt.current) setRecordError("Microphone access failed. Type your answer instead.");
      stream.current?.getTracks().forEach((track) => track.stop());
    }
  }

  if (round.mechanic !== "voice") return null;
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-4">
      <p className="text-lg font-semibold">{round.payload.prompt}</p>
      {submitted ? <p>Answer sent.</p> : (
        <>
          {!typing && (
            <button type="button" onClick={recording ? stop : start} disabled={busy || processing}
              className="min-h-12 rounded-full bg-foreground px-6 font-semibold text-background disabled:opacity-40">
              {processing ? "Transcribing…" : recording ? "Stop recording" : "Record answer"}
            </button>
          )}
          {recording && <p role="status">Recording… up to 45 seconds. Stop early to leave time for transcription.</p>}
          <button type="button" onClick={typeInstead} disabled={busy}
            className="min-h-12 rounded-full border border-current/20 px-6 font-semibold disabled:opacity-40">
            Type instead
          </button>
          {typing && (
            <form onSubmit={(event) => { event.preventDefault(); if (typed.trim()) void onSubmit({ transcript: typed.trim() }); }} className="flex flex-col gap-3">
              <textarea aria-label="Your answer" value={typed} onChange={(event) => setTyped(event.target.value)}
                maxLength={2000} className="min-h-28 rounded-xl border border-current/20 p-3" />
              <button type="submit" disabled={busy || !typed.trim()} className="min-h-12 rounded-full bg-foreground px-6 font-semibold text-background disabled:opacity-40">
                Send answer
              </button>
            </form>
          )}
        </>
      )}
      {(recordError || error) && <p role="alert" className="text-sm text-red-500">{recordError || error}</p>}
    </div>
  );
}
