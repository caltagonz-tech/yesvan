"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type FeedbackModeCtx = {
  feedbackMode: boolean;
  toggleFeedbackMode: () => void;
};

const FeedbackModeContext = createContext<FeedbackModeCtx>({
  feedbackMode: false,
  toggleFeedbackMode: () => {},
});

export function FeedbackModeProvider({ children }: { children: ReactNode }) {
  const [feedbackMode, setFeedbackMode] = useState(false);

  // Persist across page navigations
  useEffect(() => {
    const stored = localStorage.getItem("feedbackMode");
    if (stored === "true") setFeedbackMode(true);
  }, []);

  function toggleFeedbackMode() {
    setFeedbackMode(prev => {
      localStorage.setItem("feedbackMode", String(!prev));
      return !prev;
    });
  }

  return (
    <FeedbackModeContext.Provider value={{ feedbackMode, toggleFeedbackMode }}>
      {children}
    </FeedbackModeContext.Provider>
  );
}

export function useFeedbackMode() {
  return useContext(FeedbackModeContext);
}
