import type { Room } from "./types";

/** Public rooms start empty — search YouTube to begin playback. */
export const MOCK_ROOMS: Room[] = [
  {
    id: "lofi-night",
    name: "Late Night Lo-Fi",
    description: "Chill beats to study and relax together.",
    listenerCount: 24,
    isPrivate: false,
    genre: "Lo-Fi",
    host: "maya_beats",
    currentTrack: null,
    queue: [],
    participants: [
      { id: "1", name: "maya_beats", avatarColor: "#a78bfa", isHost: true },
      { id: "2", name: "vinyl_river", avatarColor: "#fb7185" },
      { id: "3", name: "echo_lane", avatarColor: "#38bdf8" },
      { id: "4", name: "duskfolio", avatarColor: "#fbbf24" },
    ],
    messages: [
      {
        id: "m1",
        author: "system",
        kind: "system",
        content: "No song yet — search YouTube to start the room.",
        timestamp: "22:14",
      },
    ],
  },
  {
    id: "indie-discovery",
    name: "Indie Discovery Hour",
    description: "Share hidden gems and vote the next track.",
    listenerCount: 18,
    isPrivate: false,
    genre: "Indie",
    host: "atlas_tones",
    currentTrack: null,
    queue: [],
    participants: [
      { id: "1", name: "atlas_tones", avatarColor: "#34d399", isHost: true },
      { id: "2", name: "june_static", avatarColor: "#f472b6" },
      { id: "3", name: "fieldnotes", avatarColor: "#60a5fa" },
    ],
    messages: [],
  },
  {
    id: "synth-wave",
    name: "Neon Synth Cruise",
    description: "Retro synthwave for late drives.",
    listenerCount: 41,
    isPrivate: false,
    genre: "Synthwave",
    host: "pulse_77",
    currentTrack: null,
    queue: [],
    participants: [
      { id: "1", name: "pulse_77", avatarColor: "#c084fc", isHost: true },
      { id: "2", name: "retrogrid", avatarColor: "#22d3ee" },
      { id: "3", name: "nightshift", avatarColor: "#f87171" },
    ],
    messages: [],
  },
  {
    id: "jazz-lounge",
    name: "Velvet Jazz Lounge",
    description: "Smooth jazz and conversation.",
    listenerCount: 12,
    isPrivate: false,
    genre: "Jazz",
    host: "blue_cedar",
    currentTrack: null,
    queue: [],
    participants: [
      { id: "1", name: "blue_cedar", avatarColor: "#818cf8", isHost: true },
      { id: "2", name: "sable_keys", avatarColor: "#e879f9" },
    ],
    messages: [],
  },
];

export const DEFAULT_GENRES = [
  "Lo-Fi",
  "Indie",
  "Synthwave",
  "Jazz",
  "Electronic",
  "Hip-Hop",
  "Rock",
  "Pop",
];
