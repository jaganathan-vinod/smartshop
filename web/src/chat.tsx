import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { chatPaneVisible, storeLocationKey } from "./chatPaths";

type ChatChrome = {
  open: boolean;
  paneVisible: boolean;
  lastStorePath: string;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
};

const ChatContext = createContext<ChatChrome | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [lastStorePath, setLastStorePath] = useState("/");

  useEffect(() => {
    const next = storeLocationKey(location.pathname, location.search);
    if (next) {
      setLastStorePath(next);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!user) {
      setOpen(false);
    }
  }, [user]);

  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => setOpen(false), []);
  const toggleChat = useCallback(() => setOpen((current) => !current), []);

  const paneVisible = chatPaneVisible({
    open,
    signedIn: Boolean(user),
    pathname: location.pathname,
  });

  const value = useMemo(
    () => ({
      open,
      paneVisible,
      lastStorePath,
      openChat,
      closeChat,
      toggleChat,
    }),
    [open, paneVisible, lastStorePath, openChat, closeChat, toggleChat],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatChrome {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return value;
}
