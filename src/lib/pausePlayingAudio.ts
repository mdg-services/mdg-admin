/**
 * Pause every voice note or recording that is playing on the page. Returns true
 * if one was.
 *
 * Called before the mic opens: a note left playing ran on into the new recording
 * through the phone's speaker, and on some phones held the audio system in
 * playback while the mic was asked to start. The team app plays sound from more
 * than one place (chat voice notes, call recordings, lead recordings), so this
 * looks at every audio player on the page rather than at one of them.
 */
export function pauseAllVoiceNotes(): boolean {
  if (typeof document === 'undefined') return false;
  let paused = false;
  document.querySelectorAll('audio').forEach((el) => {
    if (el.paused) return;
    try {
      el.pause();
      paused = true;
    } catch {
      /* an element already torn down has nothing to pause */
    }
  });
  return paused;
}
