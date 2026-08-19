import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { CHATKIT_API_DOMAIN_KEY, CHATKIT_API_URL } from "../lib/config";

type Theme = "light" | "dark";

interface ChatKitPanelProps {
  theme: Theme;
}

export function ChatKitPanel({ theme }: ChatKitPanelProps) {
  const chatkit = useChatKit({
    api: {
      url: CHATKIT_API_URL,
      domainKey: CHATKIT_API_DOMAIN_KEY,
      uploadStrategy: {
        type: "two_phase",
      },
    },
    theme,
    composer: {
      attachments: {
        enabled: true,
      },
    },
  });

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-sm transition-colors dark:bg-slate-900">
      <ChatKit
        control={chatkit.control}
        className="block h-full w-full"
      />
    </div>
  );
}
