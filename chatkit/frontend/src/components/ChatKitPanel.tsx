import { ChatKit, useChatKit } from "@openai/chatkit-react";
import {
  CHATKIT_API_DOMAIN_KEY,
  CHATKIT_LOCALE,
  CHATKIT_API_URL,
  CHATKIT_TEMPORARY_API_URL,
} from "../lib/config";

type Theme = "light" | "dark";

interface ChatKitPanelProps {
  theme: Theme;
  onDeleteAll: () => Promise<void>;
  mode: "persistent" | "temporary";
  initialThread: string | null;
  onThreadChange: (threadId: string | null) => void;
  active: boolean;
}

export function ChatKitPanel({
  theme,
  onDeleteAll,
  mode,
  initialThread,
  onThreadChange,
  active,
}: ChatKitPanelProps) {
  const chatkit = useChatKit({
    api: {
      url: mode === "temporary" ? CHATKIT_TEMPORARY_API_URL : CHATKIT_API_URL,
      domainKey: CHATKIT_API_DOMAIN_KEY,
      uploadStrategy: {
        type: "two_phase",
      },
    },
    theme,
    locale: CHATKIT_LOCALE,
    initialThread,
    onChatkitThreadChange: ({ threadId }) => {
      onThreadChange(typeof threadId === "string" ? threadId : null);
    },
    header: {
      ...(mode === "persistent"
        ? {
          rightAction: {
            icon: "close" as const,
            onClick: () => {
              void onDeleteAll();
            },
          },
        }
        : {}),
    },
    history: {
      enabled: mode === "persistent",
      showDelete: mode === "persistent",
    },
    composer: {
      attachments: {
        enabled: true,
      },
    },
  });

  return (
    <div className={`${active ? "flex" : "hidden"} relative h-full w-full flex-col overflow-hidden bg-white shadow-sm transition-colors dark:bg-slate-900`}>
      <ChatKit
        control={chatkit.control}
        className="block h-full w-full"
      />
    </div>
  );
}
