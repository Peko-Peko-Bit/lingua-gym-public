"use client";

import { InputMode } from "@/types";
import { X, Headphones, PenLine } from "lucide-react";

interface MobileSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  inputMode: InputMode;
  onSetInputMode: (mode: InputMode) => void;
  disableListeningDictation: boolean;
}

export default function MobileSettingsSheet({
  isOpen, onClose, inputMode, onSetInputMode, disableListeningDictation,
}: MobileSettingsSheetProps) {
  const modes: { id: InputMode; label: string; icon?: React.ReactNode }[] = [
    { id: "comprehension", label: "Comprehension" },
    { id: "phrasing",      label: "Phrasing" },
    { id: "listening",     label: "Listening", icon: <Headphones className="w-3.5 h-3.5" /> },
    { id: "dictation",     label: "Dictation", icon: <PenLine className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      )}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 rounded-t-2xl shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Settings</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Input mode */}
          <div>
            <p className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">Input Mode</p>
            <div className="grid grid-cols-2 gap-1.5">
              {modes.map(mode => {
                const isDisabled = disableListeningDictation && (mode.id === "listening" || mode.id === "dictation");
                const isActive = inputMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    disabled={isDisabled}
                    onClick={() => { onSetInputMode(mode.id); onClose(); }}
                    title={isDisabled ? "Listening/Dictation is not available in Phrasing drill" : undefined}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                      isDisabled
                        ? "text-gray-300 dark:text-zinc-600 bg-gray-50 dark:bg-zinc-800 border-transparent cursor-not-allowed"
                        : isActive
                          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50"
                          : "bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-transparent hover:border-gray-200 dark:hover:border-zinc-700"
                    }`}
                  >
                    {mode.icon}
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
