export type Message = { role: "user" | "ai"; text: string };
export type View = { title: string; url: string; note: string };
export type ImageResult = { title: string; image: string; thumbnail?: string; source?: string };

export type LocalFile = { name: string; path: string; handle: FileSystemFileHandle };
export type DirectoryHandle = FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>;

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { results: { [key: number]: { [key: number]: { transcript?: string } } } }) => void) | null;
  start: () => void;
  stop: () => void;
};
